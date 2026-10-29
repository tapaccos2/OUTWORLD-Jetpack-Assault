#!/usr/bin/env node
/**
 * Compare Outwars .GRY headers and repeated byte sequences across terrain files.
 * The sequence 00 A0 B9 B7 is an observed byte pattern, not a proven section
 * boundary. This tool reports observations only; it does not decode terrain.
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
function findAll(b, needle) {
  const hits = [];
  for (let i = 0; i <= b.length - needle.length; i++) {
    let same = true;
    for (let j = 0; j < needle.length; j++) {
      if (b[i + j] !== needle[j]) { same = false; break; }
    }
    if (same) hits.push(i);
  }
  return hits;
}
function commonPrefix(buffers) {
  if (!buffers.length) return 0;
  let n = Math.min(...buffers.map(b => b.length));
  for (let i = 0; i < n; i++) {
    const v = buffers[0][i];
    if (buffers.some(b => b[i] !== v)) return i;
  }
  return n;
}

const records = files.map(file => {
  const b = fs.readFileSync(file);
  if (b.length < 12) {
    return { file: path.basename(file), bytes: b.length, error: 'File too short or empty', buffer: b };
  }
  const marker = Buffer.from([0x00, 0xa0, 0xb9, 0xb7]);
  const markerOffsets = findAll(b, marker);
  const firstMarker = markerOffsets[0] ?? null;
  const header = [u16(b, 4), u16(b, 6), u16(b, 8), u16(b, 10)];
  const candidateRecords = [];
  if (firstMarker !== null && firstMarker >= 12) {
    const fullRecords = Math.floor((firstMarker - 12) / 20);
    for (let n = 0; n < Math.min(fullRecords, 64); n++) {
      const o = 12 + n * 20;
      candidateRecords.push({
        offset: o,
        wordsU32LE: Array.from({ length: 5 }, (_, j) => u32(b, o + j * 4)),
        wordsU16LE: Array.from({ length: 10 }, (_, j) => u16(b, o + j * 2)),
      });
    }
  }
  if (firstMarker !== null && header[2] >= header[1]) {
    const start = 12 + header[1] * 20;
    const count = Math.min(header[2] - header[1], 64);
    for (let n = 0; n < count && start + (n + 1) * 14 <= firstMarker; n++) {
      const o = start + n * 14;
      candidate14ByteBlocks.push({
        offset: o,
        wordsU16LE: Array.from({ length: 7 }, (_, j) => u16(b, o + j * 2)),
        bytesHex: hex(b, o, o + 14),
      });
    }
  }
  return {
    file: path.basename(file),
    bytes: b.length,
    magic: hex(b, 0, 4),
    headerU16LE: header,
    markerOffsets,
    bytesBeforeFirstMarker: firstMarker === null ? null : firstMarker - 12,
    candidate20ByteRecordsBeforeMarker: candidateRecords,
    candidate14ByteBlocksAfter20ByteRegion: candidate14ByteBlocks,
    complete20ByteBlocksBeforeMarker: firstMarker === null ? null : Math.floor((firstMarker - 12) / 20),
    headerSecondU16Times20: firstMarker === null ? null : header[1] * 20,
    bytesBeyondHeaderSecondU16Times20: firstMarker === null ? null : (firstMarker - 12) - (header[1] * 20),
    headerThirdMinusSecondTimes14: firstMarker === null ? null : (header[2] - header[1]) * 14,
    candidatePreMarkerBytes: firstMarker === null ? null : (header[1] * 20) + ((header[2] - header[1]) * 14),
    candidateRecordModelMatches: firstMarker === null ? null : (firstMarker - 12) === (header[1] * 20) + ((header[2] - header[1]) * 14),
    bytesAtFirstMarker: firstMarker === null ? null : hex(b, firstMarker, Math.min(firstMarker + 64, b.length)),
    bytesAfterFirstMarkerHex: firstMarker === null ? null : hex(b, firstMarker, Math.min(firstMarker + 32, b.length)),
    buffer: b,
    firstMarker,
  };
});

const valid = records.filter(r => r.buffer && r.firstMarker !== null);
const commonAfterMarker = valid.length
  ? commonPrefix(valid.map(r => r.buffer.subarray(r.firstMarker, r.firstMarker + 128)))
  : 0;
const markerSignatures = new Map();
for (const r of valid) {
  const signature = hex(r.buffer, r.firstMarker, Math.min(r.firstMarker + 64, r.buffer.length));
  const group = markerSignatures.get(signature) ?? [];
  group.push(r.file);
  markerSignatures.set(signature, group);
}
const output = {
  summary: {
    filesInspected: records.length,
    commonPrefixAtFileStart: commonPrefix(records.filter(r => r.buffer).map(r => r.buffer)),
    filesWithMarker: valid.length,
    commonBytesStartingAtFirstMarker: commonAfterMarker,
    identical64ByteSignaturesAtFirstMarker: [...markerSignatures.entries()].map(([signatureHex, files]) => ({ files, signatureHex })),
    note: 'A repeated sequence or shared byte prefix is evidence of structure, not proof of field meanings or a section boundary.',
  },
  files: records.map(({ buffer, firstMarker, ...record }) => record),
};
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
