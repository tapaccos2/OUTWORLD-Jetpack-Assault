#!/usr/bin/env node
/**
 * Convert standard PCX version 5 images to PNG (8-bit indexed / 1 plane or
 * 8-bit RGB / 3 planes). This covers the common PCX forms observed in the
 * original Outwars mission directory.
 *
 * Usage:
 *   node tools/pcx-to-png.mjs input.PCX [output.png]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [input, outputArg] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node tools/pcx-to-png.mjs input.PCX [output.png]');
  process.exit(2);
}
const src = fs.readFileSync(input);
const u16 = offset => src[offset] | (src[offset + 1] << 8);
const manufacturer = src[0], version = src[1], encoding = src[2], bits = src[3];
const xmin = u16(4), ymin = u16(6), xmax = u16(8), ymax = u16(10);
const width = xmax - xmin + 1, height = ymax - ymin + 1;
const planes = src[65], bytesPerLine = u16(66);

if (manufacturer !== 10 || version !== 5 || encoding !== 1 || bits !== 8 ||
    !width || !height || ![1, 3].includes(planes) || bytesPerLine < width) {
  throw new Error('Unsupported PCX header; expected version 5, RLE, 8-bit, 1 or 3 planes.');
}

const paletteStart = planes === 1 ? src.length - 769 : src.length;
if (planes === 1 && (paletteStart < 128 || src[paletteStart] !== 12)) {
  throw new Error('Missing 256-colour PCX palette.');
}
const encodedEnd = paletteStart;
const rowBytes = bytesPerLine * planes;
const decoded = Buffer.alloc(height * rowBytes);
let inputOffset = 128, outOffset = 0;
while (outOffset < decoded.length && inputOffset < encodedEnd) {
  const value = src[inputOffset++];
  if ((value & 0xc0) === 0xc0) {
    const count = value & 0x3f;
    if (!count || inputOffset >= encodedEnd) throw new Error('Invalid PCX RLE run.');
    const pixel = src[inputOffset++];
    decoded.fill(pixel, outOffset, Math.min(outOffset + count, decoded.length));
    outOffset += count;
  } else {
    decoded[outOffset++] = value;
  }
}
if (outOffset < decoded.length) throw new Error(`PCX pixel data truncated: ${outOffset}/${decoded.length} bytes.`);

const rgba = Buffer.alloc(width * height * 4);
const palette = planes === 1 ? src.subarray(paletteStart + 1, paletteStart + 769) : null;
for (let y = 0; y < height; y++) {
  const row = y * rowBytes;
  for (let x = 0; x < width; x++) {
    const dst = (y * width + x) * 4;
    if (planes === 1) {
      const index = decoded[row + x], p = index * 3;
      rgba[dst] = palette[p]; rgba[dst + 1] = palette[p + 1]; rgba[dst + 2] = palette[p + 2];
    } else {
      rgba[dst] = decoded[row + x];
      rgba[dst + 1] = decoded[row + bytesPerLine + x];
      rgba[dst + 2] = decoded[row + bytesPerLine * 2 + x];
    }
    rgba[dst + 3] = 255;
  }
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const scanlines = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y++) {
  const dst = y * (1 + width * 4);
  scanlines[dst] = 0; // PNG filter: None
  rgba.copy(scanlines, dst + 1, y * width * 4, (y + 1) * width * 4);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(scanlines)),
  chunk('IEND', Buffer.alloc(0)),
]);
const output = outputArg ?? path.join(path.dirname(input), path.basename(input, path.extname(input)) + '.png');
fs.writeFileSync(output, png);
console.log(`Converted ${input}: ${width}x${height}, ${planes} plane(s) -> ${output}`);
