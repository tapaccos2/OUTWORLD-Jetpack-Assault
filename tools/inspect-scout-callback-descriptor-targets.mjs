#!/usr/bin/env node
/**
 * Inspect the two relocated pointer fields in descriptors reached through
 * Scout opcode-2 callback lists. Read-only; does not modify DPCs or geometry.
 *
 * Usage:
 *   node tools/inspect-scout-callback-descriptor-targets.mjs units/scout_mj.dpc [...]
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node inspect-scout-callback-descriptor-targets.mjs <scout.dpc> [more.dpc ...]');
  process.exit(2);
}

function inspect(file) {
  const b = fs.readFileSync(file);
  if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) {
    throw new Error(file + ': expected DCPM version 0x43');
  }
  const base = b.readUInt32LE(12);
  const u16 = o => b.readUInt16LE(o);
  const u32 = o => b.readUInt32LE(o);
  const s16 = o => b.readInt16LE(o);
  function ptr(o) {
    if (o < 0 || o + 4 > b.length) return null;
    const raw = u32(o), rel = raw - base;
    return raw >= base && rel >= 0 && rel + 4 <= b.length ? rel : null;
  }
  function typed(o, type, cls) {
    return o >= 0 && o + 4 <= b.length && b[o] === type && u16(o + 2) === cls;
  }
  function hex(o, n) {
    return b.subarray(o, Math.min(b.length, o + n)).toString('hex').match(/../g)?.join(' ') ?? '';
  }
  function xyz8(o) {
    if (o < 0 || o + 8 > b.length) return null;
    return { xyz: [s16(o), s16(o + 2), s16(o + 4)], trailingWord: u16(o + 6) };
  }

  let root = -1, partClass = -1;
  for (const [rc, pc] of [[102,105],[152,155]]) {
    for (let o = 0; o <= b.length - 24; o++) {
      if (!typed(o, 9, rc)) continue;
      const node = ptr(o + 16), list = ptr(o + 20);
      if (node !== null && list !== null && b[node] === 1 && typed(list, 9, pc) && u16(list + 6) === 9) {
        root = o; partClass = pc; break;
      }
    }
    if (root >= 0) break;
  }
  if (root < 0) throw new Error(file + ': playable armour root not found');
  const partList = ptr(root + 20);
  const records = [];
  for (let part = 0; part < 8; part++) {
    const owner = ptr(partList + 16 + part * 4);
    if (owner === null || b[owner] !== 1) throw new Error(file + ': invalid owner ' + (part + 1));
    for (const [role, rec] of [['mesh',ptr(owner + 24)],['paired',ptr(owner + 28)]]) {
      if (rec === null || b[rec] !== 2 || b[rec] !== 2) throw new Error(file + ': invalid ' + role + ' node');
      const list = ptr(rec + 0x14);
      if (list === null) throw new Error(file + ': invalid callback list pointer');
      const count = u32(rec + 0x10);
      const items = [];
      for (let i = 0; i < count && i < 32; i++) {
        const item = list + i * 4;
        const descriptor = ptr(item + 8);
        if (descriptor === null) {
          items.push({ itemOffset: '0x' + item.toString(16), descriptor: null });
          continue;
        }
        const localData = ptr(descriptor + 4);
        const secondary = ptr(descriptor + 8);
        const next = ptr(descriptor + 12);
        items.push({
          itemOffset: '0x' + item.toString(16),
          descriptorOffset: '0x' + descriptor.toString(16),
          descriptorHeader: '0x' + u32(descriptor).toString(16).padStart(8,'0'),
          descriptorPlus4Raw: '0x' + u32(descriptor + 4).toString(16).padStart(8,'0'),
          descriptorPlus4Target: localData === null ? null : '0x' + localData.toString(16),
          descriptorPlus4TargetBytes: localData === null ? null : hex(localData, 64),
          descriptorPlus4FirstXYZ8: localData === null ? null : xyz8(localData),
          descriptorPlus8Raw: '0x' + u32(descriptor + 8).toString(16).padStart(8,'0'),
          descriptorPlus8Target: secondary === null ? null : '0x' + secondary.toString(16),
          descriptorPlus12Raw: '0x' + u32(descriptor + 12).toString(16).padStart(8,'0'),
          descriptorPlus12Target: next === null ? null : '0x' + next.toString(16),
          descriptorTailDwords: Array.from({length:8},(_,k)=>'0x'+u32(descriptor+16+k*4).toString(16).padStart(8,'0'))
        });
      }
      records.push({ part: part + 1, role, nodeOffset: '0x' + rec.toString(16), callbackCount: count, listTargetClass: u16(list + 2), items });
    }
  }
  return { file: path.resolve(file), bytes: b.length, rootClass: u16(root + 2), partClass, records };
}

console.log(JSON.stringify({
  title: 'OUTWARS SCOUT CALLBACK DESCRIPTOR TARGET AUDIT',
  note: 'Follows the descriptor pointer consumed by opcode-2 callback through descriptor +4, +8, and +12. Local relocated targets are reported separately from non-local raw pointers. First 8-byte target data is decoded as signed XYZ only as a diagnostic view, not a semantic label.',
  results: files.map(inspect)
}, null, 2));
