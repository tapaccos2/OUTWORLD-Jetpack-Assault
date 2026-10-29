#!/usr/bin/env node
/**
 * Inspect the top-level pointer table in Outwars DCPMC files.
 *
 * Static disassembly of outwars.exe shows the loader reading a record count
 * at offset 32, then relocating the pointers at offsets 36 onward using the
 * relocation base stored at offset 12. Each pointer identifies a typed record.
 *
 * This is a verified structural parser, not a geometry decoder. The record
 * kind/class fields are reported as raw values; their semantic meaning remains
 * unknown.
 *
 * Usage:
 *   node tools/inspect-dpc-records.mjs original-data/structs/anub01.dpc
 */
import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-dpc-records.mjs <file.dpc> [...]');
  process.exit(2);
}
function u16le(b, o) { return b.readUInt16LE(o); }
function u32le(b, o) { return b.readUInt32LE(o); }
function hex(b, start, end) {
  return b.subarray(start, end).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '';
}

let failures = 0;
for (const file of files) {
  const b = fs.readFileSync(file);
  const validSignature = b.length >= 40 && b.toString('ascii', 0, 4) === 'DCPM' && b[4] === 0x43;
  if (!validSignature) {
    console.log(JSON.stringify({ file, bytes: b.length, error: 'not a DCPMC file' }));
    failures++;
    continue;
  }

  const relocationBase = u32le(b, 12);
  const count = u32le(b, 32);
  const pointerTableOffset = 36;
  const header = {
    relocationBase: `0x${relocationBase.toString(16)}`,
    firstPointer: `0x${u32le(b, 12).toString(16)}`,
    pointerTableEnd: `0x${u32le(b, 20).toString(16)}`,
    recordCount: count,
    pointerTableOffset,
  };

  const records = [];
  let previousOffset = -1;
  for (let i = 0; i < count; i++) {
    const fieldOffset = pointerTableOffset + i * 4;
    if (fieldOffset + 4 > b.length) {
      records.push({ index: i + 1, error: 'pointer table exceeds file bounds' });
      failures++;
      break;
    }
    const pointer = u32le(b, fieldOffset);
    const start = pointer - relocationBase;
    const nextPointer = i + 1 < count ? u32le(b, fieldOffset + 4) : null;
    const end = nextPointer === null ? b.length : nextPointer - relocationBase;
    const validBounds = start >= 0 && start < b.length && end >= start && end <= b.length;
    if (!validBounds || start < previousOffset) failures++;
    const rec = validBounds ? {
      index: i + 1,
      pointer: `0x${pointer.toString(16)}`,
      start,
      end,
      size: end - start,
      kindByte: b[start],
      flagsByte: b[start + 1],
      classId: u16le(b, start + 2),
      pointerCountByteAt20: b[start + 20],
      first32Hex: hex(b, start, Math.min(start + 32, b.length)),
      boundsValid: validBounds,
    } : {
      index: i + 1,
      pointer: `0x${pointer.toString(16)}`,
      start,
      end,
      boundsValid: false,
    };
    records.push(rec);
    previousOffset = start;
  }

  console.log(JSON.stringify({
    file,
    bytes: b.length,
    signature: 'DCPMC',
    header,
    records,
    trailingBytesAfterLastRecord: records.length && records.at(-1).boundsValid
      ? b.length - records.at(-1).end
      : null,
  }));
}
if (failures) process.exitCode = 1;
