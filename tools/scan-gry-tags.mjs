#!/usr/bin/env node
/**
 * Find printable four-byte tags followed by a plausible little-endian 32-bit
 * length in Outwars .GRY files. This is a candidate scanner, not a chunk parser:
 * coincidental matches are possible and no payload is decoded.
 *
 * Usage:
 *   node tools/scan-gry-tags.mjs original-data/gry/*.gry
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/scan-gry-tags.mjs <file.gry> [...]');
  process.exit(2);
}

function u32le(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

const output = files.map(file => {
  const b = fs.readFileSync(file);
  const candidates = [];
  const marker = [0x00, 0xa0, 0xb9, 0xb7];
  const hasMarkerAt = offset => offset >= 0 && offset + 4 <= b.length && marker.every((v, i) => b[offset + i] === v);
  const markerOffsets = [];
  for (let i = 0; i <= b.length - 4; i++) if (hasMarkerAt(i)) markerOffsets.push(i);
  for (let offset = 0; offset <= b.length - 8; offset++) {
    const tagBytes = b.subarray(offset, offset + 4);
    if (![...tagBytes].every(v => (v >= 0x41 && v <= 0x5a) || (v >= 0x61 && v <= 0x7a))) continue;
    const length = u32le(b, offset + 4);
    // A conservative bound avoids reporting implausibly huge lengths. This
    // only tests whether the candidate would fit; it does not prove a chunk.
    if (length === 0 || length > b.length - offset - 8 || length > 1_000_000) continue;
    candidates.push({
      offset,
      tag: tagBytes.toString('ascii'),
      precedingTerrainMarkerOffset: hasMarkerAt(offset - 59) ? offset - 59 : null,
      length,
      payloadOffset: offset + 8,
      endOffset: offset + 8 + length,
      payloadU32LE: length === 4 ? u32le(b, offset + 8) : null,
      payloadU32BE: length === 4 ? (((b[offset + 8] << 24) | (b[offset + 9] << 16) | (b[offset + 10] << 8) | b[offset + 11]) >>> 0) : null,
      payloadHex: b.subarray(offset + 8, Math.min(offset + 8 + length, offset + 24)).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '',
    });
  }
  const counts = {};
  for (const c of candidates) counts[c.tag] = (counts[c.tag] ?? 0) + 1;
  return { file: path.basename(file), bytes: b.length, terrainMarkerCount: markerOffsets.length, terrainMarkerOffsets: markerOffsets, markerToFactPairs: candidates.filter(c => c.tag === 'fact' && c.precedingTerrainMarkerOffset !== null).map(c => ({ markerOffset: c.precedingTerrainMarkerOffset, tagOffset: c.offset, gap: c.offset - c.precedingTerrainMarkerOffset })), candidateCount: candidates.length, tagCounts: counts, candidates };
});

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
