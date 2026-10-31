#!/usr/bin/env node
/**
 * Cross-map Scout opcode-5 transform records to opcode-2 attachment records
 * and to the eight geometry part descriptors. This is a structural audit:
 * it reports proven pointer relationships without assigning undocumented
 * semantic names to the records.
 *
 * Usage:
 *   node tools/audit-scout-transform-attachments.mjs extracted-ff/units/scout_mj.dpc [report.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
const output = process.argv[3];
if (!input) {
  console.error('Usage: node tools/audit-scout-transform-attachments.mjs <file.dpc> [report.json]');
  process.exit(2);
}
const file = path.resolve(input);
const b = fs.readFileSync(file);
if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) {
  throw new Error('Expected a DCPMC resource: ' + file);
}
const base = b.readUInt32LE(12);
const u16 = o => b.readUInt16LE(o);
const u32 = o => b.readUInt32LE(o);
const s32 = o => b.readInt32LE(o);
const hex = n => '0x' + n.toString(16);
const ptr = field => {
  if (field < 0 || field + 4 > b.length) return null;
  const raw = u32(field), target = raw - base;
  return raw >= base && target >= 0 && target + 4 <= b.length ? target : null;
};
const header = offset => offset === null ? null : ({
  offset, opcode: b[offset], flags: b[offset + 1], classWord: u16(offset + 2)
});
function plausibleOp5(offset) {
  if (b[offset] !== 5 || offset + 0x3c > b.length) return false;
  const count = b[offset + 0x36];
  if (count < 1 || count > 32) return false;
  for (let i = 0; i < count; i++) {
    const target = ptr(offset + 0x38 + i * 4);
    if (target === null || target + 4 > b.length) return false;
  }
  return true;
}
function descriptorForOpcode2(offset) {
  const count = u32(offset + 0x10);
  const list = ptr(offset + 0x14);
  const listHeader = header(list);
  const wrapperDescriptor = list === null ? null : ptr(list + 8);
  const descriptor = wrapperDescriptor;
  const dwords = [];
  const pointerTargets = [];
  if (descriptor !== null && descriptor + 32 <= b.length) {
    for (let i = 0; i < 8; i++) {
      const field = descriptor + i * 4;
      const value = u32(field);
      dwords.push({ relativeOffset: i * 4, hex: hex(value), s32: s32(field) });
      const target = ptr(field);
      if (target !== null) pointerTargets.push({ relativeOffset: i * 4, targetOffset: target, targetHeader: header(target) });
    }
  }
  return {
    offset,
    header: header(offset),
    countAtPlus10: count,
    listPointerAtPlus14: list,
    listHeader,
    descriptorOffset: descriptor,
    descriptorDwords: dwords,
    descriptorPointerTargets: pointerTargets,
    validShape: Number.isInteger(count) && count > 0 && count <= 64 &&
      list !== null && listHeader?.opcode === 16 && descriptor !== null
  };
}

// Locate the eight mesh/paired nodes in the class-102/105 Scout root.
let rootRecord = null, rootNode = null, partList = null;
for (let o = 0; o <= b.length - 24; o++) {
  if (b[o] !== 9 || u16(o + 2) !== 102) continue;
  const candidateRoot = ptr(o + 16), candidateList = ptr(o + 20);
  if (candidateRoot !== null && candidateList !== null &&
      b[candidateRoot] === 1 && b[candidateList] === 9 &&
      u16(candidateList + 2) === 105 && u16(candidateList + 6) === 9) {
    rootRecord = o; rootNode = candidateRoot; partList = candidateList; break;
  }
}
if (rootRecord === null) throw new Error('Scout class-102/class-105 root not found');

const geometryDescriptors = [];
for (let i = 0; i < 8; i++) {
  const owner = ptr(partList + 16 + i * 4);
  if (owner === null || b[owner] !== 1) throw new Error('Invalid Scout owner node ' + i);
  for (const [role, relative] of [['mesh', 24], ['paired', 28]]) {
    const node = ptr(owner + relative);
    if (node === null || b[node] !== 2) throw new Error('Invalid ' + role + ' node for part ' + (i + 1));
    const attachment = descriptorForOpcode2(node);
    geometryDescriptors.push({
      part: i + 1, role, ownerOffset: owner, recordOffset: node,
      wrapperOffset: attachment.listPointerAtPlus14,
      descriptorOffset: attachment.descriptorOffset,
      attachment
    });
  }
}
const descriptorsByOffset = new Map();
for (const x of geometryDescriptors) {
  if (x.descriptorOffset !== null) {
    const key = x.descriptorOffset;
    if (!descriptorsByOffset.has(key)) descriptorsByOffset.set(key, []);
    descriptorsByOffset.get(key).push({ part: x.part, role: x.role, recordOffset: x.recordOffset });
  }
}

// Enumerate and connect every structurally plausible opcode-5 node.
const transforms = [];
for (let o = 0; o + 0x3c <= b.length; o++) {
  if (!plausibleOp5(o)) continue;
  const count = b[o + 0x36];
  const children = [];
  for (let i = 0; i < count; i++) {
    const target = ptr(o + 0x38 + i * 4);
    const h = header(target);
    const child = { pointerFieldOffset: o + 0x38 + i * 4, targetOffset: target, targetHeader: h };
    if (h?.opcode === 2) {
      const attachment = descriptorForOpcode2(target);
      child.opcode2Attachment = attachment;
      child.matchesGeometryParts = descriptorsByOffset.get(attachment.descriptorOffset) ?? [];
    }
    children.push(child);
  }
  transforms.push({
    offset: o,
    header: header(o),
    matrixFixed4096: Array.from({ length: 9 }, (_, i) => s32(o + 4 + i * 4)),
    position: [s32(o + 0x28), s32(o + 0x2c), s32(o + 0x30)],
    childCount: count,
    children
  });
}
const byOffset = new Map(transforms.map(x => [x.offset, x]));
const parentMap = new Map(transforms.map(x => [x.offset, []]));
for (const t of transforms) {
  for (const child of t.children) {
    if (child.targetHeader?.opcode === 5 && parentMap.has(child.targetOffset)) {
      parentMap.get(child.targetOffset).push(t.offset);
    }
  }
}
for (const t of transforms) t.parentOffsets = parentMap.get(t.offset);

const report = {
  title: 'OUTWARS SCOUT TRANSFORM-TO-GEOMETRY ATTACHMENT AUDIT',
  status: 'COMPLETED',
  source: file,
  fileBytes: b.length,
  relocationBase: hex(base),
  root: { rootRecordOffset: rootRecord, rootNodeOffset: rootNode, partListOffset: partList },
  geometryDescriptors,
  summary: {
    geometryDescriptorCount: geometryDescriptors.length,
    uniqueGeometryDescriptorOffsets: descriptorsByOffset.size,
    plausibleOpcode5TransformCount: transforms.length,
    transformRoots: transforms.filter(t => t.parentOffsets.length === 0).map(t => hex(t.offset)),
    opcode2AttachmentsInTransformChildren: transforms.flatMap(t =>
      t.children.filter(c => c.targetHeader?.opcode === 2).map(c => ({
        transform: hex(t.offset),
        attachment: hex(c.targetOffset),
        descriptor: c.opcode2Attachment?.descriptorOffset === null ? null : hex(c.opcode2Attachment?.descriptorOffset),
        matchedGeometryParts: c.matchesGeometryParts
      }))
    )
  },
  transforms,
  note: 'Pointer relationships and fixed-point transform fields are reported as stored. Matrix order, concatenation convention, coordinate axes, and any unmatched attachment meanings are not inferred.'
};
const json = JSON.stringify(report, null, 2) + '\n';
if (output) fs.writeFileSync(path.resolve(output), json);
console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  output: output ? path.resolve(output) : null
}, null, 2));
