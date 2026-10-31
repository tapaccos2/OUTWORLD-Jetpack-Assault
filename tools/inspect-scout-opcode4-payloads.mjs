#!/usr/bin/env node
/**
 * Decode the opcode-4 / class-0x090c nodes referenced by the Scout opcode-5
 * transform attachment descriptors.
 *
 * The executable callback at 0x4E006D does NOT treat these records as simple
 * four-index faces. It adds DWORDs +4/+8/+12 to the inherited position, reads
 * a BYTE count at +0x12, then processes DWORD entries beginning at +0x14.
 * This report exposes those entries rather than guessing that they are quads.
 *
 * Usage:
 *   node tools/inspect-scout-opcode4-payloads.mjs extracted-ff/units/scout_mj.dpc [report.json]
 */
import fs from 'node:fs';
import path from 'node:path';
const input=process.argv[2],output=process.argv[3];
if(!input)throw new Error('Usage: node inspect-scout-opcode4-payloads.mjs <file.dpc> [report.json]');
const file=path.resolve(input),b=fs.readFileSync(input);
if(b.length<40||b.toString('ascii',0,4)!=='DCPM'||b[4]!==0x43)throw new Error('Expected DCPMC resource');
const base=b.readUInt32LE(12),u16=o=>b.readUInt16LE(o),u32=o=>b.readUInt32LE(o),s32=o=>b.readInt32LE(o);
const hx=n=>'0x'+n.toString(16);
const ptr=field=>{if(field<0||field+4>b.length)return null;const v=u32(field),t=v-base;return v>=base&&t>=0&&t+4<=b.length?t:null;};
const head=o=>o===null?null:{offset:o,opcode:b[o],flags:b[o+1],classWord:u16(o+2)};
const seen=new Map();
function parseOpcode2(record) {
  const count=u32(record+0x10);
  if(count>64)return [];
  const out=[];
  for(let i=0;i<count;i++){
    const wrapper=ptr(record+0x14+i*4),descriptor=wrapper===null?null:ptr(wrapper+8);
    if(descriptor===null||descriptor+16>b.length)continue;
    const face=ptr(descriptor+12);
    if(face!==null&&b[face]===4&&u16(face+2)===0x090c)out.push({slot:i,wrapper,descriptor,opcode4:face});
  }
  return out;
}
function parseOpcode4(offset,via) {
  if(b[offset]!==4||u16(offset+2)!==0x090c)return null;
  if(seen.has(offset))return seen.get(offset);
  const count=b[offset+0x12],available=Math.max(0,Math.min(count,Math.floor((b.length-(offset+0x14))/4)));
  const entries=[];
  for(let i=0;i<available;i++){
    const field=offset+0x14+i*4,value=u32(field),relocated=ptr(field);
    let interpretation='literal';
    let rawOffset=null,rawHeader=null;
    if(relocated!==null){interpretation='relocated-pointer';rawOffset=relocated;rawHeader=head(relocated);}
    else if(value<b.length){interpretation='file-offset-candidate';rawOffset=value;rawHeader=head(value);}
    entries.push({index:i,fieldOffset:field,valueHex:hx(value),valueSigned:s32(field),interpretation,targetOffset:rawOffset,targetHeader:rawHeader});
  }
  const row={
    offset,header:head(offset),referencedBy:via,
    translationRaw:[s32(offset+4),s32(offset+8),s32(offset+12)],
    wordAtPlus10:u16(offset+0x10),entryCountByteAtPlus12:count,
    availableEntries:available,truncated:available!==count,
    entries,
    rawHex:b.subarray(offset,Math.min(b.length,offset+0x14+Math.min(count,64)*4)).toString('hex')
  };
  seen.set(offset,row);
  return row;
}
function plausibleTransform(o){
  if(b[o]!==5||o+0x3c>b.length)return false;
  const n=b[o+0x36];if(n<1||n>32)return false;
  for(let i=0;i<n;i++)if(ptr(o+0x38+i*4)===null)return false;
  return true;
}
const transforms=[];
for(let o=0;o+0x3c<=b.length;o++)if(plausibleTransform(o)){
  const n=b[o+0x36],children=[];
  for(let i=0;i<n;i++){
    const target=ptr(o+0x38+i*4),h=head(target),child={targetOffset:target,targetHeader:h};
    if(h?.opcode===2)child.attachments=parseOpcode2(target).map(x=>({
      ...x,opcode4Payload:parseOpcode4(x.opcode4,{transform:o,attachment:target,descriptor:x.descriptor,slot:x.slot})
    }));
    children.push(child);
  }
  transforms.push({offset:o,header:head(o),matrixFixed4096:Array.from({length:9},(_,i)=>s32(o+4+i*4)),position:[s32(o+0x28),s32(o+0x2c),s32(o+0x30)],childCount:n,children});
}
const parentMap=new Map(transforms.map(t=>[t.offset,[]]));
for(const t of transforms)for(const c of t.children)if(c.targetHeader?.opcode===5&&parentMap.has(c.targetOffset))parentMap.get(c.targetOffset).push(t.offset);
for(const t of transforms)t.parentOffsets=parentMap.get(t.offset);
const rows=[...seen.values()];
const report={
 title:'OUTWARS SCOUT OPCODE-4 PAYLOAD REPORT',status:'COMPLETED',source:file,fileBytes:b.length,relocationBase:hx(base),
 executableEvidence:{
  handler:'0x004E006D',recordTranslationFields:['+0x04 DWORD','+0x08 DWORD','+0x0C DWORD'],
  countField:'+0x12 BYTE',childSequenceStart:'+0x14 DWORD entries',
  note:'The handler does not read +4/+6/+8/+10 as four face indices. The previous 0x090C signature-as-quad assumption is rejected.'
 },
 summary:{
  transformCount:transforms.length,opcode4PayloadCount:rows.length,
  reportedEntryCount:rows.reduce((n,x)=>n+x.entryCountByteAtPlus12,0),
  availableEntryCount:rows.reduce((n,x)=>n+x.availableEntries,0),
  truncatedPayloadCount:rows.filter(x=>x.truncated).length,
  entriesClassifiedAsRelocatedPointer:rows.reduce((n,x)=>n+x.entries.filter(e=>e.interpretation==='relocated-pointer').length,0),
  entriesClassifiedAsFileOffset:rows.reduce((n,x)=>n+x.entries.filter(e=>e.interpretation==='file-offset-candidate').length,0)
 },
 opcode4Payloads:rows,transforms,
 note:'Entry values are reported without assuming that they are ordinary pointers, indices, or vertices. Relocated/file-offset interpretations are mechanical classifications only. This is a diagnostic report, not a geometry exporter.'
};
const json=JSON.stringify(report,null,2)+'\n';if(output)fs.writeFileSync(path.resolve(output),json);
console.log(JSON.stringify({status:report.status,summary:report.summary,output:output?path.resolve(output):null,payloads:rows.map(x=>({offset:x.offset,count:x.entryCountByteAtPlus12,available:x.availableEntries,translation:x.translationRaw,firstEntries:x.entries.slice(0,12)}))},null,2));
