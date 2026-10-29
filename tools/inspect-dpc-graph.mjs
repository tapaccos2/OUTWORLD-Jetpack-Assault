#!/usr/bin/env node
/**
 * Walk the serialized pointer graph in an Outwars DCPMC resource.
 *
 * Pointer-field layouts below are transcribed from the static pointer-fixup
 * dispatch in outwars.exe (0x4dd470). This reports graph structure and raw
 * fields; it does not assign semantic meanings to node classes or decode mesh
 * vertices/faces.
 *
 * Usage:
 *   node tools/inspect-dpc-graph.mjs original-data/structs/jug01.dpc
 */
import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-dpc-graph.mjs <file.dpc> [...]');
  process.exit(2);
}
function u16le(b, o) { return b.readUInt16LE(o); }
function u32le(b, o) { return b.readUInt32LE(o); }

function pointerFields(b, offset, kind) {
  const fields = [];
  const add = (at) => fields.push(at);
  const addArray = (countAt, firstAt, width = 1) => {
    if (countAt + width > b.length) return;
    const count = width === 2 ? u16le(b, offset + countAt) : b[offset + countAt];
    // Keep the analysis bounded if the file contains a corrupt/unknown count.
    if (count > 4096) return;
    for (let i = 0; i < count; i++) add(offset + firstAt + i * 4);
  };
  switch (kind) {
    case 0: add(offset + 4); add(offset + 8); add(offset + 12); break;
    case 1: addArray(20, 24); break;
    case 2: addArray(16, 20, 4); break;
    case 3: add(offset + 28); addArray(11, 32); break;
    case 4: addArray(18, 20); break;
    case 5: addArray(54, 56); break;
    case 7: case 8: add(offset + 12); break;
    case 9: add(offset + 12); addArray(6, 16); break;
    case 11: add(offset + 8); add(offset + 12); addArray(6, 16); break;
    case 12: addArray(6, 8, 2); break;
    case 13: add(offset + 8); break;
    case 15: add(offset + 4); addArray(10, 12); break;
  }
  return fields.filter(field => field + 4 <= b.length);
}

let failures = 0;
for (const file of files) {
  const b = fs.readFileSync(file);
  if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) {
    console.log(JSON.stringify({ file, bytes: b.length, error: 'not a DCPMC file' }));
    failures++;
    continue;
  }
  const relocationBase = u32le(b, 12);
  const rootCount = u32le(b, 32);
  if (rootCount > 4096 || 36 + rootCount * 4 > b.length) {
    console.log(JSON.stringify({ file, bytes: b.length, error: 'invalid root pointer table', rootCount }));
    failures++;
    continue;
  }
  const queue = [];
  for (let i = 0; i < rootCount; i++) queue.push({ offset: u32le(b, 36 + i * 4) - relocationBase, rootIndex: i + 1 });
  const seen = new Map();
  const edges = [];
  while (queue.length && seen.size < 200000) {
    const item = queue.shift();
    const o = item.offset;
    if (o < 0 || o + 4 > b.length) {
      edges.push({ fromRoot: item.rootIndex, targetOffset: o, valid: false });
      failures++;
      continue;
    }
    if (seen.has(o)) continue;
    const kind = b[o];
    const flag = b[o + 1];
    const classId = u16le(b, o + 2);
    const node = { offset: o, kind, flag, classId, rootIndex: item.rootIndex };
    seen.set(o, node);
    const fields = pointerFields(b, o, kind);
    node.pointerFields = [];
    for (const field of fields) {
      const pointer = u32le(b, field);
      if (pointer === 0) continue;
      const target = pointer - relocationBase;
      const valid = target >= 0 && target + 4 <= b.length;
      node.pointerFields.push({ fieldOffset: field, pointer: `0x${pointer.toString(16)}`, targetOffset: target, valid });
      edges.push({ fromOffset: o, fieldOffset: field, targetOffset: target, valid });
      if (valid && !seen.has(target)) queue.push({ offset: target, rootIndex: item.rootIndex });
    }
  }
  if (queue.length) {
    console.error(`Graph traversal cap reached for ${file}`);
    failures++;
  }
  const kindCounts = {};
  const classCounts = {};
  for (const node of seen.values()) {
    kindCounts[node.kind] = (kindCounts[node.kind] ?? 0) + 1;
    classCounts[node.classId] = (classCounts[node.classId] ?? 0) + 1;
  }
  console.log(JSON.stringify({
    file,
    bytes: b.length,
    relocationBase: `0x${relocationBase.toString(16)}`,
    rootCount,
    nodesVisited: seen.size,
    kindCounts,
    mostCommonClassIds: Object.entries(classCounts).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 30),
    invalidEdges: edges.filter(edge => !edge.valid),
    nodes: [...seen.values()],
  }));
}
if (failures) process.exitCode = 1;
