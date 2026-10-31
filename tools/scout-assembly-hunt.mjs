#!/usr/bin/env node
/**
 * Outwars Scout assembly hunter.
 *
 * This is the second-stage builder after scout-autodiscovery.mjs. It stops
 * treating every opcode-4 DWORD as a pointer. Instead it investigates the
 * structured byte stream inside descriptor+12 targets:
 *
 *   descriptor+4  -> candidate coordinate data
 *   descriptor+12 -> opcode-4 / class 0x090c payload
 *   payload+0x14  -> inline DWORD stream
 *
 * The stream contains embedded 0x090c0104 face markers followed by four
 * uint16 indices. Each candidate is tested against coordinate starts/strides
 * near descriptor+4. A mesh is accepted only when index bounds, coordinate
 * record structure, spatial spread and non-degenerate quad geometry agree.
 *
 * The largest validated transform hierarchy is selected automatically
 * (the uploaded Scout run identifies root 0x9300 with 11 transform nodes).
 * Four world-matrix conventions are exported for visual comparison:
 * parent*child / child*parent, each with row-major / transposed source data.
 *
 * Usage:
 *   node tools/scout-assembly-hunt.mjs original-data/units.ff scout-assembly-hunt
 *   node tools/scout-assembly-hunt.mjs path/to/scout_mj.dpc scout-assembly-hunt --exe outwars.exe
 *
 * Options:
 *   --max-base-delta 96
 *   --no-raw-control
 *
 * Outputs: analysis.json, ASSEMBLY-HUNT.md, candidate-meshes.csv,
 * coordinate-hypotheses.csv, plus raw and four transformed GLBs when enough
 * geometries pass the independent checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,'..');
const args=process.argv.slice(2);
let input=null,outArg=null,exePath=null,maxBaseDelta=96,noRawControl=false;
for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='--exe'){if(!args[i+1])throw new Error('--exe requires a path');exePath=path.resolve(args[++i]);}
  else if(a==='--max-base-delta'){maxBaseDelta=Number(args[++i]);if(!Number.isInteger(maxBaseDelta)||maxBaseDelta<16)throw new Error('--max-base-delta must be an integer >=16');}
  else if(a==='--no-raw-control')noRawControl=true;
  else if(a.startsWith('--'))throw new Error('Unknown option: '+a);
  else if(input===null)input=a;else if(outArg===null)outArg=a;else throw new Error('Unexpected argument: '+a);
}
if(!input){console.error('Usage: node tools/scout-assembly-hunt.mjs <scout.dpc|units.ff> [output-dir] [--exe outwars.exe]');process.exit(2);}
input=path.resolve(input);
const outDir=path.resolve(outArg||'scout-assembly-hunt');
fs.mkdirSync(outDir,{recursive:true});
let sourceArchive=null,autoExtractDirectory=null;
function extractScout(archive){
  const extractor=path.join(here,'extract-ff-resources.mjs');
  if(!fs.existsSync(extractor))throw new Error('Missing tools/extract-ff-resources.mjs');
  autoExtractDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'outwars-scout-assembly-'));
  const r=spawnSync(process.execPath,[extractor,archive,'--out',autoExtractDirectory],{cwd:repoRoot,encoding:'utf8',maxBuffer:32*1024*1024});
  if(r.status!==0)throw new Error('FF archive did not validate: '+(r.stderr||r.stdout||'no extractor output'));
  const p=path.join(autoExtractDirectory,path.basename(archive,path.extname(archive)),'scout_mj.dpc');
  if(!fs.existsSync(p))throw new Error('Validated archive extraction did not produce '+p);
  sourceArchive=archive;return p;
}
if(fs.existsSync(input)&&path.extname(input).toLowerCase()==='.ff')input=extractScout(input);
else if(!fs.existsSync(input)){
  const archive=path.join(repoRoot,'original-data','units.ff');
  if(path.basename(input).toLowerCase()==='scout_mj.dpc'&&fs.existsSync(archive))input=extractScout(archive);
  else throw new Error('Input not found: '+input+'; bundled archive checked: '+archive);
}
const b=fs.readFileSync(input);
if(b.length<40||b.toString('ascii',0,4)!=='DCPM'||b[4]!==0x43)throw new Error('Expected DCPMC resource');
const relocationBase=b.readUInt32LE(12);
const u16=o=>o>=0&&o+2<=b.length?b.readUInt16LE(o):null;
const s16=o=>o>=0&&o+2<=b.length?b.readInt16LE(o):null;
const u32=o=>o>=0&&o+4<=b.length?b.readUInt32LE(o):null;
const s32=o=>o>=0&&o+4<=b.length?b.readInt32LE(o):null;
const hx=n=>'0x'+Number(n).toString(16);
const validRange=(o,n)=>Number.isInteger(o)&&o>=0&&n>=0&&o+n<=b.length;
const ptr=field=>{
  if(!validRange(field,4))return null;
  const raw=u32(field),target=raw-relocationBase;
  return raw>=relocationBase&&validRange(target,4)?target:null;
};
const header=o=>validRange(o,4)?{offset:o,opcode:b[o],flags:b[o+1],classWord:u16(o+2)}:null;
const readMatrix=o=>Array.from({length:9},(_,i)=>s32(o+4+i*4)/4096);
const transpose=m=>[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];
const mul3=(a,c)=>{
  const r=new Array(9).fill(0);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)r[i*3+j]+=a[i*3+k]*c[k*3+j];
  return r;
};
const apply3=(m,v)=>[
  m[0]*v[0]+m[1]*v[1]+m[2]*v[2],
  m[3]*v[0]+m[4]*v[1]+m[5]*v[2],
  m[6]*v[0]+m[7]*v[1]+m[8]*v[2]
];
function selfTest(){
  const I=[1,0,0,0,1,0,0,0,1],other=[2,3,4,5,6,7,8,9,10];
  const assertions=[
    ['relocation base',relocationBase>0],
    ['identity multiplication',mul3(I,other).every((v,i)=>v===other[i])],
    ['identity vector',apply3(I,[2,3,4]).join(',')==='2,3,4'],
    ['transpose involution',transpose(transpose(other)).every((v,i)=>v===other[i])],
    ['quad signature bytes',Buffer.from([4,1,12,9]).readUInt32LE(0)===0x090c0104]
  ];
  if(assertions.some(x=>!x[1]))throw new Error('Internal self-test failed: '+JSON.stringify(assertions));
  return assertions.map(x=>({name:x[0],passed:x[1]}));
}

const transforms=[];
for(let o=0;o+0x3c<=b.length;o++){
  if(b[o]!==5)continue;
  const n=b[o+0x36];
  if(n<1||n>32||!validRange(o+0x38,n*4))continue;
  const children=[];
  let ok=true;
  for(let i=0;i<n;i++){
    const field=o+0x38+i*4,target=ptr(field);
    if(target===null){ok=false;break;}
    children.push({field,target,header:header(target)});
  }
  if(!ok)continue;
  transforms.push({
    offset:o,header:header(o),matrix:readMatrix(o),
    position:[s32(o+0x28),s32(o+0x2c),s32(o+0x30)],
    childCount:n,children
  });
}
const transformMap=new Map(transforms.map(t=>[t.offset,t]));
const parentMap=new Map(transforms.map(t=>[t.offset,[]]));
for(const t of transforms)for(const c of t.children)if(transformMap.has(c.target))parentMap.get(c.target).push(t.offset);
for(const t of transforms)t.parents=parentMap.get(t.offset);
function descendants(root){
  const list=[],seen=new Set();
  function visit(o){
    if(seen.has(o))return;seen.add(o);
    const t=transformMap.get(o);if(!t)return;
    list.push(o);for(const c of t.children)if(transformMap.has(c.target))visit(c.target);
  }
  visit(root);return list;
}
const transformRoots=transforms.filter(t=>t.parents.length===0);
const rootCandidates=transformRoots.map(t=>({offset:t.offset,nodes:descendants(t.offset).length}));
rootCandidates.sort((a,c)=>c.nodes-a.nodes);
const mainRoot=rootCandidates[0]?.offset??null;
if(mainRoot===null)throw new Error('No transform root was discovered');
const mainTransformOffsets=new Set(descendants(mainRoot));

function parseOp2(o,parentTransform){
  if(!validRange(o,0x14)||b[o]!==2)return null;
  const count=u32(o+0x10);
  if(count===null||count>64||!validRange(o+0x14,count*4))return{offset:o,parentTransform,count,valid:false};
  const slots=[];
  for(let i=0;i<count;i++){
    const wrapper=ptr(o+0x14+i*4),descriptor=wrapper===null?null:ptr(wrapper+8);
    const row={slot:i,wrapper,wrapperHeader:header(wrapper),descriptor,coordinateTarget:null,payloadTarget:null};
    if(descriptor!==null&&validRange(descriptor,16)){
      row.descriptorHeader=header(descriptor);
      row.descriptorWords=Array.from({length:4},(_,j)=>u32(descriptor+j*4));
      row.coordinateTarget=ptr(descriptor+4);
      row.sharedTarget=ptr(descriptor+8);
      row.payloadTarget=ptr(descriptor+12);
      row.coordinateHeader=header(row.coordinateTarget);
      row.payloadHeader=header(row.payloadTarget);
    }
    slots.push(row);
  }
  return{offset:o,parentTransform,count,slots};
}
const attachments=[];
for(const t of transforms){
  if(!mainTransformOffsets.has(t.offset))continue;
  for(const c of t.children){
    if(c.header?.opcode!==2)continue;
    const a=parseOp2(c.target,t.offset);
    if(a)attachments.push(a);
  }
}
const payloads=[];
for(const a of attachments)for(const slot of a.slots){
  if(slot.payloadTarget===null||slot.coordinateTarget===null)continue;
  const p=slot.payloadTarget;
  if(b[p]!==4||u16(p+2)!==0x090c||!validRange(p,0x14))continue;
  const count=b[p+0x12],available=Math.min(count,Math.floor((b.length-(p+0x14))/4));
  const entriesStart=p+0x14,entries=[];
  for(let i=0;i<available;i++)entries.push({index:i,offset:entriesStart+i*4,value:u32(entriesStart+i*4)});
  const sig=Buffer.from([4,1,12,9]),faceRows=[];
  let cursor=entriesStart;
  while(cursor+12<=entriesStart+available*4){
    const found=b.indexOf(sig,cursor);
    if(found<0||found+12>entriesStart+available*4)break;
    if((found-entriesStart)%4===0){
      const indices=[u16(found+4),u16(found+6),u16(found+8),u16(found+10)];
      const unique=new Set(indices);
      faceRows.push({
        byteOffset:found,entryIndex:(found-entriesStart)/4,
        indices,uniqueCount:unique.size,distinct:unique.size>=3,
        precedingDword:found>=entriesStart+4?u32(found-4):null,
        followingDwords:[u32(found+12),u32(found+16)]
      });
    }
    cursor=found+4;
  }
  const rawValidFaces=faceRows.filter(x=>x.distinct&&Math.max(...x.indices)<=4096);
  const uniqueFaces=new Map();
  for(const face of rawValidFaces){
    const key=face.indices.slice().sort((x,y)=>x-y).join(',');
    if(!uniqueFaces.has(key))uniqueFaces.set(key,face);
  }
  const faces=[...uniqueFaces.values()];
  const indexValues=faces.flatMap(x=>x.indices);
  const maxIndex=indexValues.length?Math.max(...indexValues):-1;
  payloads.push({
    parentTransform:a.parentTransform,attachmentOffset:a.offset,slot:slot.slot,
    wrapperOffset:slot.wrapper,descriptorOffset:slot.descriptor,
    coordinateTarget:slot.coordinateTarget,payloadOffset:p,
    entryCount:count,availableEntries:available,faceMarkerCount:faceRows.length,
    validFaceCount:faces.length,uniqueFaceCount:uniqueFaces.size,
    maxIndex,faceRows:faces,allFaceRows:faceRows,rawEntries:entries
  });
}

function readPoint(start,stride,index,kind){
  const p=start+index*stride;
  if(kind==='i16x3'){
    if(!validRange(p,6))return null;
    return[s16(p),s16(p+2),s16(p+4)];
  }
  if(kind==='f32x3'){
    if(!validRange(p,12))return null;
    const v=[b.readFloatLE(p),b.readFloatLE(p+4),b.readFloatLE(p+8)];
    return v.every(x=>Number.isFinite(x)&&Math.abs(x)<1e7)?v:null;
  }
  return null;
}
function measureCandidate(payload,start,stride,kind){
  if(payload.maxIndex<3)return null;
  const needed=payload.maxIndex+1,points=[];
  for(let i=0;i<needed;i++){
    const p=readPoint(start,stride,i,kind);if(!p)return null;points.push(p);
  }
  const unique=new Set(points.map(v=>v.join(',')));
  const mins=[0,1,2].map(k=>Math.min(...points.map(v=>v[k])));
  const maxs=[0,1,2].map(k=>Math.max(...points.map(v=>v[k])));
  const extents=mins.map((v,k)=>maxs[k]-v);
  const nonzeroAxes=extents.filter(v=>v>1e-6).length;
  const maxAbs=Math.max(...mins.map(Math.abs),...maxs.map(Math.abs));
  let padZero=0,padCount=0;
  if(stride===8&&kind==='i16x3'){
    for(let i=0;i<needed;i++){if(u16(start+i*stride+6)===0)padZero++;padCount++;}
  }
  let nondegenerate=0,triangleCount=0,edgeCounts=new Map(),areaValues=[];
  const area=(a,c,d)=>{
    const ab=c.map((v,k)=>v-a[k]),ac=d.map((v,k)=>v-a[k]);
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    return Math.hypot(...cross);
  };
  for(const f of payload.faceRows){
    const q=f.indices.map(i=>points[i]);
    const a1=area(q[0],q[1],q[2]),a2=area(q[0],q[2],q[3]);
    if(a1>1e-5)nondegenerate++;
    if(a2>1e-5)nondegenerate++;
    triangleCount+=2;areaValues.push(a1,a2);
    for(const [x,y] of [[f.indices[0],f.indices[1]],[f.indices[1],f.indices[2]],[f.indices[2],f.indices[3]],[f.indices[3],f.indices[0]]]){
      const k=[x,y].sort((u,v)=>u-v).join(':');edgeCounts.set(k,(edgeCounts.get(k)||0)+1);
    }
  }
  const areaRatio=triangleCount?nondegenerate/triangleCount:0;
  const padRatio=padCount?padZero/padCount:0;
  const uniqueRatio=unique.size/needed;
  const repeatedEdgeCount=[...edgeCounts.values()].filter(v=>v>1).length;
  const edgeReuseRatio=payload.faceRows.length?Math.min(1,repeatedEdgeCount/(payload.faceRows.length*2)):0;
  const score=Math.max(0,Math.min(100,
    (kind==='i16x3'?10:0)+
    (stride===8?8:0)+
    uniqueRatio*18+
    (nonzeroAxes/3)*12+
    areaRatio*25+
    (padCount?padRatio*18:0)+
    (maxAbs<10000?5:0)+
    edgeReuseRatio*12-
    (nonzeroAxes<2?20:0)
  ));
  return{
    start,stride,kind,needed,score,mins,maxs,extents,nonzeroAxes,maxAbs,
    uniqueVertices:unique.size,uniqueRatio,areaRatio,nondegenerateTriangles:nondegenerate,
    triangleCount,padZero,padCount,padRatio,repeatedEdges:repeatedEdgeCount,edgeReuseRatio,
    points
  };
}
const allCoordinateHypotheses=[];
for(const p of payloads){
  const candidates=[];
  const base=p.coordinateTarget;
  for(let delta=-maxBaseDelta;delta<=32;delta+=2){
    const start=base+delta;
    for(const stride of [8,6,12,16]){
      const c=measureCandidate(p,start,stride,'i16x3');
      if(c)candidates.push({...c,delta});
    }
    for(const stride of [12,16]){
      const c=measureCandidate(p,start,stride,'f32x3');
      if(c)candidates.push({...c,delta});
    }
  }
  candidates.sort((a,c)=>c.score-a.score);
  p.coordinateHypotheses=candidates.slice(0,20).map(c=>({
    start:c.start,delta:c.delta,stride:c.stride,kind:c.kind,score:c.score,
    needed:c.needed,uniqueRatio:c.uniqueRatio,extents:c.extents,
    areaRatio:c.areaRatio,padRatio:c.padRatio,edgeReuseRatio:c.edgeReuseRatio,
    points:c.points
  }));
  p.bestCoordinateCandidate=p.coordinateHypotheses[0]||null;
  allCoordinateHypotheses.push(...p.coordinateHypotheses.map(c=>({
    payloadOffset:p.payloadOffset,descriptorOffset:p.descriptorOffset,
    coordinateTarget:p.coordinateTarget,parentTransform:p.parentTransform,...c
  })));
}
allCoordinateHypotheses.sort((a,c)=>c.score-a.score);

function getTransformChain(offset){
  const result=[],seen=new Set();
  let current=offset;
  while(current!==null&&!seen.has(current)){
    seen.add(current);const t=transformMap.get(current);if(!t)break;
    result.push(t);
    current=t.parents.length?t.parents[0]:null;
  }
  return result.reverse();
}
function composeForPayload(payload,order,transposeMatrix){
  const chain=getTransformChain(payload.parentTransform);
  let world=[1,0,0,0,1,0,0,0,1],position=[0,0,0];
  for(const t of chain){
    const local=transposeMatrix?transpose(t.matrix):t.matrix;
    world=order==='parent-child'?mul3(world,local):mul3(local,world);
    position=position.map((v,i)=>v+t.position[i]);
  }
  return{chain:chain.map(t=>t.offset),worldMatrix:world,worldPosition:position};
}

function makeMesh(payload,candidate){
  const faces=payload.faceRows.filter(f=>f.indices.every(i=>i<candidate.needed)&&new Set(f.indices).size>=3);
  const sourceIndices=[...new Set(faces.flatMap(f=>f.indices))].sort((a,c)=>a-c);
  const localMap=new Map(sourceIndices.map((v,i)=>[v,i]));
  const localPositions=sourceIndices.map(i=>candidate.points[i]);
  const quads=faces.map(f=>f.indices);
  return{payload,coordinate:candidate,faces,sourceIndices,localMap,localPositions,quads};
}
function transformedPositions(mesh,order,transposeMatrix,applyTransform){
  if(!applyTransform)return mesh.localPositions.map(p=>p.slice());
  const xform=composeForPayload(mesh.payload,order,transposeMatrix);
  return mesh.localPositions.map(p=>apply3(xform.worldMatrix,p).map((v,i)=>v+xform.worldPosition[i]));
}
function buildNormals(positions,indices){
  const sums=Array.from({length:positions.length},()=>[0,0,0]);
  for(let i=0;i<indices.length;i+=3){
    const a=positions[indices[i]],c=positions[indices[i+1]],d=positions[indices[i+2]];
    const ab=c.map((v,k)=>v-a[k]),ac=d.map((v,k)=>v-a[k]);
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    for(const idx of [indices[i],indices[i+1],indices[i+2]])for(let k=0;k<3;k++)sums[idx][k]+=n[k];
  }
  return sums.map(v=>{const l=Math.hypot(...v);return l>1e-12?v.map(x=>x/l):[0,0,0];});
}
function writeGlb(meshInputs,fileName,mode){
  const usable=meshInputs.filter(x=>x.mesh.faces.length>0);
  const gltfMeshes=[],nodes=[],materials=[],accessors=[],bufferViews=[],binaryParts=[];
  let byteOffset=0;
  const addView=(buffer,target)=>{
    const pad=(4-byteOffset%4)%4;if(pad){binaryParts.push(Buffer.alloc(pad));byteOffset+=pad;}
    const index=bufferViews.length;bufferViews.push({buffer:0,byteOffset,byteLength:buffer.length,target});
    binaryParts.push(buffer);byteOffset+=buffer.length;return index;
  };
  for(let mi=0;mi<usable.length;mi++){
    const item=usable[mi],m=item.mesh,payload=item.payload;
    const positions=transformedPositions(m,mode.order,mode.transpose,mode.applyTransform);
    const indices=[];
    for(const q of m.quads){
      const a=m.localMap.get(q[0]),c=m.localMap.get(q[1]),d=m.localMap.get(q[2]),e=m.localMap.get(q[3]);
      indices.push(a,c,d,a,d,e);
    }
    const normals=buildNormals(positions,indices);
    const posFlat=Float32Array.from(positions.flat()),normFlat=Float32Array.from(normals.flat()),idxFlat=Uint32Array.from(indices);
    const mins=[0,1,2].map(k=>Math.min(...positions.map(v=>v[k]))),maxs=[0,1,2].map(k=>Math.max(...positions.map(v=>v[k])));
    const pView=addView(Buffer.from(posFlat.buffer),34962),nView=addView(Buffer.from(normFlat.buffer),34962),iView=addView(Buffer.from(idxFlat.buffer),34963);
    const pAcc=accessors.length;accessors.push({bufferView:pView,componentType:5126,count:positions.length,type:'VEC3',min:mins,max:maxs});
    const nAcc=accessors.length;accessors.push({bufferView:nView,componentType:5126,count:normals.length,type:'VEC3'});
    const iAcc=accessors.length;accessors.push({bufferView:iView,componentType:5125,count:indices.length,type:'SCALAR',min:[0],max:[Math.max(...indices)]});
    const color=[.48+.04*(mi%5),.55+.035*(mi%6),.64+.025*(mi%4),1];
    const material=materials.length;materials.push({name:'Scout candidate material '+(mi+1),pbrMetallicRoughness:{baseColorFactor:color,metallicFactor:0,roughnessFactor:.82},doubleSided:true});
    gltfMeshes.push({name:'payload_'+payload.payloadOffset.toString(16),primitives:[{attributes:{POSITION:pAcc,NORMAL:nAcc},indices:iAcc,material,mode:4}],extras:{
      sourcePayloadOffset:payload.payloadOffset,sourceDescriptorOffset:payload.descriptorOffset,
      coordinateTarget:payload.coordinateTarget,coordinateBase:m.coordinate.start,
      coordinateStride:m.coordinate.stride,coordinateDelta:m.coordinate.delta,
      transformChain:getTransformChain(payload.parentTransform).map(t=>hx(t.offset)),
      parentTransform:hx(payload.parentTransform),faceRecordOffsets:m.faces.map(f=>f.byteOffset),
      sourceQuads:m.quads,sourceVertexIndices:m.sourceIndices,triangleCount:indices.length/3
    }});
    nodes.push({name:'Scout geometry payload '+hx(payload.payloadOffset),mesh:mi});
  }
  const binary=Buffer.concat(binaryParts);
  const gltf={asset:{version:'2.0',generator:'Outwars Scout assembly hunter'},
    scene:0,scenes:[{name:'Scout transform-hierarchy candidate',nodes:nodes.map((_,i)=>i),extras:{
      source:path.basename(input),sourceRoot:hx(mainRoot),transformOrder:mode.order,
      transposeSourceMatrices:mode.transpose,transformsApplied:mode.applyTransform,
      positionRule:'Opcode-5 positions are added component-wise as observed in executable callback 0x4e0130; source matrices use Q20.12 scaling.',
      warning:'Candidate assembly only. Inspect against the in-game Scout before treating as final.'
    }}],nodes,meshes:gltfMeshes,materials,accessors,bufferViews,buffers:[{byteLength:binary.length}]};
  let json=Buffer.from(JSON.stringify(gltf));const jp=(4-json.length%4)%4;if(jp)json=Buffer.concat([json,Buffer.alloc(jp,32)]);
  const bp=(4-binary.length%4)%4;const bin=bp?Buffer.concat([binary,Buffer.alloc(bp)]):binary;
  const total=12+8+json.length+8+bin.length,headBuf=Buffer.alloc(12);
  headBuf.writeUInt32LE(0x46546c67,0);headBuf.writeUInt32LE(2,4);headBuf.writeUInt32LE(total,8);
  const jh=Buffer.alloc(8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
  const out=path.join(outDir,fileName);fs.writeFileSync(out,Buffer.concat([headBuf,jh,json,bh,bin]));
  return{file:out,meshCount:usable.length,totalVertices:usable.reduce((n,x)=>n+x.mesh.localPositions.length,0),totalTriangles:usable.reduce((n,x)=>n+x.mesh.faces.length*2,0)};
}

// Select the best candidate coordinate interpretation independently for each
// payload. Preserve all alternatives in JSON/CSV so the visual comparison can
// reject a false layout without rerunning the expensive binary sweep.
const selected=[];
for(const p of payloads){
  const c=p.bestCoordinateCandidate;
  if(!c)continue;
  const valid=p.faceRows.filter(f=>f.indices.every(i=>i<c.needed)&&new Set(f.indices).size>=3);
  if(!valid.length)continue;
  selected.push({payload:p,mesh:makeMesh(p,c),faceCount:valid.length,score:c.score});
}
selected.sort((a,c)=>a.payload.parentTransform-c.payload.parentTransform);

const rootReach=descendants(mainRoot);
const rawGlb=writeGlb(selected,'scout-inline-payloads-local.glb',{applyTransform:false,order:'parent-child',transpose:false});
const variants=[];
for(const order of ['parent-child','child-parent'])for(const transposeMatrix of [false,true]){
  const label=order+'-'+(transposeMatrix?'transposed':'stored');
  const r=writeGlb(selected,'scout-inline-payloads-'+label+'.glb',{applyTransform:true,order,transpose:transposeMatrix});
  variants.push({label,order,transpose:transposeMatrix,...r});
}

// Optional executable disassembly cross-check. The bridge captures the
// opcode-4/5 callback branches plus fixed-point matrix helpers and consumers.
let executableBridge={status:'not requested'};
if(exePath){
  const bridge=path.join(here,'scout-exe-transform-bridge.sh');
  if(!fs.existsSync(exePath))executableBridge={status:'failed',reason:'Executable not found: '+exePath};
  else if(!fs.existsSync(bridge))executableBridge={status:'skipped',reason:'scout-exe-transform-bridge.sh not found'};
  else{
    const exeOut=path.join(outDir,'executable-analysis');fs.mkdirSync(exeOut,{recursive:true});
    const r=spawnSync('bash',[bridge,exePath,exeOut],{cwd:repoRoot,encoding:'utf8',maxBuffer:128*1024*1024});
    executableBridge={status:r.status===0?'completed':'failed',output:exeOut,report:path.join(exeOut,'REPORT.txt'),exitCode:r.status,stderr:r.stderr||''};
  }
}

// Existing exporter control, never substituted for inline-payload candidates.
let rawControl={status:'skipped'};
if(!noRawControl){
  const exporter=path.join(here,'export-dpc-armour-geometry.mjs');
  if(fs.existsSync(exporter)){
    const out=path.join(outDir,'legacy-nine-mesh-control.glb');
    const r=spawnSync(process.execPath,[exporter,input,out],{encoding:'utf8',maxBuffer:64*1024*1024});
    rawControl={status:r.status===0?'completed':'failed',output:out,exitCode:r.status,stderr:r.stderr||''};
    const jp=out.replace(/\.glb$/i,'.json');
    if(fs.existsSync(jp))try{const x=JSON.parse(fs.readFileSync(jp,'utf8'));rawControl.meshCount=x.meshCount;rawControl.vertices=x.totalVertices;rawControl.triangles=x.totalTriangles;}catch{}
  }
}
const report={
  title:'OUTWARS SCOUT INLINE GEOMETRY ASSEMBLY HUNT',
  generatedAt:new Date().toISOString(),source:input,sourceArchive,autoExtractDirectory,
  fileBytes:b.length,relocationBase:hx(relocationBase),outputDirectory:outDir,
  selfTests:selfTest(),
  transformGraph:{allTransformRecords:transforms.length,roots:rootCandidates,selectedRoot:hx(mainRoot),selectedRootNodeCount:rootReach.length,selectedTransforms:rootReach.map(o=>{
    const t=transformMap.get(o);return{offset:hx(o),parents:t.parents.map(hx),matrixQ20_12:t.matrix,position:t.position,children:t.children.map(c=>({offset:hx(c.target),header:c.header}))};
  })},
  attachments:attachments.map(a=>({offset:hx(a.offset),parentTransform:hx(a.parentTransform),slots:a.slots.map(s=>({
    slot:s.slot,wrapper:hx(s.wrapper),descriptor:hx(s.descriptor),coordinateTarget:hx(s.coordinateTarget),payloadTarget:hx(s.payloadTarget),
    payloadHeader:s.payloadHeader,descriptorWords:s.descriptorWords?.map(hx)
  }))})),
  payloads:payloads.map(p=>({
    parentTransform:hx(p.parentTransform),attachment:hx(p.attachmentOffset),slot:p.slot,
    descriptor:hx(p.descriptorOffset),coordinateTarget:hx(p.coordinateTarget),payload:hx(p.payloadOffset),
    entryCount:p.entryCount,faceMarkerCount:p.faceMarkerCount,validFaceCount:p.validFaceCount,
    uniqueFaceCount:p.uniqueFaceCount,maxIndex:p.maxIndex,
    faces:p.faceRows.map(f=>({entryIndex:f.entryIndex,indices:f.indices,byteOffset:hx(f.byteOffset)})),
    coordinateHypotheses:p.coordinateHypotheses.map(c=>({...c,points:undefined})),
    selectedCoordinateCandidate:p.bestCoordinateCandidate?{start:hx(p.bestCoordinateCandidate.start),stride:p.bestCoordinateCandidate.stride,kind:p.bestCoordinateCandidate.kind,score:p.bestCoordinateCandidate.score,delta:p.bestCoordinateCandidate.delta,extents:p.bestCoordinateCandidate.extents,padRatio:p.bestCoordinateCandidate.padRatio,areaRatio:p.bestCoordinateCandidate.areaRatio}:null
  })),
  selectedMeshes:selected.map(x=>({
    payload:hx(x.payload.payloadOffset),descriptor:hx(x.payload.descriptorOffset),
    parentTransform:hx(x.payload.parentTransform),faceCount:x.mesh.faces.length,
    vertices:x.mesh.localPositions.length,coordinateBase:hx(x.mesh.coordinate.start),
    coordinateStride:x.mesh.coordinate.stride,coordinateScore:x.score,
    transformChain:getTransformChain(x.payload.parentTransform).map(t=>hx(t.offset))
  })),
  exports:{localGeometry:rawGlb,transformedVariants:variants,legacyRawControl:rawControl,executableBridge},
  conclusion:{
    status:selected.length?'INLINE_GEOMETRY_CANDIDATES_EXPORTED':'NO_GEOMETRY_CANDIDATE_PASSED',
    assembledScoutClaimed:false,
    explanation:'This pass tests the embedded quad records inside descriptor+12 opcode-4 payload streams against the coordinate data referenced by descriptor+4, then exports local and transformed GLBs using the main opcode-5 hierarchy. The output is a set of assembly candidates, not yet a visually validated final Scout.',
    acceptanceTests:[
      'Inspect the four transformed GLBs and identify whether the geometry forms a coherent humanoid Scout rather than scattered plates',
      'Check whether the selected coordinate stride/base yields coherent connected surfaces and plausible bounds',
      'Compare part placement against a known in-game Scout reference',
      'If one transform convention is visibly correct, freeze it and validate against another Scout variant'
    ]
  }
};
fs.writeFileSync(path.join(outDir,'analysis.json'),JSON.stringify(report,null,2)+'\n');

function csv(v){return'"'+String(v??'').replace(/"/g,'""')+'"';}
const meshCsv=[['payload','descriptor','parentTransform','coordinateTarget','selectedBase','stride','baseDelta','score','faceCount','maxIndex','padRatio','areaRatio'],
...payloads.map(p=>[hx(p.payloadOffset),hx(p.descriptorOffset),hx(p.parentTransform),hx(p.coordinateTarget),p.bestCoordinateCandidate?hx(p.bestCoordinateCandidate.start):'',p.bestCoordinateCandidate?.stride??'',p.bestCoordinateCandidate?.delta??'',p.bestCoordinateCandidate?.score??'',p.faceRows.length,p.maxIndex,p.bestCoordinateCandidate?.padRatio??'',p.bestCoordinateCandidate?.areaRatio??''])];
fs.writeFileSync(path.join(outDir,'candidate-meshes.csv'),meshCsv.map(r=>r.map(csv).join(',')).join('\n')+'\n');
const coordCsv=[['payload','descriptor','coordinateTarget','start','delta','stride','kind','score','needed','uniqueRatio','padRatio','areaRatio','extents'],
...allCoordinateHypotheses.map(c=>[hx(c.payloadOffset),hx(c.descriptorOffset),hx(c.coordinateTarget),hx(c.start),c.delta,c.stride,c.kind,c.score,c.needed,c.uniqueRatio,c.padRatio,c.areaRatio,c.extents.join(' ')])];
fs.writeFileSync(path.join(outDir,'coordinate-hypotheses.csv'),coordCsv.map(r=>r.map(csv).join(',')).join('\n')+'\n');

const md=[
  '# Scout inline geometry assembly hunt','',
  '- Source: '+input,'- DPC bytes: '+b.length,'- Relocation base: '+hx(relocationBase),
  '- Selected transform root: '+hx(mainRoot)+' ('+rootReach.length+' transform nodes)',
  '- Direct transform attachments: '+attachments.length,'- Descriptor payloads paired: '+payloads.length,
  '- Payloads with embedded face records: '+payloads.filter(p=>p.faceRows.length>0).length,
  '- Exportable geometry candidates: '+selected.length,
  '',
  '## Mesh candidate results','',
  '| Payload | Descriptor | Parent transform | Coordinate base | Stride | Score | Quads | Vertices |',
  '|---|---|---|---|---:|---:|---:|---:|',
  ...selected.map(x=>'| '+hx(x.payload.payloadOffset)+' | '+hx(x.payload.descriptorOffset)+' | '+hx(x.payload.parentTransform)+' | '+hx(x.mesh.coordinate.start)+' | '+x.mesh.coordinate.stride+' | '+x.score.toFixed(1)+' | '+x.mesh.faces.length+' | '+x.mesh.localPositions.length+' |'),
  '',
  '## Exported candidates','',
  '- '+rawGlb.file+' (local geometry, no transforms)',
  ...variants.map(v=>'- '+v.file+' ('+v.label+') — '+v.meshCount+' meshes, '+v.totalTriangles+' triangles'),
  '',
  '## Transform graph','',
  'The builder selected the root with the largest validated opcode-5 descendant graph. Its transforms are recorded in analysis.json; the 0x9300 root is expected for this Scout resource if its 11-node branch is present.',
  '',
  '## Interpretation','',
  'Face markers are only accepted when the exact four-byte marker is aligned within the opcode-4 inline DWORD stream and the following four uint16 indices form at least three distinct indices. Coordinate hypotheses are ranked using index bounds, signed-int16 point uniqueness, spatial spread, non-degenerate triangle area and (for 8-byte records) the zero trailing-word ratio.',
  '',
  'The highest coordinate score is still a candidate, not proof. Compare the four world-transform variants visually. The builder deliberately retains all per-payload alternatives in analysis.json and coordinate-hypotheses.csv.',
  '',
  '## Existing raw geometry control','',
  JSON.stringify(rawControl,null,2),
  '',
  '## Final status','',
  selected.length?'Inline geometry candidates have been exported. The assembled Scout is **not yet declared finished** until one transformed GLB is visually recognisable and its coordinate layout/transform convention pass independent checks.':'No candidate passed the current geometric validation filters. Inspect analysis.json and coordinate-hypotheses.csv before expanding the candidate search.'
];
fs.writeFileSync(path.join(outDir,'ASSEMBLY-HUNT.md'),md.join('\n')+'\n');

console.log('SCOUT ASSEMBLY HUNT COMPLETE');
console.log('Main transform root: '+hx(mainRoot)+' ('+rootReach.length+' transform records)');
console.log('Direct attachments: '+attachments.length+' | paired coordinate/payload descriptors: '+payloads.length);
console.log('Embedded face payloads: '+payloads.filter(p=>p.faceRows.length>0).length+' | exportable geometry candidates: '+selected.length);
console.log('Local candidate: '+rawGlb.file);
for(const v of variants)console.log(v.label+': '+v.file+' ('+v.meshCount+' meshes, '+v.totalTriangles+' triangles)');
console.log('Executable cross-check: '+executableBridge.status);
console.log('Legacy raw control: '+rawControl.status);
console.log('Report: '+path.join(outDir,'ASSEMBLY-HUNT.md'));
console.log('Full analysis: '+path.join(outDir,'analysis.json'));
console.log('FINAL SCOUT: NOT CLAIMED until the candidate is visually verified.');
