#!/usr/bin/env node
/**
 * Audit the Scout DPC playable-armour graph without assuming that all eight
 * type-1 list entries are equivalent mesh/transform pairs.
 *
 * Usage:
 *   node tools/inspect-scout-part-graph.mjs
 *   node tools/inspect-scout-part-graph.mjs path/to/scout_mj.dpc report.json
 *   node tools/inspect-scout-part-graph.mjs original-data/units.ff report.json
 *
 * If no input is supplied, the script searches the usual extracted folders
 * and then attempts a validated extraction from original-data/units.ff.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const requestedInput = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
const outputPath = args[1] ? path.resolve(args[1]) : path.resolve('scout-part-graph-audit.json');
const repoRoot = process.cwd();

function fail(message) {
  console.error(JSON.stringify({ status: 'FAILED', error: message }, null, 2));
  process.exit(1);
}
function extractUnitsArchive(archive) {
  const extractor = path.join(repoRoot, 'tools', 'extract-ff-resources.mjs');
  if (!fs.existsSync(extractor)) throw new Error('FF extractor not found: ' + extractor);
  const destination = path.join(os.tmpdir(), 'outwars-scout-graph-' + process.pid);
  const result = spawnSync(process.execPath, [extractor, archive, '--out', destination], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error('FF archive extraction did not validate. ' + (result.stderr || result.stdout || 'No extractor output'));
  }
  const extracted = path.join(destination, 'units', 'scout_mj.dpc');
  return fs.existsSync(extracted) ? extracted : null;
}
function findInput() {
  if (requestedInput && fs.existsSync(requestedInput)) {
    if (path.extname(requestedInput).toLowerCase() === '.ff') return extractUnitsArchive(requestedInput);
    return requestedInput;
  }
  if (requestedInput) return null;
  const candidates = [
    'original-data/units/scout_mj.dpc',
    'original-data/units.ff/scout_mj.dpc',
    'extracted-ff/units/scout_mj.dpc',
    'units/scout_mj.dpc',
    'scout_mj.dpc'
  ];
  for (const candidate of candidates) {
    const full = path.join(repoRoot, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  for (const root of ['original-data', 'extracted-ff', 'units']) {
    const fullRoot = path.join(repoRoot, root);
    if (!fs.existsSync(fullRoot)) continue;
    const stack = [fullRoot];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && entry.name.toLowerCase() === 'scout_mj.dpc') return full;
      }
    }
  }
  const archive = path.join(repoRoot, 'original-data', 'units.ff');
  if (fs.existsSync(archive)) return extractUnitsArchive(archive);
  return null;
}
function hex(buffer, start, length) {
  return buffer.subarray(start, Math.min(buffer.length, start + length)).toString('hex').match(/.{1,2}/g)?.join(' ') || '';
}
function createReader(file) {
  const b = fs.readFileSync(file);
  if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) {
    throw new Error('Expected a DCPMC file: ' + file);
  }
  const base = b.readUInt32LE(12);
  const u16 = o => b.readUInt16LE(o);
  const u32 = o => b.readUInt32LE(o);
  const s32 = o => b.readInt32LE(o);
  const s16 = o => b.readInt16LE(o);
  function ptr(fieldOffset) {
    if (fieldOffset < 0 || fieldOffset + 4 > b.length) return null;
    const value = u32(fieldOffset);
    const target = value - base;
    if (value < base || target < 0 || target + 4 > b.length) return null;
    return target;
  }
  function typed(offset, expectedType, expectedClass) {
    return Number.isInteger(offset) && offset >= 0 && offset + 4 <= b.length &&
      b[offset] === expectedType && u16(offset + 2) === expectedClass;
  }
  function header(offset) {
    if (!Number.isInteger(offset) || offset < 0 || offset + 4 > b.length) return null;
    return { offset, type: b[offset], flags: b[offset + 1], classId: u16(offset + 2) };
  }
  function pointerField(recordOffset, relativeOffset) {
    const target = ptr(recordOffset + relativeOffset);
    return {
      fieldOffset: relativeOffset,
      rawHex: '0x' + u32(recordOffset + relativeOffset).toString(16).padStart(8, '0'),
      targetOffset: target,
      targetHeader: target === null ? null : header(target)
    };
  }
  function candidatePointers(recordOffset, start = 4, end = 64) {
    const out = [];
    for (let rel = start; rel <= end && recordOffset + rel + 4 <= b.length; rel += 4) {
      const target = ptr(recordOffset + rel);
      if (target === null) continue;
      const h = header(target);
      if (!h || h.type > 32) continue;
      out.push({ fieldOffset: rel, targetOffset: target, targetHeader: h });
    }
    return out;
  }
  function wordView(offset, length = 64) {
    const end = Math.min(b.length, offset + length);
    const signed16 = [], unsigned32 = [];
    for (let p = offset; p + 2 <= end; p += 2) signed16.push(s16(p));
    for (let p = offset; p + 4 <= end; p += 4) {
      unsigned32.push({ offset: p - offset, u32: u32(p), s32: s32(p), hex: '0x' + u32(p).toString(16).padStart(8, '0') });
    }
    return { hex: hex(b, offset, length), signed16, words32: unsigned32 };
  }
  function faceSignatureStats(start, limit = 40) {
    if (start === null || start < 0 || start >= b.length) return null;
    const sig = Buffer.from([4, 1, 12, 9]);
    let cursor = start, found = 0;
    const quads = [], examples = [];
    while (found < limit) {
      cursor = b.indexOf(sig, cursor);
      if (cursor < 0 || cursor + 12 > b.length) break;
      const q = [u16(cursor + 4), u16(cursor + 6), u16(cursor + 8), u16(cursor + 10)];
      quads.push(q);
      if (examples.length < 8) examples.push({ offset: cursor, indices: q });
      found++; cursor += 4;
    }
    const keys = new Set(quads.map(q => q.slice().sort((a, c) => a - c).join(',')));
    return {
      startOffset: start,
      signatureRecordsFoundBeforeLimit: found,
      uniqueUnorderedQuadKeys: keys.size,
      firstUniqueQuadIndices: quads[0] || null,
      maxIndex: quads.length ? Math.max(...quads.flat()) : null,
      examples
    };
  }
  function type2Detail(offset, label) {
    if (offset === null) return null;
    const h = header(offset);
    if (!h || h.type !== 2) return { label, offset, header: h, note: 'Not a type-2 record' };
    const p20 = pointerField(offset, 20);
    const p28 = pointerField(offset, 28);
    const p36 = pointerField(offset, 36);
    const wrapper = p20.targetOffset === null ? null : header(p20.targetOffset);
    const wrapperLink = wrapper && wrapper.type === 16 ? pointerField(p20.targetOffset, 8) : null;
    const descriptor = wrapperLink?.targetOffset ?? null;
    const coordinate = descriptor === null ? null : pointerField(descriptor, 4);
    const possibleFaces = p36.targetOffset;
    return {
      label, offset, header: h,
      fields: {
        plus4: pointerField(offset, 4),
        plus8: pointerField(offset, 8),
        plus12: pointerField(offset, 12),
        plus16: pointerField(offset, 16),
        plus20: p20,
        plus24: pointerField(offset, 24),
        plus28: p28,
        plus32: { s32: s32(offset + 32), u32: u32(offset + 32), hex: '0x' + u32(offset + 32).toString(16).padStart(8, '0') },
        plus36: p36,
        plus40: { s32: s32(offset + 40), u32: u32(offset + 40), hex: '0x' + u32(offset + 40).toString(16).padStart(8, '0') },
        plus44: pointerField(offset, 44),
        plus48: pointerField(offset, 48)
      },
      wrapper: p20.targetOffset === null ? null : {
        header: wrapper,
        plus0u32: u32(p20.targetOffset),
        plus0hex: '0x' + u32(p20.targetOffset).toString(16),
        plus8: wrapperLink
      },
      descriptor: descriptor === null ? null : {
        header: header(descriptor),
        plus4CoordinateCandidate: coordinate
      },
      faceStreamCandidate: possibleFaces === null ? null : faceSignatureStats(possibleFaces, 40),
      alignedPointerCandidates: candidatePointers(offset, 4, 64),
      rawFirst64: wordView(offset, 64)
    };
  }
  function ownerDetail(offset, index) {
    const h = header(offset);
    if (!h || h.type !== 1) {
      return { listIndex: index, offset, header: h, note: 'List entry is not a type-1 part node' };
    }
    const ownerVector = [s32(offset + 8), s32(offset + 12), s32(offset + 16)];
    const child24 = pointerField(offset, 24);
    const child28 = pointerField(offset, 28);
    const c24 = child24.targetHeader;
    const c28 = child28.targetHeader;
    const transformNode = c28?.type === 2 ? child28.targetOffset : null;
    const candidateVector = transformNode === null ? null : [s32(transformNode + 32), s32(transformNode + 36), s32(transformNode + 40)];
    const pairChecks = {
      child24IsType2: c24?.type === 2,
      child28IsType2: c28?.type === 2,
      vectorsMatch: candidateVector ? ownerVector.every((v, k) => v === candidateVector[k]) : false
    };
    return {
      listIndex: index, offset, header: h,
      ownerVectorCandidate: ownerVector,
      child24, child28,
      pairChecks,
      child24Detail: c24?.type === 2 ? type2Detail(child24.targetOffset, 'owner+24') : null,
      child28Detail: c28?.type === 2 ? type2Detail(child28.targetOffset, 'owner+28') : null,
      ownerPointerCandidates: candidatePointers(offset, 4, 96),
      ownerLinkedType1Records: candidatePointers(offset, 44, 96).filter(p => p.targetHeader.type === 1),
      rawFirst96: wordView(offset, 96)
    };
  }
  let rootRecord = null, rootNode = null, rootClass = null, partClass = null;
  for (const [candidateRoot, candidatePart] of [[102, 105], [152, 155]]) {
    for (let offset = 0; offset <= b.length - 4; offset++) {
      if (!typed(offset, 9, candidateRoot)) continue;
      const node = ptr(offset + 16), list = ptr(offset + 20);
      if (node !== null && list !== null && b[node] === 1 && typed(list, 9, candidatePart) && u16(list + 6) === 9) {
        rootRecord = offset; rootNode = node; rootClass = candidateRoot; partClass = candidatePart; break;
      }
    }
    if (rootRecord !== null) break;
  }
  if (rootRecord === null) throw new Error('Scout armour root class-102/152 and nine-entry class-105/155 list not found');
  const partList = ptr(rootRecord + 20);
  const entries = [];
  for (let i = 0; i < 9; i++) {
    const target = ptr(partList + 16 + i * 4);
    entries.push({ index: i, pointer: pointerField(partList + 16 + i * 4, 0), detail: target === null ? null : ownerDetail(target, i) });
  }
  const rootDetail = {
    rootRecord: header(rootRecord),
    rootNode: header(rootNode),
    rootNodeOffset: rootNode,
    partList: header(partList),
    partListOffset: partList,
    listCount: u16(partList + 6),
    entries
  };
  const directPartNodes = entries.filter(x => x.detail?.header?.type === 1);
  const extraEntries = entries.filter(x => x.detail?.header?.type !== 1);
  return {
    status: 'COMPLETED',
    source: path.resolve(file),
    fileBytes: b.length,
    relocationBase: '0x' + base.toString(16),
    rootClass, partClass,
    summary: {
      listEntryCount: entries.length,
      type1PartNodeCount: directPartNodes.length,
      nonType1LinkedEntryCount: extraEntries.length,
      ownerPlus24Type2Count: directPartNodes.filter(x => x.detail.pairChecks.child24IsType2).length,
      ownerPlus28Type2Count: directPartNodes.filter(x => x.detail.pairChecks.child28IsType2).length,
      ownerAndChild28VectorMatchCount: directPartNodes.filter(x => x.detail.pairChecks.vectorsMatch).length,
      entriesWithMultipleChildOwnerLinks: directPartNodes.filter(x => (x.detail.ownerLinkedType1Records || []).length >= 2).map(x => ({
        listIndex: x.index,
        ownerOffset: x.detail.offset,
        linkedType1Offsets: x.detail.ownerLinkedType1Records.map(p => p.targetOffset)
      })),
      warnings: [
        'Type/class and pointer links are structural observations, not semantic labels.',
        'A type-2 node is not automatically a mesh or transform; its runtime consumer still needs confirmation.',
        'Face signature scans are candidate stream checks and can cross unrelated data; use them as diagnostics, not proof.'
      ]
    },
    graph: rootDetail
  };
}

try {
  const input = findInput();
  if (!input) fail('Could not locate scout_mj.dpc. Pass its path, or keep original-data/units.ff in the repository.');
  const report = createReader(input);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    status: report.status,
    source: report.source,
    summary: report.summary,
    output: outputPath
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.stack : String(error));
}
