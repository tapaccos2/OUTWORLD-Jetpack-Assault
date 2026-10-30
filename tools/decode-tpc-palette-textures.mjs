#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [input, outputDir] = process.argv.slice(2);
if (!input || !outputDir) throw new Error('Usage: node decode-tpc-palette-textures.mjs <input.tpc> <output-directory>');
const data = fs.readFileSync(input);
if (data.length < 40 || data.toString('ascii', 0, 5) !== 'TCPMC' || data.readUInt32LE(4) !== 0x43) throw new Error('Expected TCPMC version 0x43');
const count = data.readUInt32LE(12);
fs.mkdirSync(outputDir, { recursive: true });
function crc32(buffer) { let crc=0xffffffff; for (const byte of buffer) { crc^=byte; for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); } return (crc^0xffffffff)>>>0; }
function chunk(type,payload) { const name=Buffer.from(type,'ascii'),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(payload.length);sum.writeUInt32BE(crc32(Buffer.concat([name,payload])));return Buffer.concat([len,name,payload,sum]); }
function png(width,height,pixels,paletteWords) {
 const palette=Buffer.alloc(768),trns=Buffer.alloc(256,255);
 for(let i=0;i<256;i++){const v=paletteWords[i],r=v&31,g=(v>>>5)&31,bl=(v>>>10)&31;palette[i*3]=Math.round(r*255/31);palette[i*3+1]=Math.round(g*255/31);palette[i*3+2]=Math.round(bl*255/31);if(v===0)trns[i]=0;}
 const stride=width+1,scan=Buffer.alloc(stride*height);
 for(let y=0;y<height;y++){const dst=y*stride;scan[dst]=0;pixels.copy(scan,dst+1,y*width,(y+1)*width);}
 const h=Buffer.alloc(13);h.writeUInt32BE(width,0);h.writeUInt32BE(height,4);h[8]=8;h[9]=3;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('PLTE',palette),chunk('tRNS',trns),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
const records=[];let offset=0x10;
for(let i=0;i<count;i++){
 if(offset+548>data.length)throw new Error('Truncated record '+i);
 const size=data.readUInt32LE(offset),flags=data.readUInt32LE(offset+8),tableField=data.readUInt32LE(offset+12),paletteOffset=offset+24;
 const imageHeader=offset+536,innerSize=data.readUInt32LE(imageHeader),storedWidth=data.readUInt16LE(imageHeader+8),height=data.readUInt16LE(imageHeader+10),width=storedWidth*2;
 const pixelOffset=offset+548,pixelBytes=width*height,nextOffset=offset+size+4;
 if(!storedWidth||!height||innerSize!==pixelBytes+12||nextOffset!==pixelOffset+pixelBytes)throw new Error('Invalid image extent in record '+i);
 const palette=Array.from({length:256},(_,j)=>data.readUInt16LE(paletteOffset+j*2));
 const pixels=data.subarray(pixelOffset,pixelOffset+pixelBytes),filename='texture-'+String(i+1).padStart(2,'0')+'.png';
 fs.writeFileSync(path.join(outputDir,filename),png(width,height,pixels,palette));
 records.push({index:i,filename,recordOffset:offset,storedSize:size,flags,flagsHex:'0x'+flags.toString(16),tableField,width,height,pixelOffset,pixelBytes,transparentPaletteEntries:palette.flatMap((v,j)=>v===0?[j]:[])});
 offset=nextOffset;
}
if(offset!==data.length)throw new Error('Record list ends at '+offset+' not '+data.length);
const manifest={source:path.basename(input),signature:'TCPMC',version:'0x43',recordCount:count,records,
 decoding:{pixels:'8-bit palette indices',palette:'256 little-endian RGB555 words per record',width:'stored width * 2',transparency:'palette word zero => transparent',png:'8-bit indexed PNG with PLTE and tRNS'},
 validation:'Every inner image size and outer record extent matched exactly.'};
fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({outputDir,recordCount:count,images:records.map(({filename,width,height,pixelBytes})=>({filename,width,height,pixelBytes}))},null,2));
