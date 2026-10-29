#!/usr/bin/env node
/**
 * Compare Outwars .GRY headers and recurring terrain signatures across files.
 * The bytes A0 B9 B7 recur at a fixed offset before `fact` tags, with a variable
 * leading byte. This tool reports observations; it does not decode terrain.
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
  if (b.length < 12) return { file: path.basename(file), bytes: b.length, error: 'File too short or empty', buffer: b };
  const suffixOffsets = findAll(b, Buffer.from([0xa0, 0xb9, 0xb7]));
  // Include the variable byte immediately before the recurring three-byte suffix.
  const signatureOffsets = suffixOffsets.filter(offset => offset > 0).map(offset => offset - 1);
  const firstSignature = signatureOffsets[0] ?? null;
  const header = [u16(b, 4), u16(b, 6), u16(b, 8), u16(b, 10)];
  const candidateRecords = [];
  const candidate14ByteBlocks = [];
  if (firstSignature !== null && firstSignature >= 12) {
    const fullRecords = Math.min(Math.floor((firstSignature - 12) / 20), header[1]);
    for (let n = 0; n < Math.min(fullRecords, 64); n++) {
      const o = 12 + n * 20;
      candidateRecords.push({
        offset: o,
        wordsU32LE: Array.from({ length: 5 }, (_, j) => u32(b, o + j * 4)),
        wordsU16LE: Array.from({ length: 10 }, (_, j) => u16(b, o + j * 2)),
      });
    }
    if (header[2] >= header[1]) {
      const start = 12 + header[1] * 20;
      const count = Math.min(header[2] - header[1], 64);
      for (let n = 0; n < count && start + (n + 1) * 14 <= firstSignature; n++) {
        const o = start + n * 14;
        candidate14ByteBlocks.push({
          offset: o,
          wordsU16LE: Array.from({ length: 7 }, (_, j) => u16(b, o + j * 2)),
          bytesHex: hex(b, o, o + 14),
        });
      }
    }
  }
  return {
    file: path.basename(file),
    bytes: b.length,
    magic: hex(b, 0, 4),
    headerU16LE: header,
    signatureOffsets,
    signatureCount: signatureOffsets.length,
    bytesBeforeFirstSignature: firstSignature === null ? null : firstSignature - 12,
    candidate20ByteRecordsBeforeSignature: candidateRecords,
    candidate14ByteBlocksAfter20ByteRegion: candidate14ByteBlocks,
    candidate20ByteRecordCount: candidateRecords.length,
    headerSecondU16Times20: firstSignature === null ? null : header[1] * 20,
    bytesBeyondHeaderSecondU16Times20: firstSignature === null ? null : (firstSignature - 12) - (header[1] * 20),
    headerThirdMinusSecondTimes14: firstSignature === null ? null : (header[2] - header[1]) * 14,
    candidatePreSignatureBytes: firstSignature === null ? null : (header[1] * 20) + ((header[2] - header[1]) * 14),
    candidateRecordModelMatches: firstSignature === null ? null : (firstSignature - 12) === (header[1] * 20) + ((header[2] - header[1]) * 14),
    bytesAtFirstSignature: firstSignature === null ? null : hex(b, firstSignature, Math.min(firstSignature + 64, b.length)),
    buffer: b,
    firstSignature,
  };
});

const valid = records.filter(r => r.buffer && r.firstSignature !== null);
const commonAfterSignature = valid.length
  ? commonPrefix(valid.map(r => r.buffer.subarray(r.firstSignature, r.firstSignature + 128)))
  : 0;
const signatureGroups = new Map();
for (const r of valid) {
  const signature = hex(r.buffer, r.firstSignature, Math.min(r.firstSignature + 64, r.buffer.length));
  const group = signatureGroups.get(signature) ?? [];
  group.push(r.file);
  signatureGroups.set(signature, group);
}
const output = {
  summary: {
    filesInspected: records.length,
    commonPrefixAtFileStart: commonPrefix(records.filter(r => r.buffer).map(r => r.buffer)),
    filesWithSignature: valid.length,
    totalSignatureOccurrences: records.reduce((sum, r) => sum + (r.signatureCount ?? 0), 0),
    commonBytesStartingAtFirstSignature: commonAfterSignature,
    identical64ByteSignaturesAtFirstOccurrence: [...signatureGroups.entries()].map(([signatureHex, groupedFiles]) => ({ files: groupedFiles, signatureHex })),
    note: 'The A0 B9 B7 suffix and related byte-count patterns are observations, not decoded field meanings.',
  },
  files: records.map(({ buffer, firstSignature, ...record }) => record),
};
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
