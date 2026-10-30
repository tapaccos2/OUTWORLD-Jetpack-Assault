#!/usr/bin/env node
/**
 * Inspect reachable type-8 records in an Outwars DCPMC resource.
 *
 * The walker uses the currently observed pointer layouts:
 *   type 1: u8 count at +20, relocated u32 pointers from +24
 *   type 4: u16 count at +18, relocated u32 pointers from +20 (provisional)
 *   type 9/class 7012: u16 count at +6, relocated u32 pointers from +16
 *
 * Type-8 records are reported as raw fields. Eight signed int32 triples begin
 * at +16 with a 12-byte stride. Their meanings are not assumed.
 *
 * Usage: node tools/inspect-dpc-type8.mjs map.dpc
 */
import fs from 'node:fs';

function fail(message) {
  console.error(message);
  process.exit(2);
}
const file = process.argv.slice(2).find(x => !x.startsWith('--'));
if (!file) fail('Usage: node tools/inspect-dpc-type8.mjs <file.dpc>');
const b = fs.readFileSync(file);
if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) fail('Expected DCPMC file');
const relocationBase = b.readUInt32LE(12);
const topCount = b.readUInt32LE(32);
if (topCount > Math.floor((b.length - 36) / 4)) fail('Top-level pointer table exceeds file bounds');

function u16(o) { return o >= 0 && o + 2 <= b.length ? b.readUInt16LE(o) : null; }
function u32(o) { return o >= 0 && o + 4 <= b.length ? b.readUInt32LE(o) : null; }
function target(pointer) {
  if (pointer === null || pointer < relocationBase) return null;
  const offset = pointer - relocationBase;
  return offset >= 0 && offset + 24 <= b.length ? offset : null;
}
function refs(offset, type, classId) {
  let count = 0, first = 0;
  if (type === 1) { count = b[offset + 20] ?? 0; first = offset + 24; }
  else if (type === 4) { count = u16(offset + 18) ?? 0; first = offset + 20; }
  else if (type === 9 && classId === 7012) { count = u16(offset + 6) ?? 0; first = offset + 16; }
  else return [];
  if (count > 256 || first + count * 4 > b.length) return [];
  return Array.from({ length: count }, (_, i) => ({
    fieldOffset: first + i * 4,
    targetOffset: target(u32(first + i * 4)),
  })).filter(x => x.targetOffset !== null);
}

const queue = [];
for (let i = 0; i < topCount; i++) {
  const offset = target(u32(36 + i * 4));
  if (offset !== null) queue.push({ offset, parentOffset: null, parentType: null, parentClass: null, fieldOffset: 36 + i * 4 });
}
const nodes = new Map();
while (queue.length && nodes.size < 10000) {
  const item = queue.shift();
  const { offset } = item;
  const type = b[offset], classId = u16(offset + 2);
  let node = nodes.get(offset);
  if (node) {
    if (type === 8 && item.parentOffset !== null) node.parents.push({
      offset: item.parentOffset, type: item.parentType, classId: item.parentClass, fieldOffset: item.fieldOffset,
    });
    continue;
  }
  node = { offset, type, classId, parents: [] };
  if (type === 8 && item.parentOffset !== null) node.parents.push({
    offset: item.parentOffset, type: item.parentType, classId: item.parentClass, fieldOffset: item.fieldOffset,
  });
  nodes.set(offset, node);
  for (const ref of refs(offset, type, classId)) queue.push({
    offset: ref.targetOffset, parentOffset: offset, parentType: type, parentClass: classId,
    fieldOffset: ref.fieldOffset,
  });
}
const records = [...nodes.values()].filter(x => x.type === 8).map(node => {
  if (node.offset + 112 > b.length) return { ...node, truncated: true };
  const triples = Array.from({ length: 8 }, (_, i) => [
    b.readInt32LE(node.offset + 16 + i * 12),
    b.readInt32LE(node.offset + 20 + i * 12),
    b.readInt32LE(node.offset + 24 + i * 12),
  ]);
  const lengths = triples.map(v => Math.hypot(...v));
  return {
    ...node,
    headerWords: Array.from({ length: 4 }, (_, i) => u16(node.offset + 4 + i * 2)),
    triples,
    lengths: lengths.map(x => Number(x.toFixed(2))),
  };
});
const slotSummary = Array.from({ length: 8 }, (_, slot) => {
  const lengths = records.filter(x => x.lengths).map(x => x.lengths[slot]);
  return {
    slot,
    count: lengths.length,
    near4096: lengths.filter(x => Math.abs(x - 4096) < 30).length,
    minLength: lengths.length ? Math.min(...lengths) : null,
    maxLength: lengths.length ? Math.max(...lengths) : null,
  };
});
const parentTypes = {};
for (const record of records) for (const parent of record.parents) {
  const key = `type=${parent.type},class=${parent.classId}`;
  parentTypes[key] = (parentTypes[key] ?? 0) + 1;
}
process.stdout.write(JSON.stringify({
  file, bytes: b.length, topLevelCount: topCount, reachableNodeCount: nodes.size,
  reachableType8Count: records.length, parentTypes, slotSummary, records,
  note: 'Triples and parent references are raw observations. No mesh, vertex, normal, or collision semantics are assigned.',
}, null, 2) + '\n');
