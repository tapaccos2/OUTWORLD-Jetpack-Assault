#!/usr/bin/env node
/**
 * Inspect every geometry descriptor carried by opcode-2 children in the
 * Scout opcode-5 transform hierarchy.
 *
 * IMPORTANT: opcode-2 count at +0x10 is the number of inline pointer slots
 * beginning at +0x14. Each slot points to a wrapper; wrapper+8 points to a
 * descriptor. Earlier revisions inspected only the first slot. This version
 * enumerates all of them and emits bounded raw samples as well as candidate
 * face/vertex interpretations. Diagnostic only; never exports a GLB.
 *
 * Usage:
 *   node tools/inspect-scout-transform-mesh-payloads.mjs extracted-ff/units/scout_mj.dpc [report.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const input=process.argv[2], output=process.argv[3];
if(!input) throw new Error('Usage: node inspect-scout-transform-mesh-payloads.mjs <file.dpc> [report.json]');
const file=path.resolve(input), b=fs.readFileSync(input);
if(b.length<40 || b.toString('ascii',0,4)!=='DCPM' || b[4]!==0x43) throw new Error('Expected DCPMC resource');
const base=b.readUInt32LE(12);
const u16=o=>b.readUInt16LE(o), u32=o=>b.readUInt32LE(o), s32=o=>b.readInt32LE(o), s16=o=>b.readInt16LE(o);
const hx=n=>'0x'+n.toString(16);
const ptr=field=>{
  if(field<0 || field+4>b.length) return null;
  const raw=u32(field), target=raw-base;
  return raw>=base && target>=0 && target+4<=b.length ? target : null;
};
const head=o=>o===null?null:{offset:o,opcode:b[o],flags:b[o+1],classWord:u16(o+2)};
const signature=Buffer.from([4,1,12,9]);

function faceScan(start, byteLimit=768, maxRecords=128) {
  if(start===null || start<0 || start+12>b.length) return {records:[],uniqueQuads:[],maxIndex:null,rawHex:null};
  const end=Math.min(b.length,start+byteLimit), records=[];
  let cursor=start;
  while(records.length<maxRecords) {
    const found=b.indexOf(signature,cursor);
    if(found<0 || found+12>end) break;
    records.push({offset:found,indices:[u16(found+4),u16(found+6),u16(found+8),u16(found+10)]});
    cursor=found+4;
  }
  const seen=new Set(), uniqueQuads=[];
  for(const rec of records) {
    if(new Set(rec.indices).size<3) continue;
    const key=rec.indices.slice().sort((a,b)=>a-b).join(',');
    if(!seen.has(key)){seen.add(key);uniqueQuads.push(rec.indices);}
  }
  const all=uniqueQuads.flat();
  return {
    recordsFound:records.length, records:records.slice(0,80),
    uniqueQuadCount:uniqueQuads.length, uniqueQuads,
    maxIndex:all.length?Math.max(...all):null,
    rawHex:b.subarray(start,Math.min(end,start+256)).toString('hex')
  };
}
function readCoordSamples(coord) {
  if(coord===null) return null;
  const starts=[0,4,8,12,16,24,32,40,48,64];
  const candidates=starts.map(delta=>{
    const start=coord+delta;
    if(start+32>b.length) return {delta,offset:start,fits:false};
    const verts=Array.from({length:4},(_,i)=>{
      const p=start+i*8;
      return [s16(p),s16(p+2),s16(p+4),u16(p+6)];
    });
    return {delta,offset:start,fits:true,firstFourVertices:verts};
  });
  return {header:head(coord),rawHex:b.subarray(coord,Math.min(coord+192,b.length)).toString('hex'),candidateStarts:candidates};
}
function readDescriptor(recordOffset, slotIndex) {
  const slotField=recordOffset+0x14+slotIndex*4;
  const wrapper=ptr(slotField), descriptor=wrapper===null?null:ptr(wrapper+8);
  const result={slotIndex,slotFieldOffset:slotField,wrapperOffset:wrapper,wrapperHeader:head(wrapper),descriptorOffset:descriptor};
  if(descriptor===null || descriptor+32>b.length) return {...result,valid:false,reason:'unreadable descriptor'};
  const dwords=Array.from({length:8},(_,i)=>u32(descriptor+i*4));
  const coord=ptr(descriptor+4), shared=ptr(descriptor+8), face=ptr(descriptor+12);
  const faces=faceScan(face);
  return {
    ...result,valid:true,
    descriptorDwords:dwords.map((value,i)=>({relativeOffset:i*4,hex:hx(value),s32:s32(descriptor+i*4)})),
    coordinatePointer:{targetOffset:coord,header:head(coord),sample:readCoordSamples(coord)},
    sharedPointer:{targetOffset:shared,header:head(shared)},
    facePointer:{targetOffset:face,header:head(face)},
    faceScan:faces,
    // Keep index/bounds semantics unselected. These are candidate samples only.
    faceIndexValues:faces.uniqueQuads?.flat()??[]
  };
}
function readOpcode2(o) {
  if(o===null || o+0x14>b.length || b[o]!==2) return null;
  const count=u32(o+0x10);
  if(count>64) return {recordOffset:o,header:head(o),count,valid:false,reason:'implausible inline descriptor count'};
  const items=Array.from({length:count},(_,i)=>readDescriptor(o,i));
  return {recordOffset:o,header:head(o),inlineDescriptorCount:count,items};
}
function plausibleTransform(o) {
  if(b[o]!==5 || o+0x3c>b.length) return false;
  const count=b[o+0x36];
  if(count<1 || count>32) return false;
  for(let i=0;i<count;i++) if(ptr(o+0x38+i*4)===null) return false;
  return true;
}

const transforms=[];
for(let o=0;o+0x3c<=b.length;o++) if(plausibleTransform(o)) {
  const count=b[o+0x36], children=[];
  for(let i=0;i<count;i++) {
    const target=ptr(o+0x38+i*4), h=head(target);
    const child={pointerFieldOffset:o+0x38+i*4,targetOffset:target,targetHeader:h};
    if(h?.opcode===2) child.attachment=readOpcode2(target);
    children.push(child);
  }
  transforms.push({
    offset:o,header:head(o),
    matrixFixed4096:Array.from({length:9},(_,i)=>s32(o+4+i*4)),
    position:[s32(o+0x28),s32(o+0x2c),s32(o+0x30)],
    childCount:count,children
  });
}
const byOffset=new Map(transforms.map(t=>[t.offset,t]));
const parents=new Map(transforms.map(t=>[t.offset,[]]));
for(const t of transforms) for(const c of t.children)
  if(c.targetHeader?.opcode===5 && parents.has(c.targetOffset)) parents.get(c.targetOffset).push(t.offset);
for(const t of transforms)t.parentOffsets=parents.get(t.offset);

const attachments=transforms.flatMap(t=>t.children.filter(c=>c.attachment).map(c=>({
  transformOffset:t.offset,transformParents:t.parentOffsets,
  attachmentOffset:c.targetOffset,inlineDescriptorCount:c.attachment.inlineDescriptorCount,
  descriptors:c.attachment.items.map(item=>({
    slotIndex:item.slotIndex,wrapperOffset:item.wrapperOffset,descriptorOffset:item.descriptorOffset,
    coordinateTarget:item.coordinatePointer?.targetOffset??null,
    coordinateHeader:item.coordinatePointer?.header??null,
    faceTarget:item.facePointer?.targetOffset??null,
    faceRecords:item.faceScan?.recordsFound??0,
    uniqueQuads:item.faceScan?.uniqueQuadCount??0,
    maxIndex:item.faceScan?.maxIndex??null,
    faceIndices:item.faceIndexValues??[]
  }))
})));
const items=attachments.flatMap(a=>a.descriptors);
const report={
  title:'OUTWARS SCOUT TRANSFORM ATTACHMENT MESH PAYLOAD INSPECTION',
  status:'COMPLETED',
  source:file,fileBytes:b.length,relocationBase:hx(base),
  summary:{
    plausibleTransformCount:transforms.length,
    transformRoots:transforms.filter(t=>!t.parentOffsets.length).map(t=>hx(t.offset)),
    opcode2AttachmentCount:attachments.length,
    inlineDescriptorCount:items.length,
    descriptorsWithFaceStreams:items.filter(x=>x.faceRecords>0).length,
    descriptorsWithNonemptyQuads:items.filter(x=>x.uniqueQuads>0).length
  },
  attachments,transforms,
  note:'All inline descriptor slots are now enumerated. The face signature scan is bounded to 768 bytes, but remains heuristic. Coordinate pointer targets may be typed blocks rather than the first vertex. No vertex base, face count, matrix convention, or geometry semantic is selected by this report.'
};
const json=JSON.stringify(report,null,2)+'\n';
if(output)fs.writeFileSync(path.resolve(output),json);
console.log(JSON.stringify({status:report.status,summary:report.summary,output:output?path.resolve(output):null,attachments},null,2));
