#!/usr/bin/env node
/**
 * Inspect geometry payloads reached through opcode-5 Scout transform children.
 *
 * This is deliberately diagnostic-only: it does not export a GLB or assume
 * that a descriptor's +4 pointer is a vertex array. It compares candidate
 * vertex bases against face indices and records samples/bounds so the payload
 * layout can be identified before writing another exporter.
 *
 * Usage:
 *   node tools/inspect-scout-transform-mesh-payloads.mjs extracted-ff/units/scout_mj.dpc [report.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
const output = process.argv[3];
if (!input) throw new Error('Usage: node inspect-scout-transform-mesh-payloads.mjs <file.dpc> [report.json]');
const file = path.resolve(input);
const b = fs.readFileSync(file);
if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) throw new Error('Expected DCPMC resource');
const base = b.readUInt32LE(12);
const u16 = o => b.readUInt16LE(o);
const s16 = o => b.readInt16LE(o);
const u32 = o => b.readUInt32LE(o);
const s32 = o => b.readInt32LE(o);
const hx = n => '0x' + n.toString(16);
const ptr = field => {
  if (field < 0 || field + 4 > b.length) return null;
  const raw = u32(field), target = raw - base;
  return raw >= base && target >= 0 && target + 4 <= b.length ? target : null;
};
const head = o => o === null ? null : { offset:o, opcode:b[o], flags:b[o+1], classWord:u16(o+2) };
const signature = Buffer.from([4,1,12,9]);

function readFaceCandidates(start, byteLimit=4096, maxRecords=64) {
  if (start === null || start < 0 || start + 12 > b.length) return { records:[], uniqueQuads:[], maxIndex:null };
  const end = Math.min(b.length, start + byteLimit);
  const records=[];
  let cursor=start;
  while (records.length < maxRecords) {
    const found=b.indexOf(signature,cursor);
    if (found < 0 || found + 12 > end) break;
    records.push({ offset:found, q:[u16(found+4),u16(found+6),u16(found+8),u16(found+10)] });
    cursor=found+4;
  }
  const seen=new Set(), uniqueQuads=[];
  for (const rec of records) {
    const q=rec.q;
    if (new Set(q).size < 3) continue;
    const key=q.slice().sort((a,b)=>a-b).join(',');
    if (!seen.has(key)) { seen.add(key); uniqueQuads.push(q); }
  }
  const all=uniqueQuads.flat();
  return { records, uniqueQuads, maxIndex:all.length ? Math.max(...all) : null };
}
function vertexCandidate(offset, indices) {
  if (offset === null || !indices.length) return null;
  const max=Math.max(...indices), points=[];
  for (const index of indices) {
    const p=offset+index*8;
    if (p < 0 || p+8 > b.length) return { offset, fits:false, maxIndex:max };
    points.push([s16(p),s16(p+2),s16(p+4)]);
  }
  const min=[Infinity,Infinity,Infinity], maxv=[-Infinity,-Infinity,-Infinity];
  for (const v of points) for (let k=0;k<3;k++) {
    min[k]=Math.min(min[k],v[k]); maxv[k]=Math.max(maxv[k],v[k]);
  }
  const sampleOffsets=[0,1,2,3].map(i=>offset+i*8);
  const sample=sampleOffsets.map(p=>p+8<=b.length ? [s16(p),s16(p+2),s16(p+4),u16(p+6)] : null);
  return {
    offset, fits:true, maxIndex:max, referencedVertexCount:indices.length,
    min,max:maxv,size:maxv.map((v,k)=>v-min[k]),
    sampleFirstFourVertices:sample,
    rawFirst32: b.subarray(offset,Math.min(offset+32,b.length)).toString('hex')
  };
}
function opcode2Descriptor(o) {
  if (o===null || o+0x18>b.length || b[o]!==2) return null;
  const list=ptr(o+0x14), descriptor=list===null ? null : ptr(list+8);
  if (descriptor===null || descriptor+32>b.length) return {
    recordOffset:o, listOffset:list, descriptorOffset:descriptor, reason:'no readable descriptor at list+8'
  };
  const words=Array.from({length:8},(_,i)=>u32(descriptor+i*4));
  const pointers=words.map((v,i)=>({relativeOffset:i*4,rawHex:hx(v),targetOffset:ptr(descriptor+i*4)})).filter(x=>x.targetOffset!==null);
  const face=ptr(descriptor+12);
  const coord=ptr(descriptor+4);
  const faceData=(face!==null && b[face]===4 && u16(face+2)===0x090c)
    ? readFaceCandidates(face) : {records:[],uniqueQuads:[],maxIndex:null};
  const indices=[...new Set(faceData.uniqueQuads.flat())].sort((a,b)=>a-b);
  const coordOffsets=coord===null ? [] : [0,4,8,12,16,24,32,40,48,64].map(n=>coord+n);
  const coordCandidates=coordOffsets.map(vertexOffset=>vertexCandidate(vertexOffset,indices));
  return {
    recordOffset:o, recordHeader:head(o), countAtPlus10:u32(o+0x10),
    listOffset:list, listHeader:head(list), descriptorOffset:descriptor,
    descriptorWords:words.map((value,i)=>({relativeOffset:i*4,hex:hx(value),s32:s32(descriptor+i*4)})),
    descriptorPointers:pointers,
    candidateCoordinatePointer:{fieldOffset:4,targetOffset:coord,header:head(coord)},
    candidateFacePointer:{fieldOffset:12,targetOffset:face,header:head(face)},
    faceScan:{recordsFound:faceData.records.length,firstRecords:faceData.records.slice(0,12),uniqueQuadCount:faceData.uniqueQuads.length,maxIndex:faceData.maxIndex,uniqueQuads:faceData.uniqueQuads.slice(0,32)},
    coordinateBaseComparisons:[
      vertexCandidate(40,indices),
      ...coordCandidates
    ]
  };
}
function plausibleTransform(o) {
  if (b[o]!==5 || o+0x3c>b.length) return false;
  const n=b[o+0x36];
  if (n<1 || n>32) return false;
  for(let i=0;i<n;i++) if(ptr(o+0x38+i*4)===null) return false;
  return true;
}
const transforms=[];
for(let o=0;o+0x3c<=b.length;o++) if(plausibleTransform(o)) {
  const n=b[o+0x36], children=[];
  for(let i=0;i<n;i++) {
    const child=ptr(o+0x38+i*4), h=head(child);
    const item={pointerFieldOffset:o+0x38+i*4,targetOffset:child,targetHeader:h};
    if(h?.opcode===2) item.meshPayloadCandidate=opcode2Descriptor(child);
    children.push(item);
  }
  transforms.push({
    offset:o,header:head(o),
    matrixFixed4096:Array.from({length:9},(_,i)=>s32(o+4+i*4)),
    position:[s32(o+0x28),s32(o+0x2c),s32(o+0x30)],
    childCount:n,children
  });
}
const parentMap=new Map(transforms.map(t=>[t.offset,[]]));
for(const t of transforms) for(const c of t.children)
  if(c.targetHeader?.opcode===5 && parentMap.has(c.targetOffset)) parentMap.get(c.targetOffset).push(t.offset);
for(const t of transforms) t.parentOffsets=parentMap.get(t.offset);

const attachmentRows=transforms.flatMap(t=>t.children.filter(c=>c.meshPayloadCandidate).map(c=>({
  transformOffset:t.offset, transformParents:t.parentOffsets,
  attachmentOffset:c.targetOffset, descriptorOffset:c.meshPayloadCandidate.descriptorOffset,
  coordinateTarget:c.meshPayloadCandidate.candidateCoordinatePointer?.targetOffset??null,
  faceTarget:c.meshPayloadCandidate.candidateFacePointer?.targetOffset??null,
  faceRecords:c.meshPayloadCandidate.faceScan?.recordsFound??0,
  uniqueQuads:c.meshPayloadCandidate.faceScan?.uniqueQuadCount??0,
  maxIndex:c.meshPayloadCandidate.faceScan?.maxIndex??null,
  vertexBaseCandidateSummary:(c.meshPayloadCandidate.coordinateBaseComparisons??[]).map(v=>v&&({
    offset:v.offset,fits:v.fits,min:v.min,max:v.max,size:v.size
  }))
})));
const report={
  title:'OUTWARS SCOUT TRANSFORM ATTACHMENT MESH PAYLOAD INSPECTION',
  status:'COMPLETED',
  source:file,fileBytes:b.length,relocationBase:hx(base),
  summary:{
    plausibleTransformCount:transforms.length,
    transformRoots:transforms.filter(t=>!t.parentOffsets.length).map(t=>hx(t.offset)),
    opcode2AttachmentCount:attachmentRows.length,
    attachmentsWithFaceStreams:attachmentRows.filter(x=>x.faceRecords>0).length,
    attachmentsWithNonemptyQuads:attachmentRows.filter(x=>x.uniqueQuads>0).length
  },
  attachments:attachmentRows,
  transforms,
  note:'Diagnostic only. Candidate vertex bases are compared, not selected. Face scanning is heuristic and needs visual/runtime corroboration before export.'
};
const json=JSON.stringify(report,null,2)+'\n';
if(output) fs.writeFileSync(path.resolve(output),json);
console.log(JSON.stringify({status:report.status,summary:report.summary,output:output?path.resolve(output):null,attachments:attachmentRows},null,2));
