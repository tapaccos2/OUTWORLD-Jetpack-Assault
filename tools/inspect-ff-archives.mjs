#!/usr/bin/env node
/**
 * Parse the observed Outwars FF archive directory table.
 *
 * Confirmed against motion.ff, shelldb/library.ff, shelldb/graphics.ff,
 * and shelldb/briefing.ff: u32LE entry count followed by 44-byte entries
 * (u32LE payload offset + 40-byte NUL-padded name). The last entry is an
 * empty-name sentinel whose offset equals EOF. Validate every archive before
 * trusting the output; other FF variants may differ.
 *
 * Usage:
 *   node tools/inspect-ff-archives.mjs original-data/motion.ff original-data/units.ff original-data/shelldb/*.ff
 */
import fs from 'node:fs';
import path from 'node:path';

const files=process.argv.slice(2);
if(!files.length){console.error('Usage: node tools/inspect-ff-archives.mjs <archive.ff> [...]');process.exit(2)}
const U32_MAX=0xffffffff;
function u32(b,o){return o+4<=b.length?b.readUInt32LE(o):null}
function fixedString(b,o,n){const end=b.indexOf(0,o);const stop=end>=o&&end<o+n?end:o+n;return b.toString('latin1',o,stop)}
const output=files.map(file=>{
 const b=fs.readFileSync(file);
 const count=u32(b,0);
 const tableEnd=count===null?null:4+count*44;
 const errors=[];
 if(count===null)errors.push('File is shorter than the count field');
 if(count!==null&&tableEnd>b.length)errors.push(`Directory table ends at ${tableEnd}, beyond file length ${b.length}`);
 const entries=[];
 if(!errors.length){
  for(let i=0;i<count;i++){
   const p=4+i*44,offset=u32(b,p),name=fixedString(b,p+4,40);
   entries.push({index:i,offset,name});
   if(offset===null||offset>b.length)errors.push(`Entry ${i} offset is outside the file`);
   if(i===0&&offset!==tableEnd)errors.push(`First payload offset ${offset} differs from table end ${tableEnd}`);
   if(i>0&&offset<entries[i-1].offset)errors.push(`Entry ${i} offset decreases`);
  }
  if(entries.length&&entries.at(-1).name!=='')errors.push('Last entry is not an empty-name sentinel');
  if(entries.length&&entries.at(-1).offset!==b.length)errors.push(`Sentinel offset ${entries.at(-1).offset} differs from EOF ${b.length}`);
 }
 const resources=entries.filter((e,i)=>e.name&&i+1<entries.length).map((e)=>({
  name:e.name,offset:e.offset,size:entries[entries.indexOf(e)+1].offset-e.offset
 }));
 return {
  file:path.basename(file),bytes:b.length,headerEntryCount:count,tableEnd,
  namedResourceCount:resources.length,hasEmptySentinel:entries.length>0&&entries.at(-1).name==='',
  firstPayloadOffset:entries[0]?.offset??null,lastOffset:entries.at(-1)?.offset??null,
  validated:errors.length===0,errors,resources
 };
});
process.stdout.write(JSON.stringify(output,null,2)+'\n');
