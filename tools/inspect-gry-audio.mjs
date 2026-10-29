#!/usr/bin/env node
/**
 * Inspect and optionally extract sound-effect records from Outwars .GRY files.
 *
 * The .GRY files are audio containers, not terrain geometry. Each embedded
 * sound record starts with A0 B9 B7 00 and has a 2E 3E 9D 00 data marker.
 * Outwars records use MS ADPCM except o5.gry, which uses PCM16LE.
 *
 * Usage:
 *   node tools/inspect-gry-audio.mjs original-data/gry/*.gry
 *   node tools/inspect-gry-audio.mjs --extract extracted-gry-audio original-data/gry/*.gry
 *
 * Extracted .vgmstream files retain their per-sound headers. A matching .txth
 * sidecar is written using the community vgmstream settings cited in
 * original-data/GRY-STRUCTURE-INDEX.md; playback should still be checked.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let extractDir = null;
const extractAt = args.indexOf('--extract');
if (extractAt >= 0) {
  extractDir = args[extractAt + 1];
  if (!extractDir) {
    console.error('Usage: node tools/inspect-gry-audio.mjs --extract <output-dir> <file.gry> [...]');
    process.exit(2);
  }
  args.splice(extractAt, 2);
}
const files = args;
if (!files.length) {
  console.error('Usage: node tools/inspect-gry-audio.mjs [--extract <output-dir>] <file.gry> [...]');
  process.exit(2);
}
if (extractDir) fs.mkdirSync(extractDir, { recursive: true });

function u16le(b, o) { return b.readUInt16LE(o); }
function u32le(b, o) { return b.readUInt32LE(o); }
function findBytes(b, signature, start = 0) {
  return b.indexOf(signature, start);
}
const sampleMagic = Buffer.from([0xa0, 0xb9, 0xb7, 0x00]);
const dataMagic = Buffer.from([0x2e, 0x3e, 0x9d, 0x00]);
const trailer = Buffer.from([0x22, 0x75, 0x28, 0x03]);

function txthFor(codec) {
  if (codec === 'PCM16LE') {
    return [
      'id_value = 0xA0B9B700',
      'id_offset = @0x00:BE',
      'codec = PCM16LE',
      'channels = @0x0a$1',
      'sample_rate = @0x0c',
      'start_offset = 0x20',
      'data_size = @0x1c',
      'num_samples = data_size',
      '',
    ].join('\n');
  }
  return [
    'id_value = 0xA0B9B700',
    'id_offset = @0x00:BE',
    'codec = MSADPCM',
    'interleave = @0x14$2',
    'channels = @0x0a$1',
    'sample_rate = @0x0c',
    'start_offset = 0x4e',
    'data_size = @0x4a',
    'num_samples = data_size',
    '',
  ].join('\n');
}

const reports = [];
let errors = 0;
for (const file of files) {
  const b = fs.readFileSync(file);
  const starts = [];
  for (let p = 0; (p = findBytes(b, sampleMagic, p)) >= 0; p += sampleMagic.length) starts.push(p);

  const records = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const marker = findBytes(b, dataMagic, start + sampleMagic.length);
    if (marker < 0) {
      records.push({ index: i + 1, start, error: 'missing 2E 3E 9D 00 marker' });
      errors++;
      continue;
    }
    const relativeMarker = marker - start;
    const codec = relativeMarker === 0x18 ? 'PCM16LE' : relativeMarker === 0x46 ? 'MSADPCM' : 'unknown';
    const sizeOffset = marker + 4;
    const payloadOffset = marker + 8;
    if (sizeOffset + 4 > b.length) {
      records.push({ index: i + 1, start, marker, error: 'truncated data-size field' });
      errors++;
      continue;
    }
    const dataSize = u32le(b, sizeOffset);
    const end = payloadOffset + dataSize;
    const nextBoundary = i + 1 < starts.length ? starts[i + 1] : b.length - trailer.length;
    const hasFact = codec === 'MSADPCM'
      && b.subarray(start + 0x3a, start + 0x3e).toString('ascii') === 'fact'
      && u32le(b, start + 0x3e) === 4;
    const decodedBytesCandidate = hasFact ? u32le(b, start + 0x42) : null;
    const record = {
      index: i + 1,
      start,
      codec,
      markerOffset: marker,
      markerRelative: relativeMarker,
      channels: b[start + 0x0a],
      sampleRate: u32le(b, start + 0x0c),
      interleave: codec === 'MSADPCM' ? u16le(b, start + 0x14) : null,
      streamSize: dataSize,
      payloadOffset,
      end,
      nextBoundary,
      boundaryMatches: end === nextBoundary,
      factTag: hasFact,
      decodedBytesCandidate,
    };
    if (codec === 'unknown' || end > b.length || !record.boundaryMatches) errors++;
    records.push(record);

    if (extractDir && codec !== 'unknown' && end <= b.length) {
      const stem = `${path.basename(file, path.extname(file))}_${String(i + 1).padStart(2, '0')}_${String(start).padStart(6, '0')}`;
      fs.writeFileSync(path.join(extractDir, `${stem}.vgmstream`), b.subarray(start, end));
      fs.writeFileSync(path.join(extractDir, `${stem}.txth`), txthFor(codec));
    }
  }

  const report = {
    file,
    bytes: b.length,
    prefix: b.subarray(0, 4).toString('hex').match(/.{2}/g)?.join(' ') ?? '',
    sampleCount: records.length,
    trailingFourBytes: b.subarray(-4).equals(trailer),
    records,
  };
  reports.push(report);
  console.log(JSON.stringify(report));
}
if (extractDir) console.error(`Extracted audio records and .txth sidecars to ${extractDir}`);
if (errors) process.exitCode = 1;
