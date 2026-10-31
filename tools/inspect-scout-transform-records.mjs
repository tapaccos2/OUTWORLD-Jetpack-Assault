#!/usr/bin/env node
/**
 * Locate candidate Scout DPC records for executable callback opcode 5
 * (0x4E0130), the branch that builds fixed-point hierarchical transforms.
 *
 * This is a read-only candidate scan. It does not assign semantics to fields
 * or alter the geometry exporter. A candidate must have byte zero == 5,
 * a plausible child count at +0x36, and a relocated child-pointer array
 * beginning at +0x38 whose targets remain inside the DPC resource.
 *
 * Usage:
 *   node tools/inspect-scout-transform-records.mjs /path/to/scout_mj.dpc [more.dpc ...]
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-scout-transform-records.mjs <scout.dpc> [more.dpc ...]');
  process.exit(2);
}

const callbackTargets = [
  '0x4dfde1','0x4dfe56','0x4dfef3','0x4dff99','0x4e006d','0x4e0130',
  '0x4e0494','0x4e04a2','0x4e023a','0x4e0253','0x4e04a2','0x4e02e7',
  '0x4e0399','0x4e023a'
];

function inspect(file) {
  const b = fs.readFileSync(file);
  if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) {
    throw new Error(file + ': expected DCPMC resource');
  }
  const base = b.readUInt32LE(12);
  const u16 = o => b.readUInt16LE(o);
  const u32 = o => b.readUInt32LE(o);
  const s32 = o => b.readInt32LE(o);
  function ptr(o) {
    if (o < 0 || o + 4 > b.length) return null;
    const p = u32(o), rel = p - base;
    return p >= base && rel + 4 <= b.length ? rel : null;
  }

  const candidates = [];
  const allOpcode5 = [];
  for (let o = 0; o + 0x3c <= b.length; o++) {
    if (b[o] !== 5) continue;
    allOpcode5.push(o);
    const count = b[o + 0x36];
    if (count > 32) continue;
    const children = [];
    let valid = count > 0;
    for (let i = 0; i < count; i++) {
      const child = ptr(o + 0x38 + i * 4);
      if (child === null || child + 0x3c > b.length) { valid = false; break; }
      const nested = ptr(child + 0x38);
      children.push({
        pointerField: '0x' + (o + 0x38 + i * 4).toString(16),
        target: '0x' + child.toString(16),
        targetOpcode: b[child],
        targetClassWord: u16(child + 2),
        targetPlus38: nested === null ? null : '0x' + nested.toString(16),
        targetPlus38Opcode: nested === null ? null : b[nested]
      });
    }
    if (!valid) continue;

    const matrixWords = [];
    for (let p = 4; p < 0x28; p += 4) matrixWords.push(s32(o + p));
    candidates.push({
      offset: '0x' + o.toString(16),
      flagsByte1: b[o + 1],
      classWordPlus2: u16(o + 2),
      matrixWordsPlus4To24: matrixWords,
      positionWordsPlus28: [s32(o + 0x28), s32(o + 0x2c), s32(o + 0x30)],
      childCountPlus36: count,
      children
    });
  }

  return {
    file: path.resolve(file),
    bytes: b.length,
    relocationBase: '0x' + base.toString(16),
    opcode5ByteOccurrences: allOpcode5.length,
    structurallyPlausibleOpcode5Records: candidates.length,
    candidates,
    note: 'Candidate scan only. Opcode byte 5 maps to callback 0x4E0130. Matrix/position/child fields are reported as raw values; relocated pointers are validated only against this DPC file. A zero or missing candidate does not prove the callback branch is unused.'
  };
}

const results = files.map(inspect);
console.log(JSON.stringify({
  title: 'OUTWARS SCOUT TRANSFORM-CALLBACK CANDIDATE SCAN',
  callbackOpcode5Target: callbackTargets[5],
  results
}, null, 2));
