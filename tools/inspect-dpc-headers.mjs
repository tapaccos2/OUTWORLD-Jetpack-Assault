#!/usr/bin/env node
/**
 * Inspect the first 64 bytes of Outwars .DPC database files.
 *
 * Static inspection of outwars.exe shows a parser checking the DCPM signature
 * followed by 'C'. The header contains pointer-like values based at 0x80019c04.
 * This tool reports those values and their candidate file offsets; it does not
 * assign meanings to sections or decode geometry.
 *
 * Usage:
 *   node tools/inspect-dpc-headers.mjs original-data/structs/*.dpc
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-dpc-headers.mjs <file.dpc> [...]');
  process.exit(2);
}

const pointerBase = 0x80019c04;
function u32le(b, o) { return b.readUInt32LE(o); }
function hex(b, start, end) {
  return b.subarray(start, end).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '';
}

let failures = 0;
for (const file of files) {
  const b = fs.readFileSync(file);
  const magic = b.subarray(0, 4).toString('ascii');
  const tag = b[4];
  const words = [];
  for (let offset = 8; offset + 4 <= Math.min(64, b.length); offset += 4) {
    const value = u32le(b, offset);
    const candidateOffset = value >= pointerBase && value <= pointerBase + b.length
      ? value - pointerBase
      : null;
    words.push({
      offset,
      valueHex: `0x${value.toString(16).padStart(8, '0')}`,
      candidateFileOffset: candidateOffset,
      inBounds: candidateOffset === null ? null : candidateOffset <= b.length,
    });
  }
  const validMagic = magic === 'DCPM' && tag === 0x43;
  if (!validMagic) failures++;
  console.log(JSON.stringify({
    file,
    bytes: b.length,
    magic,
    tagByte: `0x${tag?.toString(16).padStart(2, '0') ?? '??'}`,
    validDcpSignature: validMagic,
    pointerBase: `0x${pointerBase.toString(16)}`,
    first64Hex: hex(b, 0, Math.min(64, b.length)),
    headerWords: words,
  }));
}
if (failures) process.exitCode = 1;
