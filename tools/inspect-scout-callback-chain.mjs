#!/usr/bin/env node
/**
 * Trace Scout opcode-2 callback records through their +0x14 type-16 list
 * and the +8 value consumed by callback 0x4DFEF3.
 *
 * This is a read-only structural audit. It does not alter DPCs or geometry.
 *
 * Usage:
 *   node tools/inspect-scout-callback-chain.mjs extracted-ff/units/scout_mj.dpc [...]
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-scout-callback-chain.mjs <scout.dpc> [more.dpc ...]');
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
    throw new Error(file + ': expected DCPM version 0x43');
  }
  const base = b.readUInt32LE(12);
  const u16 = o => b.readUInt16LE(o);
  const u32 = o => b.readUInt32LE(o);
  function ptr(o) {
    if (o < 0 || o + 4 > b.length) return null;
    const p = u32(o), rel = p - base;
    return p >= base && rel >= 0 && rel + 4 <= b.length ? rel : null;
  }
  function typed(o, type, cls) {
    return o >= 0 && o + 4 <= b.length && b[o] === type && u16(o + 2) === cls;
  }
  function words(o, count = 8) {
    const out = [];
    for (let i = 0; i < count && o + i * 4 + 4 <= b.length; i++) {
      out.push('0x' + u32(o + i * 4).toString(16).padStart(8, '0'));
    }
    return out;
  }

  let rootRecord = -1, rootClass = -1, partClass = -1;
  for (const [rc, pc] of [[102,105],[152,155]]) {
    for (let o = 0; o <= b.length - 24; o++) {
      if (!typed(o, 9, rc)) continue;
      const n = ptr(o + 16), l = ptr(o + 20);
      if (n !== null && l !== null && b[n] === 1 && typed(l, 9, pc) && u16(l + 6) === 9) {
        rootRecord = o; rootClass = rc; partClass = pc; break;
      }
    }
    if (rootRecord >= 0) break;
  }
  if (rootRecord < 0) throw new Error(file + ': playable armour root not found');

  const list = ptr(rootRecord + 20);
  const records = [];
  for (let part = 0; part < 8; part++) {
    const owner = ptr(list + 16 + part * 4);
    if (owner === null || b[owner] !== 1) throw new Error(file + ': invalid owner ' + (part + 1));
    for (const [role, record] of [['mesh',ptr(owner + 24)],['paired',ptr(owner + 28)]]) {
      if (record === null) throw new Error(file + ': invalid ' + role + ' pointer for part ' + (part + 1));
      const opcode = b[record];
      const count = u32(record + 0x10);
      const chain = ptr(record + 0x14);
      const items = [];
      if (chain !== null && count <= 32) {
        for (let i = 0; i < count; i++) {
          const element = chain + i * 4;
          if (element + 12 > b.length) break;
          const consumedDword = u32(element + 8);
          const consumedTarget = ptr(element + 8);
          const descriptor = consumedTarget === null ? null : {
            offset: '0x' + consumedTarget.toString(16),
            dwords: words(consumedTarget, 8),
            pointerAtPlus4: ptr(consumedTarget + 4) === null ? null : '0x' + ptr(consumedTarget + 4).toString(16)
          };
          items.push({
            elementOffset: '0x' + element.toString(16),
            callbackReadsAtPlus8: '0x' + consumedDword.toString(16).padStart(8, '0'),
            callbackReadPointerTarget: consumedTarget === null ? null : '0x' + consumedTarget.toString(16),
            descriptor
          });
        }
      }
      records.push({
        part: part + 1, role, recordOffset: '0x' + record.toString(16),
        opcodeByte0: opcode, callbackTarget: opcode <= 13 ? callbackTargets[opcode] : null,
        classWordPlus2: u16(record + 2), countAtPlus10: count,
        listPointerAtPlus14: chain === null ? null : '0x' + chain.toString(16),
        listTargetOpcode: chain === null ? null : b[chain],
        listTargetClass: chain === null ? null : u16(chain + 2),
        listTargetDwords: chain === null ? null : words(chain, 10),
        callbackItems: items
      });
    }
  }
  return {
    file: path.resolve(file), bytes: b.length, rootClass, partClass,
    callbackRecordCount: records.length,
    opcodeCounts: records.reduce((a,r) => (a[r.opcodeByte0] = (a[r.opcodeByte0] || 0) + 1, a), {}),
    records
  };
}

console.log(JSON.stringify({
  title: 'OUTWARS SCOUT CALLBACK CHAIN AUDIT',
  note: 'For callback opcode 2, this follows the record +0x14 pointer for the +0x10 count and reports the DWORD read at each pointed element +8. Relocation-valid targets and descriptor contents are reported as structure only; semantic roles are not assumed.',
  results: files.map(inspect)
}, null, 2));
