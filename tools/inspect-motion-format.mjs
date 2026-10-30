#!/usr/bin/env node
/**
 * Inspect original Outwars motion (.MC) frame containers.
 * The first little-endian DWORD is consistent with a frame count. The
 * observed per-frame payload stride is 152 bytes in 58 archive resources.
 * Internal channel/skeleton semantics are intentionally not guessed.
 * Usage: node tools/inspect-motion-format.mjs extracted-ff/motion/*.mc
 */
import fs from 'node:fs';
const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-motion-format.mjs <file.mc> [...]');
  process.exit(2);
}
const records = [];
let invalid = 0;
for (const file of files) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 4) {
    records.push({ file, bytes: bytes.length, validHeader: false, error: 'shorter than frame-count header' });
    invalid++;
    continue;
  }
  const frameCount = bytes.readUInt32LE(0);
  const payloadBytes = bytes.length - 4;
  const exactStride = frameCount > 0 && payloadBytes % frameCount === 0 ? payloadBytes / frameCount : null;
  const record = {
    file, bytes: bytes.length, frameCount, payloadBytes,
    exactStrideBytes: exactStride,
    matchesObserved152ByteFrame: exactStride === 152,
    trailingBytesAfter152ByteFrames: frameCount > 0 ? payloadBytes - frameCount * 152 : payloadBytes,
    firstFrameHex: bytes.subarray(4, Math.min(bytes.length, 156)).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '',
  };
  if (!record.matchesObserved152ByteFrame) invalid++;
  records.push(record);
}
const strideCounts = {};
for (const record of records) {
  const key = record.exactStrideBytes === null ? 'non-integral-or-zero' : String(record.exactStrideBytes);
  strideCounts[key] = (strideCounts[key] ?? 0) + 1;
}
process.stdout.write(JSON.stringify({
  filesInspected: records.length,
  filesNotMatching152ByteStride: invalid,
  strideCounts,
  records,
  note: '152 bytes is a repeatable per-frame payload stride. Internal fields remain raw; no skeleton or animation-channel semantics are inferred.'
}, null, 2) + '\n');
