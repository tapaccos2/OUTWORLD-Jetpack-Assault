#!/usr/bin/env node
/**
 * Decode TPCMC v0x43 records into indexed PNGs.
 * Palette words are RGB555; image bytes are 8-bit palette indices.
 * Stored width is half decoded width. Validates record extents and file consumption.
 * Usage: node tools/export-tpc-images.mjs <file.tpc> [output-directory]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [input, outDir = 'tpc-export'] = process.argv.slice(2);
if (!input) throw new Error('Usage: node export-tpc-images.mjs <file.tpc> [output-directory]');
const b = fs.readFileSync(input);
if (b.length < 16 || b.toString('ascii', 0, 4) !== 'TCPM' || b.readUInt32LE(4) !== 0x43) throw new Error('Expected TPCMC v0x43');
const recordCount = b.readUInt32LE(12);
if (!recordCount || recordCount > 4096) throw new Error('Invalid TPC record count: ' + recordCount);
fs.mkdirSync(outDir, { recursive: true });
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii'), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
}
function indexedPng(width, height, pixels, words) {
  const plte = Buffer.alloc(768), alpha = Buffer.alloc(256, 255);
  for (let i = 0; i < 256; i++) {
    const w = words[i], r = w & 31, g = (w >>> 5) & 31, bl = (w >>> 10) & 31;
    plte[i*3] = (r<<3)|(r>>>2); plte[i*3+1] = (g<<3)|(g>>>2); plte[i*3+2] = (bl<<3)|(bl>>>2);
    if (w === 0) alpha[i] = 0;
  }
  const scan = Buffer.alloc((width+1)*height);
  for (let y=0; y<height; y++) { scan[y*(width+1)] = 0; pixels.copy(scan,y*(width+1)+1,y*width,(y+1)*width); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4); ihdr[8]=8; ihdr[9]=3;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',ihdr), chunk('PLTE',plte),
    chunk('tRNS',alpha.subarray(0,alpha.lastIndexOf(0)+1)), chunk('IDAT',zlib.deflateSync(scan)), chunk('IEND',Buffer.alloc(0))
  ]);
}
const records=[];
let offset=16;
for(let index=0;index<recordCount;index++){
  if(offset+548>b.length) throw new Error('Record '+index+' has truncated header');
  const storedSize=b.readUInt32LE(offset), flags=b.readUInt32LE(offset+8), tableCount=b.readUInt32LE(offset+12);
  const paletteOffset=offset+24, innerSize=b.readUInt32LE(offset+536);
  const storedWidth=b.readUInt16LE(offset+544), height=b.readUInt16LE(offset+546), width=storedWidth*2;
  const pixelOffset=offset+548, pixelBytes=width*height, next=offset+storedSize+4;
  if(!width||!height||pixelBytes>64*1024*1024) throw new Error('Invalid dimensions at record '+index);
  if(innerSize!==pixelBytes+12) throw new Error('Inner image extent mismatch at record '+index);
  if(next!==pixelOffset+pixelBytes||next>b.length) throw new Error('Outer record extent mismatch at record '+index);
  const palette=Array.from({length:256},(_,i)=>b.readUInt16LE(paletteOffset+i*2));
  const pixels=b.subarray(pixelOffset,pixelOffset+pixelBytes);
  const png='texture-'+String(index+1).padStart(2,'0')+'.png';
  fs.writeFileSync(path.join(outDir,png),indexedPng(width,height,pixels,palette));
  records.push({index,offset,storedSize,flags,flagsHex:'0x'+flags.toString(16),tableCountField:tableCount,
    paletteOffset,paletteEntries:256,transparentPaletteIndices:palette.flatMap((v,i)=>v===0?[i]:[]),
    storedWidth,width,height,pixelOffset,pixelBytes,uniquePixelIndices:new Set(pixels).size,png});
  offset=next;
}
if(offset!==b.length) throw new Error('Parsed through 0x'+offset.toString(16)+' but file ends at 0x'+b.length.toString(16));
const manifest={source:path.resolve(input),bytes:b.length,signature:'TPCMC',version:'0x43',recordCount,
  decoding:{palette:'256 little-endian RGB555 words per record; zero word is transparent',
    pixels:'8-bit palette indices',storedWidth:'decoded width = stored width * 2',pixelOffset:'record offset + 548',
    validation:'inner/outer extents checked and all file bytes consumed'},records};
fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({input,outDir,recordCount,records:records.map(({index,width,height,pixelBytes,uniquePixelIndices,png})=>({index,width,height,pixelBytes,uniquePixelIndices,png}))},null,2));
