#!/usr/bin/env node
/**
 * Extract coordinate-like fields from observed DPC type-9/class-7012 lists.
 *
 * The +4/+8/+12 signed integer triple is reported as a candidate only.
 * This tool deliberately does not call the values vertices or assign axes/units.
 *
 * Usage:
 *   node tools/inspect-dpc-point-lists.mjs original-data/structs/rag04.dpc
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/inspect-dpc-point-lists.mjs <file.dpc>');
  process.exit(2);
}
const b = fs.readFileSync(file);
if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) {
  console.error('Expected DCPMC file');
  process.exit(2);
}
const base = b.readUInt32LE(12);
const u16 = o => o >= 0 && o + 2 <= b.length ? b.readUInt16LE(o) : null;
const u32 = o => o >= 0 && o + 4 <= b.length ? b.readUInt32LE(o) : null;
const resolve = o => {
  const value = u32(o);
  return value !== null && value >= base && value - base + 4 <= b.length ? value - base : null;
};
const topCount = b.readUInt32LE(32);
const seen = new Set();
const lists = [];
// Search for the observed class signature, then validate each record's list
// entries and their type-1 headers before reporting any candidate fields.
for (let offset = 0; offset + 20 <= b.length; offset++) {
  if (b[offset] !== 9 || u16(offset + 2) !== 7012) continue;
  const count = u16(offset + 6);
  if (count !== 7 || offset + 16 + count * 4 > b.length) continue;
  const children = [];
  let valid = true;
  for (let i = 0; i < count; i++) {
    const child = resolve(offset + 16 + i * 4);
    if (child === null || b[child] !== 1 || child + 28 > b.length) { valid = false; break; }
    children.push({
      index: i,
      offset: child,
      candidateTriple: [b.readInt32LE(child + 4), b.readInt32LE(child + 8), b.readInt32LE(child + 12)],
      valueAtPlus16: b.readUInt32LE(child + 16),
      countAtPlus20: b.readUInt32LE(child + 20),
      pointerTargetAtPlus24: resolve(child + 24),
    });
  }
  if (!valid || seen.has(offset)) continue;
  seen.add(offset);
  lists.push({ offset, type: b[offset], flags: b[offset + 1], classId: u16(offset + 2), count, children });
}
process.stdout.write(JSON.stringify({
  file, bytes: b.length, relocationBase: '0x' + base.toString(16),
  observedListCount: lists.length, lists,
  note: 'The signed triples at +4/+8/+12 are candidate coordinate fields only; their axes, units, and semantic role are not established.'
}, null, 2) + '\n');
