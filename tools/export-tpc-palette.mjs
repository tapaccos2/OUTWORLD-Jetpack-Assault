#!/usr/bin/env node
/**
 * Export the first Outwars TPC palette as a diagnostic PNG.
 *
 * The original executable at VA 0x0048d4a7 reads 256 little-endian words
 * from texture-record +0x14. In the Scout TPC the first palette starts at
 * file offset 0x28. Components are RGB555; a zero word marks transparency.
 *
 * This deliberately exports only the palette swatch. It is not a complete
 * TPC pixel-stream decoder.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const [input, output = 'scout-palette.png'] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node tools/export-tpc-palette.mjs <file.tpc> [output.png]');
  process.exit(2);
}
const bytes = fs.readFileSync(input);
const paletteOffset = 0x28;
if (bytes.length < paletteOffset + 512 ||
    bytes.toString('ascii', 0, 4) !== 'TCPM' ||
    bytes.readUInt32LE(4) !== 0x43) {
  throw new Error('Expected TPCMC version 0x43 with a complete first palette');
}

const rgba = Buffer.alloc(256 * 4);
let transparentEntries = 0;
for (let i = 0; i < 256; i++) {
  const value = bytes.readUInt16LE(paletteOffset + i * 2);
  const r = value & 31;
  const g = (value >>> 5) & 31;
  const b = (value >>> 10) & 31;
  rgba[i * 4] = (r << 3) | (r >>> 2);
  rgba[i * 4 + 1] = (g << 3) | (g >>> 2);
  rgba[i * 4 + 2] = (b << 3) | (b >>> 2);
  rgba[i * 4 + 3] = value === 0 ? 0 : 255;
  if (value === 0) transparentEntries++;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

const width = 256;
const height = 32;
const rowBytes = 1 + width * 4;
const scanlines = Buffer.alloc(height * rowBytes);
for (let y = 0; y < height; y++) {
  const row = y * rowBytes;
  scanlines[row] = 0; // PNG filter: None
  for (let x = 0; x < width; x++) {
    rgba.copy(scanlines, row + 1 + x * 4, x * 4, x * 4 + 4);
  }
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(scanlines)),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(output, png);
console.log(JSON.stringify({
  input, output, paletteOffset: '0x28', entries: 256,
  transparentEntries, format: 'RGB555',
  note: 'Palette diagnostic only; pixel-record stream is not decoded.',
}, null, 2));
