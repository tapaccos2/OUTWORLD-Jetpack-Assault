#!/usr/bin/env node
/**
 * Test common built-in Node.js compression formats against candidate .GRY blocks.
 * This is an identification probe only; a failed probe does not rule out a
 * proprietary or game-specific codec.
 *
 * Usage:
 *   node tools/test-gry-compression.mjs original-data/gry/j1.gry
 *   node tools/test-gry-compression.mjs original-data/gry/*.gry
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function u32le(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function u24le(b, o) {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}
function findFactRecords(b) {
  const records = [];
  for (let i = 0; i + 12 <= b.length; i++) {
    if (b[i] !== 0x66 || b[i + 1] !== 0x61 || b[i + 2] !== 0x63 || b[i + 3] !== 0x74 || u32le(b, i + 4) !== 4) continue;
    const recordStart = i - 59;
    if (recordStart < 0 || b[recordStart + 1] !== 0xa0 || b[recordStart + 2] !== 0xb9 || b[recordStart + 3] !== 0xb7) continue;
    const header = recordStart + 71;
    if (header + 7 > b.length || b[header] !== 0x2e || b[header + 1] !== 0x3e || b[header + 2] !== 0x9d || b[header + 3] !== 0) continue;
    const compressedLength = u24le(b, header + 4);
    const payloadOffset = header + 7;
    if (payloadOffset + compressedLength > b.length) continue;
    records.push({
      recordStart,
      uncompressedLengthCandidate: u32le(b, i + 8),
      compressedLength,
      payloadOffset,
      payload: b.subarray(payloadOffset, payloadOffset + compressedLength),
    });
  }
  return records;
}

const codecs = [
  ['zlib-deflate', zlib.inflateSync],
  ['raw-deflate', zlib.inflateRawSync],
  ['gzip', zlib.gunzipSync],
  ['zlib-auto', zlib.unzipSync],
  ['brotli', zlib.brotliDecompressSync],
];

let total = 0;
let successes = 0;
const output = [];
for (const file of process.argv.slice(2)) {
  const b = fs.readFileSync(file);
  const records = findFactRecords(b);
  for (const record of records) {
    total++;
    const tests = codecs.map(([name, decode]) => {
      try {
        const decoded = decode(record.payload);
        const exactLength = decoded.length === record.uncompressedLengthCandidate;
        if (exactLength) successes++;
        return {
          codec: name,
          decodedLength: decoded.length,
          expectedLength: record.uncompressedLengthCandidate,
          exactLength,
          prefixHex: decoded.subarray(0, 12).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '',
        };
      } catch (e) {
        return { codec: name, error: e.code ?? e.message };
      }
    });
    output.push({
      file: path.basename(file),
      recordStart: record.recordStart,
      compressedLength: record.compressedLength,
      expectedLengthCandidate: record.uncompressedLengthCandidate,
      tests,
    });
  }
}
process.stdout.write(JSON.stringify({
  blocksTested: total,
  exactLengthMatches: successes,
  note: 'Only standard Node.js codecs were tested. No match means the codec may be proprietary or require a wrapper/header.',
  results: output,
}, null, 2) + '\n');
