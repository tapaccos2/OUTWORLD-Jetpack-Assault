#!/usr/bin/env node
/**
 * Inspect headers, printable strings and repeated byte patterns in FF archives.
 * This does not assume a directory-table format.
 *
 * Usage: node tools/inspect-ff-archives.mjs original-data/*.ff original-data/shelldb/*.ff
 */
import fs from 'node:fs';
import path from 'node:path';

const files=process.argv.slice(2);
if(!files.length){console.error('Usage: node tools/inspect-ff-archives.mjs <archive.ff> [...]');process.exit(2)}
function hex(b,start,end){return b.subarray(start,end).toString('hex').match(/.{1,2}/g)?.join(' ')??''}
function strings(b,min=4){const out=[];let start=-1;for(let i=0;i<=b.length;i++){const v=i<b.length?b[i]:0;if(v>=32&&v<=126){if(start<0)start=i}else if(start>=0){if(i-start>=min)out.push({offset:start,text:b.toString('latin1',start,i)});start=-1}}return out}
function u16le(b,o){return o+2<=b.length?b.readUInt16LE(o):null}
function u32le(b,o){return o+4<=b.length?b.readUInt32LE(o):null}
const output=files.map(file=>{
 const b=fs.readFileSync(file), s=strings(b,4);
 const common={
  file:path.basename(file),bytes:b.length,sha256:null,
  headerHex:hex(b,0,Math.min(128,b.length)),
  printableStringsCount:s.length,
  printableStringSamples:s.slice(0,200),
  littleEndian32AtOffsets:Array.from({length:16},(_,i)=>({offset:i*4,value:u32le(b,i*4)})),
  littleEndian16AtOffsets:Array.from({length:32},(_,i)=>({offset:i*2,value:u16le(b,i*2)})),
 };
 const values=[];
 for(let o=0;o+4<=b.length;o+=4){const v=u32le(b,o);if(v!==null&&v>=b.length/100&&v<=b.length*4)values.push({offset:o,value:v})}
 common.alignedPlausibleSizeFields=values.slice(0,500);
 const repeated=[];
 const seen=new Map();
 for(let o=0;o+4<=b.length;o++){const k=b.subarray(o,o+4).toString('hex');if(seen.has(k)){const item=seen.get(k);item.count++;if(item.offsets.length<8)item.offsets.push(o)}else seen.set(k,{bytes:k,count:1,offsets:[o]})}
 common.repeatedFourByteSequences=[...seen.values()].filter(x=>x.count>=20).sort((a,b)=>b.count-a.count).slice(0,50);
 return common;
});
process.stdout.write(JSON.stringify(output,null,2)+'\n');
