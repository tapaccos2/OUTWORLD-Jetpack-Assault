#!/usr/bin/env node
/**
 * Inventory version-0x43 Outwars TPC record framing and image extents.
 * Does not guess the still-unknown 16-bit pixel encoding.
 *
 * Usage: node tools/inspect-tpc-records.mjs <file.tpc> [output.json]
 */
import fs from 'node:fs';
const [input, output] = process.argv.slice(2);
if (!input) throw new Error('Usage: node tools/inspect-tpc-records.mjs <file.tpc> [output.json]');
const b = fs.readFileSync(input);
if (b.length < 40 || b.toString('ascii', 0, 4) !== 'TCPM' || b.readUInt32LE(4) !== 0x43) throw new Error('Expected TPCMC version 0x43');
const recordCount = b.readUInt32LE(12);
const records = [];
let offset = 0x10;
for (let index = 0; index < recordCount; index++) {
  if (offset + 548 > b.length) throw new Error('Record ' + index + ': truncated header');
  const storedSize = b.readUInt32LE(offset);
  const flags = b.readUInt32LE(offset + 8);
  const tableCount = b.readUInt32LE(offset + 12);
  const paletteOffset = offset + 24;
  const imageHeaderOffset = offset + 536;
  const subImageBytes = b.readUInt32LE(imageHeaderOffset);
  const width = b.readUInt16LE(imageHeaderOffset + 8);
  const height = b.readUInt16LE(imageHeaderOffset + 10);
  const pixelOffset = offset + 548;
  const pixelBytes = width * height * 2;
  const nextOffset = offset + storedSize + 4;
  if (subImageBytes !== pixelBytes + 12) throw new Error('Record ' + index + ': inner payload size does not match dimensions');
  if (nextOffset !== pixelOffset + pixelBytes) throw new Error('Record ' + index + ': outer record extent does not match inner pixel extent');
  const palette = [];
  for (let i = 0; i < 256; i++) palette.push(b.readUInt16LE(paletteOffset + i * 2));
  const words = new Set();
  for (let i = 0; i < pixelBytes; i += 2) words.add(b.readUInt16LE(pixelOffset + i));
  records.push({ index, offset, storedSize, blockBytesIncludingSizeWord: storedSize + 4, flags, flagsHex: '0x' + flags.toString(16),
    tableCountField: tableCount, paletteOffset, paletteEntries: 256, paletteZeroWords: palette.filter(x => x === 0).length,
    paletteFormat: 'RGB555 (conversion path confirmed in executable)', imageHeaderOffset, innerPayloadBytes: subImageBytes,
    width, height, pixelOffset, pixelBytes, bytesPerPixel: 2, unique16BitPayloadWords: words.size, nextOffset });
  offset = nextOffset;
}
if (offset !== b.length) throw new Error('After ' + recordCount + ' records, stopped at 0x' + offset.toString(16) + ' of 0x' + b.length.toString(16));
const result = { input, bytes: b.length, signature: 'TPCMC', version: 0x43, recordCount, records,
  note: 'Record framing, per-record RGB555 palettes, image dimensions and 16-bit payload extents validate exactly. Pixel-word meaning and flag-dependent decode paths remain unresolved.' };
const json = JSON.stringify(result, null, 2) + '\n';
if (output) fs.writeFileSync(output, json); else process.stdout.write(json);
