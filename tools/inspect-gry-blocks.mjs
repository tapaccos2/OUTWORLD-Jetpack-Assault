#!/usr/bin/env node
/**
 * Inspect candidate indexed terrain blocks in Outwars .GRY files.
 * This validates record boundaries and size fields; it does not decompress data.
 *
 * Usage:
 *   node tools/inspect-gry-blocks.mjs original-data/gry/*.gry
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-gry-blocks.mjs <file.gry> [...]');
  process.exit(2);
}

function u16be(b, o) { return (b[o] << 8) | b[o + 1]; }
function u32le(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function u24le(b, o) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16); }
function hex(b, start, end) {
  return b.subarray(start, end).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '';
}

const output = files.map(file => {
  const b = fs.readFileSync(file);
  const signatures = [];
  for (let i = 0; i + 4 <= b.length; i++) {
    if (i > 0 && b[i + 1] === 0xa0 && b[i + 2] === 0xb9 && b[i + 3] === 0xb7) signatures.push(i);
  }
  const factTags = [];
  for (let i = 0; i + 8 <= b.length; i++) {
    if (b[i] === 0x66 && b[i + 1] === 0x61 && b[i + 2] === 0x63 && b[i + 3] === 0x74 && u32le(b, i + 4) === 4) {
      const recordStart = i - 59;
      if (recordStart >= 0 && recordStart + 4 <= b.length && b[recordStart + 1] === 0xa0 && b[recordStart + 2] === 0xb9 && b[recordStart + 3] === 0xb7) {
        factTags.push({ recordStart, factOffset: i, uncompressedLengthCandidate: u32le(b, i + 8) });
      }
    }
  }
  const blocks = factTags.map((r, index) => {
    const compressedHeaderOffset = r.recordStart + 71;
    const compressedHeaderPresent = compressedHeaderOffset + 7 <= b.length &&
      b[compressedHeaderOffset] === 0x2e && b[compressedHeaderOffset + 1] === 0x3e &&
      b[compressedHeaderOffset + 2] === 0x9d && b[compressedHeaderOffset + 3] === 0x00;
    const compressedLength = compressedHeaderPresent ? u24le(b, compressedHeaderOffset + 4) : null;
    const payloadOffset = compressedHeaderOffset + 7;
    const payloadEnd = compressedLength === null ? null : payloadOffset + compressedLength;
    const nextRecordStart = factTags[index + 1]?.recordStart ?? null;
    const isFinal = index === factTags.length - 1;
    const trailer = isFinal && b.length >= 5 ? hex(b, b.length - 5, b.length) : null;
    const finalTrailerPattern = isFinal && b.length >= 5 && b[b.length - 4] === 0x22 && b[b.length - 3] === 0x75 && b[b.length - 2] === 0x28 && b[b.length - 1] === 0x03;
    const expectedEnd = isFinal ? b.length - (finalTrailerPattern ? 5 : 0) : nextRecordStart;
    return {
      indexInFile: index,
      recordStart: r.recordStart,
      leadingByte: b[r.recordStart],
      sequentialIndexCandidateBE: u16be(b, r.recordStart + 4),
      constantU16CandidateBE: u16be(b, r.recordStart + 6),
      factOffset: r.factOffset,
      uncompressedLengthCandidate: r.uncompressedLengthCandidate,
      compressedHeaderOffset,
      compressedHeaderPresent,
      compressedLengthU24LE: compressedLength,
      compressedPayloadOffset: payloadOffset,
      compressedPayloadEnd: payloadEnd,
      nextRecordStart: nextRecordStart ?? (isFinal ? b.length : null),
      finalTrailerHex: trailer,
      finalTrailerPattern: isFinal ? finalTrailerPattern : null,
      boundaryMatches: compressedHeaderPresent && payloadEnd === expectedEnd,
      uncompressedToCompressedRatio: compressedLength && r.uncompressedLengthCandidate ? +(r.uncompressedLengthCandidate / compressedLength).toFixed(5) : null,
      compressedPayloadPrefixHex: compressedHeaderPresent ? hex(b, payloadOffset, Math.min(payloadOffset + 16, payloadEnd)) : null,
    };
  });
  return {
    file: path.basename(file),
    bytes: b.length,
    signatureStarts: signatures,
    signatureCount: signatures.length,
    pairedFactBlockCount: blocks.length,
    unmatchedSignatureStarts: signatures.filter(s => !factTags.some(r => r.recordStart === s)),
    blocks,
  };
});

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
