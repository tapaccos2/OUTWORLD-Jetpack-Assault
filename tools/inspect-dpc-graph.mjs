#!/usr/bin/env node
/**
 * Walk the nested relocation-pointer graph in Outwars DCPMC scene resources.
 *
 * The top-level pointer table and kind-1 records are documented by the existing
 * inspect-dpc-records.mjs tool. This exploratory graph walker follows pointers
 * found in kind-1 records (u8 count at +20, u32 pointers from +24) and kind-4
 * records (observed u16 count at +18, u32 pointers from +20). It preserves
 * unrecognised records as raw typed nodes and reports path/edge information;
 * it does NOT assign semantic meanings to unknown class IDs.
 *
 * Usage:
 *   node tools/inspect-dpc-graph.mjs original-data/structs/rag01.dpc
 *   node tools/inspect-dpc-graph.mjs original-data/structs/rag01.dpc --max-depth=5 --max-nodes=5000
 */
import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(message);
  process.exit(2);
}
const args = process.argv.slice(2);
const file = args.find(arg => !arg.startsWith('--'));
if (!file) fail('Usage: node tools/inspect-dpc-graph.mjs <file.dpc> [--max-depth=N] [--max-nodes=N]');
const maxDepth = Number(args.find(arg => arg.startsWith('--max-depth='))?.split('=')[1] ?? 5);
const maxNodes = Number(args.find(arg => arg.startsWith('--max-nodes='))?.split('=')[1] ?? 5000);
if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 20) fail('--max-depth must be an integer from 0 to 20');
if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 100000) fail('--max-nodes must be an integer from 1 to 100000');

const b = fs.readFileSync(file);
if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) fail('Expected DCPMC file');
const relocationBase = b.readUInt32LE(12);
const topCount = b.readUInt32LE(32);
const pointerTableOffset = 36;
if (topCount > Math.floor((b.length - pointerTableOffset) / 4)) fail('Top-level pointer table exceeds file bounds');

function u16(offset) { return offset >= 0 && offset + 2 <= b.length ? b.readUInt16LE(offset) : null; }
function u32(offset) { return offset >= 0 && offset + 4 <= b.length ? b.readUInt32LE(offset) : null; }
function bytesHex(offset, size=32) {
  return b.subarray(offset, Math.min(offset + size, b.length)).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '';
}
function targetAt(fieldOffset) {
  const pointer = u32(fieldOffset);
  if (pointer === null || pointer < relocationBase) return { fieldOffset, pointer, targetOffset: null, valid: false };
  const targetOffset = pointer - relocationBase;
  return { fieldOffset, pointer: '0x' + pointer.toString(16), targetOffset, valid: targetOffset >= 0 && targetOffset + 4 <= b.length };
}
function refsFor(offset, kind, maxRecords=256) {
  let count = 0, first = 0;
  if (kind === 1) { count = b[offset + 20] ?? 0; first = offset + 24; }
  else if (kind === 4) { count = u16(offset + 18) ?? 0; first = offset + 20; }
  // Unknown record type/oversized count is retained but not followed using a guessed layout.
  if (![1, 4].includes(kind) || count > maxRecords || first + count * 4 > b.length) return { count, refs: [], layoutFollowed: false };
  const refs = [];
  for (let i=0; i<count; i++) {
    const ref = targetAt(first + i * 4);
    refs.push({ index: i, ...ref });
  }
  return { count, refs, layoutFollowed: true };
}

const queue = [];
for (let i=0; i<topCount; i++) {
  const root = targetAt(pointerTableOffset + i * 4);
  queue.push({ ...root, rootIndex: i, parentOffset: null, fieldIndex: i, depth: 0 });
}
const nodes = new Map();
const edges = [];
const errors = [];
while (queue.length && nodes.size < maxNodes) {
  const item = queue.shift();
  if (!item.valid) { errors.push({ ...item, reason: 'pointer target is outside file bounds' }); continue; }
  const offset = item.targetOffset;
  const kind = b[offset], flags = b[offset + 1], classId = u16(offset + 2);
  const key = offset + ':' + kind + ':' + classId;
  if (item.parentOffset !== null) {
    edges.push({ from: item.parentOffset, to: offset, rootIndex: item.rootIndex, depth: item.depth, fieldIndex: item.fieldIndex });
  }
  if (nodes.has(key)) continue;
  const node = {
    key, offset, kind, flags, classId,
    rootIndices: [item.rootIndex],
    firstSeenDepth: item.depth,
    relativeHex: bytesHex(offset),
    // Header bytes retained to compare layouts without guessing their meanings.
    headerHex: bytesHex(offset, 64),
  };
  const link = refsFor(offset, kind);
  node.pointerCountCandidate = link.count;
  node.pointerLayoutFollowed = link.layoutFollowed;
  node.outgoingPointers = [];
  nodes.set(key, node);
  for (const ref of link.refs) {
    node.outgoingPointers.push({ fieldOffset: ref.fieldOffset, targetOffset: ref.targetOffset, valid: ref.valid });
    if (!ref.valid) {
      errors.push({ sourceOffset: offset, ...ref, reason: 'invalid nested pointer' });
      continue;
    }
    edges.push({ from: offset, to: ref.targetOffset, rootIndex: item.rootIndex, depth: item.depth + 1, fieldIndex: ref.index });
    if (item.depth < maxDepth && !nodes.has(ref.targetOffset + ':' + b[ref.targetOffset] + ':' + u16(ref.targetOffset + 2))) {
      queue.push({ ...ref, rootIndex: item.rootIndex, parentOffset: offset, fieldIndex: ref.index, depth: item.depth + 1 });
    }
  }
}
const byTypeClass = {};
for (const node of nodes.values()) {
  const k = 'type=' + node.kind + ',class=' + node.classId;
  byTypeClass[k] = (byTypeClass[k] ?? 0) + 1;
}
const byRoot = {};
for (const node of nodes.values()) {
  for (const rootIndex of node.rootIndices) {
    byRoot[rootIndex] ??= { nodeCount: 0, typeClasses: {} };
    byRoot[rootIndex].nodeCount++;
    const k = 'type=' + node.kind + ',class=' + node.classId;
    byRoot[rootIndex].typeClasses[k] = (byRoot[rootIndex].typeClasses[k] ?? 0) + 1;
  }
}
process.stdout.write(JSON.stringify({
  file, bytes: b.length, signature: 'DCPMC', relocationBase: '0x' + relocationBase.toString(16),
  topLevelCount: topCount, walkedNodeCount: nodes.size, edgeCount: edges.length,
  maxDepth, maxNodes, truncated: queue.length > 0, byTypeClass, byRoot,
  roots: Array.from({ length: topCount }, (_, i) => {
    const target = u32(pointerTableOffset + i * 4) - relocationBase;
    return { index: i, targetOffset: target, kind: b[target], flags: b[target + 1], classId: u16(target + 2), sizeToNextTop: (i + 1 < topCount ? u32(pointerTableOffset + (i+1)*4)-relocationBase : b.length)-target, headerHex: bytesHex(target,64) };
  }),
  nodes: [...nodes.values()].sort((a,b) => a.offset-b.offset),
  edges,
  errors,
  note: 'This is a nested-pointer inventory based on observed layouts for kind 1 and kind 4 only; nested kind-4 layout and other pointer structures remain tentative. No type/class semantic names are inferred.'
}, null, 2) + '\n');
