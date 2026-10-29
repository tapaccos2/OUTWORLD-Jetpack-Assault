#!/usr/bin/env node
/**
 * Inspect Outwars .GRY terrain headers and locate the recurring 00 A0 B9 B7
 * marker observed in multiple original files. This is a boundary probe, not
 * a full terrain decoder.
 *
 * Usage:
 *   node tools/inspect-gry-structure.mjs original-data/gry/*.gry
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-gry-structure.mjs <file.gry> [...]');
  process.exit(2);
}

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function hex(b, start, end) {
  return b.subarray(start, end).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '';
}

const result = files.map(file => {
  const b = fs.readFileSync(file);
  if (b.length < 12) {
    return { file: path.basename(file), bytes: b.length, error: 'File too short or empty' };
  }
  const magic = hex(b, 0, 4);
  const header = [u16(b, 4), u16(b, 6), u16(b, 8), u16(b, 10)];
  const marker = [0x00, 0xa0, 0xb9, 0xb7];
  const markerOffsets = [];
  for (let i = 12; i <= b.length - 4; i++) {
    if (b[i] === marker[0] && b[i + 1] === marker[1] &&
        b[i + 2] === marker[2] && b[i + 3] === marker[3]) {
      markerOffsets.push(i);
    }
  }
  const firstMarker = markerOffsets[0] ?? null;
  const candidateRecords = [];
  // The region after the 12-byte common header shows repeating 20-byte values
  // in several files. Report them as raw unsigned words, without assigning
  // semantics or assuming the table always has the same length.
  if (firstMarker !== null && firstMarker >= 12) {
    const span = firstMarker - 12;
    const fullRecords = Math.floor(span / 20);
    for (let n = 0; n < Math.min(fullRecords, 64); n++) {
      const o = 12 + n * 20;
      candidateRecords.push({
        offset: o,
        wordsLE: Array.from({ length: 5 }, (_, j) => u32(b, o + j * 4)),
      });
    }
  }
  return {
    file: path.basename(file),
    bytes: b.length,
    magic,
    headerU16LE: header,
    markerOffsets,
    bytesBeforeFirstMarker: firstMarker === null ? null : firstMarker - 12,
    candidate20ByteRecordsBeforeMarker: candidateRecords,
    bytesAtFirstMarker: firstMarker === null ? null : hex(b, firstMarker, Math.min(firstMarker + 32, b.length)),
  };
});
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
