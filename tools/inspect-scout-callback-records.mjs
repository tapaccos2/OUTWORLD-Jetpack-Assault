#!/usr/bin/env node
/**
 * Inspect the exact Scout DPC nodes that are candidates for executable callback
 * processing. Does not modify source files or geometry.
 *
 * Usage:
 *   node tools/inspect-scout-callback-records.mjs /path/to/scout_mj.dpc [more.dpc ...]
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-scout-callback-records.mjs <scout.dpc> [more.dpc ...]');
  process.exit(2);
}

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
  function typed(o, type, cls) {
    return o >= 0 && o + 4 <= b.length && b[o] === type && u16(o + 2) === cls;
  }

  let rootRecord = -1, rootNode = -1, rootClass = -1, partClass = -1;
  for (const [candidateRoot, candidatePart] of [[102, 105], [152, 155]]) {
    for (let o = 0; o <= b.length - 4; o++) {
      if (!typed(o, 9, candidateRoot)) continue;
      const n = ptr(o + 16), list = ptr(o + 20);
      if (n !== null && list !== null && b[n] === 1 &&
          typed(list, 9, candidatePart) && u16(list + 6) === 9) {
        rootRecord = o; rootNode = n; rootClass = candidateRoot; partClass = candidatePart;
        break;
      }
    }
    if (rootNode >= 0) break;
  }
  if (rootNode < 0) throw new Error(file + ': playable armour root not found');
  const list = ptr(rootRecord + 20);
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const owner = ptr(list + 16 + i * 4);
    if (owner === null || b[owner] !== 1) throw new Error(file + ': owner ' + i + ' is not type-1');
    const mesh = ptr(owner + 24), paired = ptr(owner + 28);
    if (mesh === null || paired === null) throw new Error(file + ': invalid child pointer for part ' + (i + 1));
    for (const [role, off] of [['mesh', mesh], ['paired', paired]]) {
      const words = [];
      for (let o = 0; o <= 0x70; o += 4) {
        if (off + o + 4 > b.length) break;
        words.push('+' + o.toString(16).padStart(2, '0') + '=0x' + u32(off + o).toString(16).padStart(8, '0'));
      }
      const pointerFields = [];
      for (let o = 4; o <= 0x70; o += 4) {
        const target = ptr(off + o);
        if (target !== null) pointerFields.push({ field: '+0x' + o.toString(16), target: '0x' + target.toString(16), targetOpcode: b[target], targetClass: u16(target + 2) });
      }
      rows.push({
        part: i + 1, role, offset: '0x' + off.toString(16),
        opcodeByte0: b[off], callbackTarget: b[off] <= 13 ? ['0x4dfde1','0x4dfe56','0x4dfef3','0x4dff99','0x4e006d','0x4e0130','0x4e023a','0x4e0253','0x4e02e7','0x4e0399','0x4e0494','0x4e04a2','0x4e04a2','0x4e023a'][b[off]] : null,
        classWordPlus2: u16(off + 2),
        signedWordsAt8_10_12: [s32(off + 8), s32(off + 12), s32(off + 16)],
        fields: words,
        plausibleRelocatedPointers: pointerFields
      });
    }
  }
  return {
    file: path.resolve(file), bytes: b.length, rootClass, partClass,
    rootRecord: '0x' + rootRecord.toString(16), rootNode: '0x' + rootNode.toString(16),
    records: rows
  };
}

const results = files.map(inspect);
console.log(JSON.stringify({
  title: 'OUTWARS SCOUT CALLBACK RECORD AUDIT',
  note: 'Byte +0 selects the callback opcode table. WORD +2 is the DPC class/type. These fields must not be conflated. Pointer candidates are validated against the DPC relocation base only; semantic roles are not inferred.',
  results
}, null, 2));
