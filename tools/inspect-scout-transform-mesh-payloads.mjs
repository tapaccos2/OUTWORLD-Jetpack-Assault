#!/usr/bin/env node
/**
 * Inventory descriptor pointers beneath opcode-5 transforms.
 *
 * Descriptor +4 is retained as a coordinate-pool candidate, +8 as a shared
 * target, and +12 is decoded as an opcode-4 callback payload when its header
 * validates. Do not interpret the old 0x04 0x01 0x0c 0x09 byte signature as
 * face indices: it identifies opcode-4 callback records, not quad primitives.
 *
 * This tool intentionally exports no faces or GLB. It records raw payload
 * bytes and callback fields until the executable's leaf-render semantics are
 * proven.
 *
 * Usage:
 *   node tools/inspect-scout-transform-mesh-payloads.mjs extracted-ff/units/scout_mj.dpc [report.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const input=process.argv[2],output=process.argv[3];
if(!input)throw new Error('Usage: node inspect-scout-transform-mesh-payloads.mjs <file.dpc> [report.json]');
const file=path.resolve(input),b=fs.readFileSync(file);
if(b.length<40||b.toString('ascii',0,4)!=='DCPM'||b[4]!==0x43)throw new Error('Expected DCPMC resource');
const base=b.readUInt32LE(12);
const u16=o=>o>=0&&o+2<=b.length?b.readUInt16LE(o):null;
const u32=o=>o>=0&&o+4<=b.length?b.readUInt32LE(o):null;
const s32=o=>o>=0&&o+4<=b.length?b.readInt32LE(o):null;
const hx=n=>n===null||n===undefined?null:'0x'+n.toString(16);
const ptr=field=>{
  const raw=u32(field);if(raw===null)return null;
  const target=raw-base;
  return raw>=base&&target>=0&&target+4<=b.length?target:null;
};
const head=o=>o===null?null:{offset:o,opcode:b[o],flags:b[o+1],classWord:u16(o+2)};
const rawSample=(o,length=64)=>o===null?null:b.subarray(o,Math.min(b.length,o+length)).toString('hex');

function opcode4Summary(o){
  const h=head(o);
  if(!h||h.opcode!==4||h.classWord!==0x090c)return null;
  const count=b[o+0x12],available=Math.max(0,Math.min(count,Math.floor((b.length-o-0x14)/4)));
  return {
    header:h,
    translationRaw:[s32(o+4),s32(o+8),s32(o+12)],
    wordAtPlus10:u16(o+0x10),
    entryCountByteAtPlus12:count,
    availableEntries:available,
    truncated:available!==count,
    firstRawEntryWords:Array.from({length:Math.min(available,16)},(_,i)=>u32(o+0x14+i*4)),
    rawSample:rawSample(o,Math.min(0x14+Math.min(available,16)*4,96))
  };
}
function readDescriptor(listOffset,slotIndex){
  const slotField=listOffset+slotIndex*4;
  const wrapper=ptr(slotField),descriptor=wrapper===null?null:ptr(wrapper+8);
  const out={slotIndex,slotFieldOffset:slotField,wrapperOffset:wrapper,wrapperHeader:head(wrapper),descriptorOffset:descriptor};
  if(descriptor===null||descriptor+16>b.length)return {...out,valid:false,reason:'unreadable descriptor'};
  const dwords=Array.from({length:8},(_,i)=>u32(descriptor+i*4));
  const coordinateTarget=ptr(descriptor+4);
  const sharedTarget=ptr(descriptor+8);
  const opcode4Target=ptr(descriptor+12);
  const op4=opcode4Summary(opcode4Target);
  return {
    ...out,valid:true,
    descriptorDwords:dwords.map((value,i)=>({relativeOffset:i*4,valueHex:hx(value),signed:s32(descriptor+i*4)})),
    coordinatePointer:{targetOffset:coordinateTarget,header:head(coordinateTarget),rawSample:rawSample(coordinateTarget,64)},
    sharedPointer:{targetOffset:sharedTarget,header:head(sharedTarget),rawSample:rawSample(sharedTarget,32)},
    opcode4PayloadPointer:{
      targetOffset:opcode4Target,
      header:head(opcode4Target),
      validatedOpcode4Class090c:op4!==null,
      callback:op4
    }
  };
}
function readOpcode2(o){
  if(o===null||b[o]!==2||o+0x18>b.length)return null;
  const count=u32(o+0x10),list=o+0x14;
  if(count===null||count>64||list===null||list+count*4>b.length)
    return {recordOffset:o,header:head(o),count,listOffset:list,valid:false,reason:'descriptor pointer array out of bounds'};
  return {recordOffset:o,header:head(o),inlineDescriptorCount:count,listOffset:list,valid:true,items:Array.from({length:count},(_,i)=>readDescriptor(list,i))};
}
function plausibleTransform(o){
  if(b[o]!==5||o+0x3c>b.length)return false;
  const count=b[o+0x36];
  if(count<1||count>32||o+0x38+count*4>b.length)return false;
  for(let i=0;i<count;i++)if(ptr(o+0x38+i*4)===null)return false;
  return true;
}

const transforms=[];
for(let o=0;o+0x3c<=b.length;o++)if(plausibleTransform(o)){
  const count=b[o+0x36],children=[];
  for(let i=0;i<count;i++){
    const target=ptr(o+0x38+i*4),h=head(target);
    const child={pointerFieldOffset:o+0x38+i*4,targetOffset:target,targetHeader:h};
    if(h?.opcode===2)child.attachment=readOpcode2(target);
    children.push(child);
  }
  transforms.push({
    offset:o,header:head(o),
    matrixRawQ20_12:Array.from({length:9},(_,i)=>s32(o+4+i*4)),
    positionRaw:[s32(o+0x28),s32(o+0x2c),s32(o+0x30)],
    childCount:count,children
  });
}
const parents=new Map(transforms.map(t=>[t.offset,[]]));
for(const t of transforms)for(const c of t.children)
  if(c.targetHeader?.opcode===5&&parents.has(c.targetOffset))parents.get(c.targetOffset).push(t.offset);
for(const t of transforms)t.parentOffsets=parents.get(t.offset);

const attachments=transforms.flatMap(t=>t.children.filter(c=>c.attachment).map(c=>({
  transformOffset:t.offset,transformParents:t.parentOffsets,
  attachmentOffset:c.targetOffset,inlineDescriptorCount:c.attachment.inlineDescriptorCount,
  descriptors:c.attachment.items
})));
const descriptors=attachments.flatMap(a=>a.descriptors);
const validOpcode4=descriptors.filter(d=>d.opcode4PayloadPointer?.validatedOpcode4Class090c);
const report={
  title:'OUTWARS SCOUT TRANSFORM DESCRIPTOR POINTER INVENTORY',
  status:'COMPLETED',
  source:file,fileBytes:b.length,relocationBase:hx(base),
  summary:{
    plausibleTransformCount:transforms.length,
    transformRoots:transforms.filter(t=>!t.parentOffsets.length).map(t=>hx(t.offset)),
    opcode2AttachmentCount:attachments.length,
    inlineDescriptorCount:descriptors.length,
    descriptorsWithCoordinateTargets:descriptors.filter(d=>d.coordinatePointer?.targetOffset!==null).length,
    descriptorsWithValidatedOpcode4Payloads:validOpcode4.length,
    descriptorsWithUnvalidatedOpcode4Targets:descriptors.filter(d=>d.opcode4PayloadPointer?.targetOffset!==null&&!d.opcode4PayloadPointer?.validatedOpcode4Class090c).length
  },
  attachments,transforms,
  interpretation:{
    descriptorPlus4:'Coordinate-pool candidate pointer; raw bytes are retained without claiming a vertex layout.',
    descriptorPlus8:'Shared target pointer; type not asserted by this report.',
    descriptorPlus12:'Opcode-4/class-0x090c callback payload where its header validates; child DWORDs are retained as raw words without assuming pointer, face, or index semantics.',
    rejectedAssumption:'The 0x04 0x01 0x0c 0x09 signature is an opcode-4 callback record header, not a four-index face record. No face counts, quad counts, index lists, or GLB geometry are emitted.'
  },
  note:'This is a structural inventory only. A recognisable Scout GLB still requires proof of the leaf render primitive payload, vertex/index interpretation, callback ownership and composed transform convention.'
};
const json=JSON.stringify(report,null,2)+'\n';
if(output)fs.writeFileSync(path.resolve(output),json);
console.log(JSON.stringify({status:report.status,summary:report.summary,output:output?path.resolve(output):null},null,2));
