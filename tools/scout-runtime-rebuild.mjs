#!/usr/bin/env node
/**
 * Outwars Scout runtime callback rebuild.
 *
 * Reproduces the DPC callback work-stack (24-byte entries) from the executable
 * dispatch table at 0x4DFCAC. This replaces the earlier static guesswork that
 * treated opcode-4 payload DWORDs as inline geometry and misnumbered some
 * callback handlers.
 *
 * The simulator implements the handlers whose data flow is visible in the
 * checked disassembly: opcodes 0,1,2,3,4,5,7,9,10,11; the remaining handlers are
 * recorded as no-op/opaque callbacks. Opcode-4 list access is context-derived:
 * it reads [currentY + record+8 + i*4 + 0x14], exactly as the executable does.
 *
 * It then correlates executed callback entries with the eight legacy geometry
 * sections, exports transform-applied GLB variants, and reports every skipped
 * or unresolved edge. No guessed inline face-array interpretation is used.
 *
 * Usage:
 *   node tools/scout-runtime-rebuild.mjs original-data/units.ff scout-runtime-rebuild
 *   node tools/scout-runtime-rebuild.mjs path/to/scout_mj.dpc scout-runtime-rebuild --exe outwars.exe
 *
 * Optional:
 *   --initial-scale 0
 *   --max-work 5000
 *   --also-transform-roots
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,'..');
const args=process.argv.slice(2);
let input=null,outArg=null,exePath=null,initialScaleOverride=null,maxWork=50000,alsoTransformRoots=false;
for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='--exe'){if(!args[i+1])throw new Error('--exe requires a path');exePath=path.resolve(args[++i]);}
  else if(a==='--initial-scale'){initialScaleOverride=Number(args[++i]);if(!Number.isFinite(initialScaleOverride))throw new Error('Invalid initial scale');}
  else if(a==='--max-work'){maxWork=Number(args[++i]);if(!Number.isInteger(maxWork)||maxWork<1)throw new Error('--max-work must be positive');}
  else if(a==='--also-transform-roots')alsoTransformRoots=true;
  else if(a.startsWith('--'))throw new Error('Unknown option '+a);
  else if(input===null)input=a;else if(outArg===null)outArg=a;else throw new Error('Unexpected argument '+a);
}
if(!input){console.error('Usage: node tools/scout-runtime-rebuild.mjs <scout.dpc|units.ff> [output-dir] [--exe outwars.exe]');process.exit(2);}
input=path.resolve(input);
const outDir=path.resolve(outArg||'scout-runtime-rebuild');
fs.mkdirSync(outDir,{recursive:true});
let sourceArchive=null,autoExtractDirectory=null;
function extractScout(archive){
  const extractor=path.join(here,'extract-ff-resources.mjs');
  if(!fs.existsSync(extractor))throw new Error('Missing tools/extract-ff-resources.mjs');
  autoExtractDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'outwars-scout-runtime-'));
  const r=spawnSync(process.execPath,[extractor,archive,'--out',autoExtractDirectory],{cwd:repoRoot,encoding:'utf8',maxBuffer:32*1024*1024});
  if(r.status!==0)throw new Error('FF archive validation/extraction failed: '+(r.stderr||r.stdout||'no output'));
  const p=path.join(autoExtractDirectory,path.basename(archive,path.extname(archive)),'scout_mj.dpc');
  if(!fs.existsSync(p))throw new Error('Archive contains no scout_mj.dpc at '+p);
  sourceArchive=archive;return p;
}
if(fs.existsSync(input)&&path.extname(input).toLowerCase()==='.ff')input=extractScout(input);
else if(!fs.existsSync(input)){
  const archive=path.join(repoRoot,'original-data','units.ff');
  if(path.basename(input).toLowerCase()==='scout_mj.dpc'&&fs.existsSync(archive))input=extractScout(archive);
  else throw new Error('Input not found: '+input+'; also checked '+archive);
}
const b=fs.readFileSync(input);
if(b.length<40||b.toString('ascii',0,4)!=='DCPM'||b[4]!==0x43)throw new Error('Expected a DCPMC resource');
const base=b.readUInt32LE(12);
const u8=o=>o>=0&&o<b.length?b[o]:null;
const u16=o=>o>=0&&o+2<=b.length?b.readUInt16LE(o):null;
const s16=o=>o>=0&&o+2<=b.length?b.readInt16LE(o):null;
const u32=o=>o>=0&&o+4<=b.length?b.readUInt32LE(o):null;
const s32=o=>o>=0&&o+4<=b.length?b.readInt32LE(o):null;
const initialScale=initialScaleOverride??(u32(16)??0);
const inRange=(o,n=4)=>Number.isInteger(o)&&o>=0&&o+n<=b.length;
const hex=n=>'0x'+Number(n).toString(16);
function relocatedTarget(raw){
  if(!Number.isInteger(raw))return null;
  const t=raw-base;
  return raw>=base&&inRange(t,4)?t:null;
}
function ptr(field){return inRange(field)?relocatedTarget(u32(field)):null;}
function safeDword(o){return inRange(o)?u32(o):null;}
function header(o){return inRange(o)?{offset:o,opcode:u8(o),flags:u8(o+1),classWord:u16(o+2)}:null;}
const callbackTargets=[
  0x4dfde1,0x4dfe56,0x4dfef3,0x4dff99,0x4e006d,0x4e0130,
  0x4e0494,0x4e04a2,0x4e023a,0x4e0253,0x4e02e7,0x4e0399,
  0x4e023a,0x4e0253
];
const callbackNames=[
  'scale-normalize','pointer-list-plus18','descriptor-list-op2','flag-list-plus20',
  'context-list-op4','matrix-transform-op5','class-reset','class-reset',
  'noop','flag-list-op9','two-child-op10','scale-child-list-op11','noop','flag-list-op9'
];

function det3(m){return m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);}
function mul3(a,c){
  const out=new Array(9).fill(0);
  for(let r=0;r<3;r++)for(let col=0;col<3;col++)for(let k=0;k<3;k++)out[r*3+col]+=a[r*3+k]*c[k*3+col];
  return out.map(v=>Math.floor(v*4096)/4096);
}
function apply3(m,v){
  return[
    Math.floor((m[0]*v[0]+m[1]*v[1]+m[2]*v[2])*4096)/4096,
    Math.floor((m[3]*v[0]+m[4]*v[1]+m[5]*v[2])*4096)/4096,
    Math.floor((m[6]*v[0]+m[7]*v[1]+m[8]*v[2])*4096)/4096
  ];
}
function transformMatrix(o){return Array.from({length:9},(_,i)=>s32(o+4+i*4)/4096);}
function identity(){return[1,0,0,0,1,0,0,0,1];}
const selfTests=[];
function assert(name,ok){selfTests.push({name,passed:!!ok});}
assert('relocation base present',base>0);
assert('callback table has fourteen entries',callbackTargets.length===14);
assert('opcode 9 targets 0x4e0253',callbackTargets[9]===0x4e0253);
assert('opcode 11 targets 0x4e0399',callbackTargets[11]===0x4e0399);
assert('identity matrix product',mul3(identity(),[1,2,3,4,5,6,7,8,9]).join(',')==='1,2,3,4,5,6,7,8,9');
assert('Q20.12 unit identity transform',apply3(identity(),[12,-6,3]).join(',')==='12,-6,3');
if(selfTests.some(x=>!x.passed))throw new Error('Runtime simulator self-test failed: '+JSON.stringify(selfTests));

// Locate the playable-armour root and its eight raw geometry owners.
function typed(o,t,c){return inRange(o)&&u8(o)===t&&u16(o+2)===c;}
let rootRecord=null,rootNode=null,rootClass=null,partClass=null,partList=null;
for(const [rc,pc] of [[102,105],[152,155]]){
  for(let o=0;o+24<=b.length;o++){
    if(!typed(o,9,rc))continue;
    const n=ptr(o+16),l=ptr(o+20);
    if(n!==null&&l!==null&&u8(n)===1&&typed(l,9,pc)&&u16(l+6)===9){
      rootRecord=o;rootNode=n;rootClass=rc;partClass=pc;partList=l;break;
    }
  }
  if(rootRecord!==null)break;
}
if(rootNode===null)throw new Error('Could not locate the Scout playable-armour root');
const owners=[];
for(let i=0;i<8;i++){
  const owner=ptr(partList+16+i*4);
  if(owner===null||u8(owner)!==1)throw new Error('Invalid legacy geometry owner at slot '+i);
  owners.push(owner);
}

function readExeInitialMatrix(file){
  if(!file||!fs.existsSync(file))return{status:'identity-fallback',matrix:identity(),detail:'No executable supplied'};
  const e=fs.readFileSync(file);
  // The supplied executable report identifies DGROUP VMA 0x520000 at raw
  // offset 0x10de00. 0x52d224 holds the 12-DWORD initial callback matrix.
  const raw=0x10de00+(0x52d224-0x520000);
  if(!inRangeExe(e,raw,48))return{status:'identity-fallback',matrix:identity(),detail:'Static global matrix outside executable file'};
  const words=Array.from({length:12},(_,i)=>e.readInt32LE(raw+i*4));
  const matrix=[words[0]/4096,words[1]/4096,words[2]/4096,words[4]/4096,words[5]/4096,words[6]/4096,words[8]/4096,words[9]/4096,words[10]/4096];
  if(matrix.some(x=>!Number.isFinite(x)||Math.abs(x)>4))return{status:'identity-fallback',matrix:identity(),detail:'Static global did not resemble a Q20.12 3x3 basis',words};
  return{status:'read-from-executable-DGROUP',matrix,words,rawOffset:raw};
}
function inRangeExe(e,o,n){return o>=0&&o+n<=e.length;}
const initialMatrixInfo=readExeInitialMatrix(exePath);

// Callback work-stack entry format is the six DWORDs written by 0x4dfce4:
// record, parent/matrix index, state X, state Y, state Z, scale/context.
const work=[],events=[],matrices=new Map([[0,initialMatrixInfo.matrix]]);
const unresolved=[],leafRecords=[],edgeRows=[],callbackCounts={},seedRuns=[];
let nextMatrixId=1,processed=0,nextEntryId=0,activeRunId=0,activeSeed=null;
const visitedCounts=new Map();
function enqueue(child,parentMatrix,state,scale,source,slot){
  if(!inRange(child))return false;
  const h=header(child);
  if(!h)return false;
  const entry={
    id:nextEntryId++,runId:activeRunId,record:child,parentMatrix,
    x:state[0]|0,y:state[1]|0,z:state[2]|0,
    scale:scale|0,source,slot
  };
  work.push(entry);
  edgeRows.push({runId:activeRunId,seed:activeSeed,from:source,to:child,slot,opcode:h.opcode,classWord:h.classWord,entryId:entry.id});
  return true;
}
function contextArrayAddress(newY,count){
  // Opcode 4 adds record+8 to the incoming Y state, then dereferences
  // [newY+0x14+4*i]. The pointer arithmetic is done in the loaded DPC address
  // space. In the file image, test the relocated-base and direct-file-offset
  // views of that already-updated address. Do NOT add record+8 a second time.
  const candidates=[
    {mode:'relocated-base',base:newY-base},
    {mode:'direct-file-offset',base:newY}
  ];
  const scored=candidates.map(c=>{
    const first=c.base+0x14,valid=inRange(first,Math.max(0,count)*4);
    let pointerHits=0,callbackHits=0,targets=[];
    if(valid)for(let i=0;i<count;i++){
      const field=first+i*4,raw=u32(field),target=relocatedTarget(raw);
      if(target!==null){
        pointerHits++;targets.push(target);
        const op=u8(target);
        if(op<=13)callbackHits++;
      }
    }
    return{...c,firstField:first,valid,pointerHits,callbackHits,targets};
  }).sort((a,c)=>c.callbackHits-a.callbackHits||c.pointerHits-a.pointerHits);
  return scored[0]||null;
}
function childFromRelocatedField(field,context){
  const raw=u32(field),target=relocatedTarget(raw);
  if(target===null)unresolved.push({source:context,field,raw:hex(raw),reason:'not a relocated in-file pointer'});
  return target;
}
function pushListChildren(record,offset,count,entry,handler,fieldMode='relocated'){
  const out=[];
  for(let i=0;i<count;i++){
    const f=offset+i*4;
    if(!inRange(f)){unresolved.push({source:record,field:f,reason:'list runs past DPC'});break;}
    let child;
    if(fieldMode==='indirect-plus8'){
      const wrapper=childFromRelocatedField(f,record);
      child=wrapper===null?null:childFromRelocatedField(wrapper+8,record);
    }else child=childFromRelocatedField(f,record);
    if(child!==null){
      enqueue(child,entry.parentMatrix,[entry.x,entry.y,entry.z],entry.scale,record,i);
      out.push(child);
    }
  }
  return out;
}
// The executable parser iterates the DPC top-level pointer table and invokes
// the callback dispatcher once for each record. Reproduce that entry route,
// rather than starting only at the playable-armour root.
const tableCount=u32(32)??0,topLevelRecords=[];
if(tableCount>0&&tableCount<=8192&&inRange(36,tableCount*4)){
  for(let i=0;i<tableCount;i++){
    const target=ptr(36+i*4);
    if(target!==null&&header(target)&&!topLevelRecords.includes(target))topLevelRecords.push(target);
  }
}
const seedOffsets=topLevelRecords.length?topLevelRecords.slice():[rootNode];
if(!seedOffsets.includes(rootNode))seedOffsets.push(rootNode);
if(alsoTransformRoots){
  for(let o=0;o+0x3c<=b.length;o++){
    if(u8(o)!==5)continue;
    const count=u8(o+0x36);
    if(count<1||count>32||!inRange(o+0x38,count*4))continue;
    let ok=true;for(let i=0;i<count;i++)if(ptr(o+0x38+i*4)===null){ok=false;break;}
    if(ok&&!seedOffsets.includes(o))seedOffsets.push(o);
  }
}
let truncated=false;
for(const seed of seedOffsets){
  if(processed>=maxWork){truncated=true;break;}
  work.length=0;
  activeRunId=seedRuns.length;
  activeSeed=seed;
  const runStart=processed;
  enqueue(seed,0,[0,0,0],initialScale,null,0);

  while(work.length&&processed-runStart<0x44c&&processed<maxWork){
  // The native dispatcher pops the newest 24-byte stack entry.
  const entry=work.pop();processed++;
  const record=entry.record,h=header(record),opcode=h?.opcode??255,classWord=h?.classWord??0;
  callbackCounts[opcode]=(callbackCounts[opcode]||0)+1;
  const key=activeRunId+':'+record+':'+entry.parentMatrix+':'+entry.scale;
  const vc=(visitedCounts.get(key)||0)+1;visitedCounts.set(key,vc);
  if(vc>16){unresolved.push({record,opcode,reason:'same record/state visited more than 16 times; cycle guard'});continue;}
  const state=[entry.x,entry.y,entry.z];
  const event={entryId:entry.id,runId:activeRunId,seedRecord:activeSeed,record,recordHex:hex(record),opcode,handlerAddress:hex(callbackTargets[opcode]??0),handlerName:callbackNames[opcode]??'unmapped',classWord,parentMatrix:entry.parentMatrix,position:state,scale:entry.scale,source:entry.source,sourceSlot:entry.slot,children:[]};
  let childCount=0;
  if(opcode===0){
    // Native branch 0 normalizes the three state words between scale levels.
    // A zero class exits immediately; otherwise keep both source and adjusted
    // values so that alternative initial scale tests can be compared.
    if(classWord!==0){
      const d=entry.scale-initialScale,shift=Math.min(30,Math.abs(d));
      if(d<0)event.normalizedPosition=state.map(v=>v<<shift);
      else if(d>0)event.normalizedPosition=state.map(v=>v>>shift);
    }
  }else if(opcode===1){
    const n=u8(record+0x14)??0;
    event.list={count:n,base:record+0x18,layout:'relocated DWORD pointers at +0x18'};
    event.children=pushListChildren(record,record+0x18,n,entry,opcode);
    childCount=event.children.length;
  }else if(opcode===2){
    const n=u32(record+0x10);
    event.list={count:n,base:record+0x14,layout:'DWORD relocated pointer slots; each slot target +8 contains child pointer'};
    if(n!==null&&n<=128){
      event.children=pushListChildren(record,record+0x14,n,entry,opcode,'indirect-plus8');
      childCount=event.children.length;
    }else unresolved.push({record,opcode,reason:'opcode-2 count invalid',count:n});
  }else if(opcode===3){
    if(u8(record+0x0a)===1)b[record+0x0d]=1;
    const n=u8(record+0x0b)??0;
    event.list={count:n,base:record+0x20,layout:'relocated DWORD pointers at +0x20'};
    event.children=pushListChildren(record,record+0x20,n,entry,opcode);
    childCount=event.children.length;
  }else if(opcode===4){
    const nextState=[
      (entry.x+s32(record+4))|0,
      (entry.y+s32(record+8))|0,
      (entry.z+s32(record+12))|0
    ];
    const n=u8(record+0x12)??0;
    const list=contextArrayAddress(nextState[1],n);
    event.contextList={count:n,sourceRule:'[newY + 0x14 + 4*i]',resolvedFirstField:list?hex(list.firstField):null,
      addressMode:list?.mode??null,relocatedPointerHits:list?.pointerHits??0,callbackTargetHits:list?.callbackHits??0};
    if(n&&list?.valid){
      for(let i=0;i<n;i++){
        const f=list.firstField+i*4;
        const child=childFromRelocatedField(f,record);
        if(child!==null){enqueue(child,entry.parentMatrix,nextState,entry.scale,record,i);event.children.push(child);}
      }
    }else if(n)unresolved.push({record,opcode,reason:'opcode-4 context-derived list could not be resolved',stateY:nextState[1],candidate:list});
    event.positionAfter=nextState;childCount=event.children.length;
  }else if(opcode===5){
    const local=transformMatrix(record);
    const translated=[(entry.x+s32(record+0x28))|0,(entry.y+s32(record+0x2c))|0,(entry.z+s32(record+0x30))|0];
    // Exact 0x4c6610 action on the state vector: local Q20.12 3x3 * translated vector.
    const transformed=apply3(local,translated);
    const parent=matrices.get(entry.parentMatrix)||initialMatrixInfo.matrix;
    const world=mul3(parent,local);
    const matrixId=nextMatrixId++;
    matrices.set(matrixId,world);
    event.matrix={localQ20_12:local,parentMatrixId:entry.parentMatrix,worldMatrixCandidate:world,determinant:det3(world),matrixId};
    event.positionAfter=transformed;
    const n=u8(record+0x36)??0;
    event.list={count:n,base:record+0x38,layout:'relocated DWORD child pointers at +0x38'};
    for(let i=0;i<n;i++){
      const child=childFromRelocatedField(record+0x38+i*4,record);
      if(child!==null){enqueue(child,matrixId,transformed,entry.scale,record,i);event.children.push(child);}
    }
    childCount=event.children.length;
  }else if(opcode===7){
    const n=u8(record+6)??0;
    event.list={count:n,base:record+0x10,layout:'relocated DWORD child pointers at +0x10'};
    event.children=pushListChildren(record,record+0x10,n,entry,opcode);
    childCount=event.children.length;
  }else if(opcode===9||opcode===13){
    if(u8(record+0x0a)===1)b[record+0x0d]=1;
    const n=u8(record+0x0b)??0;
    event.list={count:n,base:record+0x20,layout:'relocated DWORD child pointers at +0x20'};
    event.children=pushListChildren(record,record+0x20,n,entry,opcode);
    childCount=event.children.length;
  }else if(opcode===10){
    // Executable table index 10 -> 0x4e02e7: emits record+8 and record+0x0c.
    const children=[];
    for(const rel of [8,12]){
      const child=childFromRelocatedField(record+rel,record);
      if(child!==null){enqueue(child,entry.parentMatrix,state,entry.scale,record,rel);children.push(child);}
    }
    event.list={count:2,base:record+8,layout:'two relocated pointers at +8 and +0x0c'};
    event.children=children;childCount=children.length;
  }else if(opcode===11){
    // Executable table index 11 -> 0x4e0399: WORD +4 selects scale level;
    // WORD +6 counts relocated child pointers beginning at +8.
    const targetScale=u16(record+4)??entry.scale;
    const delta=entry.scale-targetScale,shift=Math.min(30,Math.abs(delta));
    const scaled=delta<0?state.map(v=>v<<shift):delta>0?state.map(v=>v>>shift):state;
    const n=u16(record+6)??0;
    event.scaleRule={from:entry.scale,to:targetScale,delta,shift};
    event.positionAfter=scaled;
    event.list={count:n,base:record+8,layout:'relocated DWORD child pointers at +8'};
    for(let i=0;i<n;i++){
      const child=childFromRelocatedField(record+8+i*4,record);
      if(child!==null){enqueue(child,entry.parentMatrix,scaled,targetScale,record,i);event.children.push(child);}
    }
    childCount=event.children.length;
  }else{
    // Opcode 6, 8 and 12 are simple class-state callbacks in the observed
    // table, and opcode 13 shares the opcode-9 handler.
    event.opaqueHandler=true;
  }
  event.childCount=childCount;
  if(!childCount)leafRecords.push({record,opcode,classWord,entryId:entry.id,parentMatrix:entry.parentMatrix,position:state,scale:entry.scale});
  events.push(event);
  }
  if(work.length){
    truncated=true;
    unresolved.push({record:seed,opcode:u8(seed),reason:'per-callback work-stack limit reached',remaining:work.length,runId:activeRunId});
    work.length=0;
  }
  seedRuns.push({runId:activeRunId,seedRecord:seed,seedRecordHex:hex(seed),events:events.filter(e=>e.runId===activeRunId).length,processed:processed-runStart,remaining:work.length,contextWord:initialScale,initialState:[0,0,0]});
}

// Extract the established nine raw meshes; their coordinate/face structure is
// source-validated independently of the callback traversal.
function readQuads(start,count,label){
  const sig=Buffer.from([4,1,12,9]),out=[];let cursor=start;
  for(let i=0;i<count;i++){
    cursor=b.indexOf(sig,cursor);
    if(cursor<0||cursor+12>b.length)throw new Error(label+': could not locate face record '+(i+1)+'/'+count);
    out.push([u16(cursor+4),u16(cursor+6),u16(cursor+8),u16(cursor+10)]);
    cursor+=4;
  }
  const seen=new Set(),dedup=[];
  for(const q of out){if(new Set(q).size<3)continue;const k=q.slice().sort((a,c)=>a-c).join(',');if(!seen.has(k)){seen.add(k);dedup.push(q);}}
  return dedup;
}
function readMesh(name,owner,meshNode,transformNode,vertexBase,faceStart,faceCount){
  const quads=readQuads(faceStart,faceCount,name),srcIds=[...new Set(quads.flat())].sort((a,c)=>a-c);
  const positions=srcIds.map(i=>{
    const p=vertexBase+i*8;if(!inRange(p,6))throw new Error(name+': vertex '+i+' out of range');
    return[s16(p),s16(p+2),s16(p+4)];
  });
  const indexMap=new Map(srcIds.map((v,i)=>[v,i]));
  const indices=[];
  for(const q of quads)indices.push(indexMap.get(q[0]),indexMap.get(q[1]),indexMap.get(q[2]),indexMap.get(q[0]),indexMap.get(q[2]),indexMap.get(q[3]));
  return{name,owner,meshNode,transformNode,vertexBase,faceStart,quads,sourceIndices:srcIds,positions,indices};
}
const meshes=[];
const rootVertex=ptr(rootNode+28),rootFaces=ptr(rootNode+36);
meshes.push(readMesh('root_mesh',rootNode,rootNode,null,rootVertex,rootFaces,22));
for(let i=0;i<owners.length;i++){
  const owner=owners[i],meshNode=ptr(owner+24),transformNode=ptr(owner+28);
  if(meshNode===null||transformNode===null)throw new Error('Part '+(i+1)+' mesh/transform pointer invalid');
  const desc=ptr(ptr(meshNode+20)+8),vertex=ptr(desc+4),faces=ptr(meshNode+36);
  meshes.push(readMesh('submesh_'+(i+1),owner,meshNode,transformNode,vertex,faces,26));
}

// Correlate each raw geometry section with the work-stack event for its mesh
// and paired transform node. The transform frame is inherited by opcode-2
// records and is keyed by the matrixId attached to the event.
const eventMap=new Map();
for(const e of events){
  const k=String(e.record);
  if(!eventMap.has(k))eventMap.set(k,[]);
  eventMap.get(k).push(e);
}
function eventFor(offset){
  const rows=eventMap.get(String(offset))||[];
  return rows.slice().sort((a,c)=>{
    const as=(a.matrix?.matrixId!==undefined?4:0)+(a.parentMatrix!==0?2:0)+(a.positionAfter?1:0);
    const cs=(c.matrix?.matrixId!==undefined?4:0)+(c.parentMatrix!==0?2:0)+(c.positionAfter?1:0);
    return cs-as;
  })[0]||null;
}
function matrixForEvent(e){
  if(!e)return initialMatrixInfo.matrix;
  const id=e.matrix?.matrixId??e.parentMatrix;
  return matrices.get(id)||initialMatrixInfo.matrix;
}
function applyTransform(point,matrix,position,convention){
  const m=convention.transpose?[matrix[0],matrix[3],matrix[6],matrix[1],matrix[4],matrix[7],matrix[2],matrix[5],matrix[8]]:matrix;
  if(convention.translation==='after'){
    const p=apply3(m,point);return p.map((v,i)=>v+position[i]);
  }
  const v=point.map((x,i)=>x+position[i]);return apply3(m,v);
}
const conventions=[
  {name:'stored-after-translation',transpose:false,translation:'after'},
  {name:'stored-before-translation',transpose:false,translation:'before'},
  {name:'transposed-after-translation',transpose:true,translation:'after'},
  {name:'transposed-before-translation',transpose:true,translation:'before'}
];
const geometryLinks=meshes.map(mesh=>{
  const transformEvent=mesh.transformNode===null?null:eventFor(mesh.transformNode);
  const meshEvent=eventFor(mesh.meshNode);
  const chosen=transformEvent||meshEvent;
  return{
    mesh:mesh.name,owner:hex(mesh.owner),meshNode:hex(mesh.meshNode),transformNode:mesh.transformNode===null?null:hex(mesh.transformNode),
    vertexBase:hex(mesh.vertexBase),faceStart:hex(mesh.faceStart),vertices:mesh.positions.length,quads:mesh.quads.length,
    meshCallbackEvents:(eventMap.get(String(mesh.meshNode))||[]).length,
    transformCallbackEvents:mesh.transformNode===null?0:(eventMap.get(String(mesh.transformNode))||[]).length,
    selectedEvent:chosen?chosen.entryId:null,selectedEventRecord:chosen?hex(chosen.record):null,
    selectedMatrixId:chosen?(chosen.matrix?.matrixId??chosen.parentMatrix):null,
    selectedPosition:chosen?(chosen.positionAfter||chosen.position):null,
    transformSource:transformEvent?'paired transform-node callback':meshEvent?'mesh-node callback':'no callback match'
  };
});
function buildGlb(file,convention){
  const allPositions=[],allNormals=[],allIndices=[],gltfMeshes=[],nodes=[],materials=[],accessors=[],bufferViews=[],parts=[];
  let offset=0;
  const add=(buf,target)=>{const pad=(4-offset%4)%4;if(pad){parts.push(Buffer.alloc(pad));offset+=pad;}const i=bufferViews.length;bufferViews.push({buffer:0,byteOffset:offset,byteLength:buf.length,target});parts.push(buf);offset+=buf.length;return i;};
  const transformDiagnostics=[];
  for(let mi=0;mi<meshes.length;mi++){
    const mesh=meshes[mi],link=geometryLinks[mi];
    const e=mesh.transformNode===null?eventFor(mesh.meshNode):eventFor(mesh.transformNode);
    const M=matrixForEvent(e),pos=e?(e.positionAfter||e.position):[0,0,0];
    const use=e!==null;
    const transformed=mesh.positions.map(p=>use?applyTransform(p,M,pos,convention):p);
    const indices=mesh.indices;
    const normals=Array.from({length:transformed.length},()=>[0,0,0]);
    for(let i=0;i<indices.length;i+=3){
      const a=transformed[indices[i]],c=transformed[indices[i+1]],d=transformed[indices[i+2]];
      const u=c.map((v,k)=>v-a[k]),v=d.map((v,k)=>v-a[k]);
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      for(const ix of [indices[i],indices[i+1],indices[i+2]])for(let k=0;k<3;k++)normals[ix][k]+=n[k];
    }
    const nrm=normals.map(n=>{const l=Math.hypot(...n);return l>1e-10?n.map(v=>v/l):[0,0,0];});
    const posFlat=Float32Array.from(transformed.flat()),normFlat=Float32Array.from(nrm.flat()),idxFlat=Uint32Array.from(indices);
    const pv=add(Buffer.from(posFlat.buffer),34962),nv=add(Buffer.from(normFlat.buffer),34962),iv=add(Buffer.from(idxFlat.buffer),34963);
    const min=[0,1,2].map(k=>Math.min(...transformed.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...transformed.map(p=>p[k])));
    const pa=accessors.length;accessors.push({bufferView:pv,componentType:5126,count:transformed.length,type:'VEC3',min,max});
    const na=accessors.length;accessors.push({bufferView:nv,componentType:5126,count:nrm.length,type:'VEC3'});
    const ia=accessors.length;accessors.push({bufferView:iv,componentType:5125,count:indices.length,type:'SCALAR',min:[0],max:[Math.max(...indices)]});
    materials.push({name:'Scout material '+(mi+1),pbrMetallicRoughness:{baseColorFactor:[.52+.04*(mi%4),.59+.03*(mi%5),.68+.025*(mi%3),1],metallicFactor:0,roughnessFactor:.82},doubleSided:true});
    gltfMeshes.push({name:mesh.name,primitives:[{attributes:{POSITION:pa,NORMAL:na},indices:ia,material:mi,mode:4}],extras:{
      ownerOffset:hex(mesh.owner),meshNodeOffset:hex(mesh.meshNode),transformNodeOffset:mesh.transformNode===null?null:hex(mesh.transformNode),
      callbackEventId:e?.entryId??null,callbackMatrixId:e?(e.matrix?.matrixId??e.parentMatrix):null,
      callbackPosition:pos,transformApplied:use,coordinateBase:hex(mesh.vertexBase),faceStart:hex(mesh.faceStart),
      sourceVertexIndices:mesh.sourceIndices,sourceQuads:mesh.quads
    }});
    nodes.push({name:mesh.name,mesh:mi});
    transformDiagnostics.push({...link,matrix:M,position:pos,transformApplied:use,bounds:{min,max}});
  }
  const bin=Buffer.concat(parts);
  const gltf={asset:{version:'2.0',generator:'Outwars Scout runtime callback reconstruction'},
    scene:0,scenes:[{name:'Scout runtime callback rebuild candidate',nodes:nodes.map((_,i)=>i),extras:{
      source:path.basename(input),rootNode:hex(rootNode),convention:convention.name,
      initialScale,initialMatrixSource:initialMatrixInfo.status,
      warning:'Transform assignment follows executed callback entries. Compare this candidate visually before declaring final.'
    }}],nodes,meshes:gltfMeshes,materials,accessors,bufferViews,buffers:[{byteLength:bin.length}]};
  let json=Buffer.from(JSON.stringify(gltf));const jPad=(4-json.length%4)%4;if(jPad)json=Buffer.concat([json,Buffer.alloc(jPad,32)]);
  const bPad=(4-bin.length%4)%4,binP=bPad?Buffer.concat([bin,Buffer.alloc(bPad)]):bin;
  const total=12+8+json.length+8+binP.length,headBuf=Buffer.alloc(12);
  headBuf.writeUInt32LE(0x46546c67,0);headBuf.writeUInt32LE(2,4);headBuf.writeUInt32LE(total,8);
  const jh=Buffer.alloc(8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(binP.length,0);bh.writeUInt32LE(0x004e4942,4);
  const output=path.join(outDir,file);fs.writeFileSync(output,Buffer.concat([headBuf,jh,json,bh,binP]));
  return{output,meshCount:meshes.length,totalVertices:meshes.reduce((n,m)=>n+m.positions.length,0),totalTriangles:meshes.reduce((n,m)=>n+m.indices.length/3,0),transformAppliedCount:transformDiagnostics.filter(x=>x.transformApplied).length,diagnostics:transformDiagnostics};
}
const variants=conventions.map(c=>({convention:c,...buildGlb('scout-runtime-'+c.name+'.glb',c)}));

const report={
  title:'OUTWARS SCOUT RUNTIME CALLBACK REBUILD',
  generatedAt:new Date().toISOString(),input,sourceArchive,autoExtractDirectory,
  fileBytes:b.length,relocationBase:hex(base),root:{record:hex(rootRecord),recordClass:rootClass,partClass,callbackStart:hex(rootNode)},
  executable:{path:exePath,initialMatrix:initialMatrixInfo},
  dispatchTable:callbackTargets.map((address,opcode)=>({opcode,handler:hex(address),name:callbackNames[opcode]})),
  callbackRun:{topLevelTableCount:tableCount,topLevelRecordsUsed:seedOffsets.length,parserContextWord:initialScale,initialStateVector:[0,0,0],seedRuns,processed,remaining:work.length,truncated,callbackCounts,uniqueRecordStates:visitedCounts.size,
    totalQueueEdges:edgeRows.length,leafCount:leafRecords.length,unresolvedCount:unresolved.length,
    events:events.map(e=>({...e,record:hex(e.record),source:e.source===null?null:hex(e.source),children:e.children.map(hex)})),
    leaves:leafRecords.map(x=>({...x,record:hex(x.record),parentMatrix:x.parentMatrix,position:x.position})),
    unresolved:unresolved.map(x=>({...x,record:Number.isInteger(x.record)?hex(x.record):x.record,field:Number.isInteger(x.field)?hex(x.field):x.field}))
  },
  geometry:{meshCount:meshes.length,totalVertices:meshes.reduce((n,m)=>n+m.positions.length,0),totalTriangles:meshes.reduce((n,m)=>n+m.indices.length/3,0),links:geometryLinks},
  matrixFrames:[...matrices.entries()].map(([id,matrix])=>({id,matrix,determinant:det3(matrix)})),
  exports:variants,
  conclusion:{
    status:truncated?'CALLBACK_RUN_LIMIT_REACHED': 'CALLBACK_RUN_COMPLETED',
    assembledScoutClaimed:false,
    matchedGeometryTransforms:geometryLinks.filter(x=>x.transformSource!=='no callback match').length,
    geometrySections:meshes.length,
    message:'This run follows the executable callback work-stack and maps legacy geometry sections to callback executions where record offsets match. The exported GLBs are runtime-derived candidates; visual verification is still required. If fewer than nine geometry sections match callbacks, the remaining links need an executable-confirmed registration path rather than a guessed transform.'
  }
};
fs.writeFileSync(path.join(outDir,'runtime-rebuild.json'),JSON.stringify(report,null,2)+'\n');
function csv(v){return'"'+String(v??'').replace(/"/g,'""')+'"';}
const workCsv=[['entryId','runId','seedRecord','record','opcode','classWord','handler','parentMatrix','scale','x','y','z','childCount','children'],...events.map(e=>[e.entryId,e.runId,hex(e.seedRecord),hex(e.record),e.opcode,e.classWord,e.handlerName,e.parentMatrix,e.scale,...e.position,e.childCount,e.children.map(hex).join(' ')])];
fs.writeFileSync(path.join(outDir,'callback-work-stack.csv'),workCsv.map(r=>r.map(csv).join(',')).join('\n')+'\n');
const linkCsv=[['mesh','owner','meshNode','transformNode','meshCallbackEvents','transformCallbackEvents','selectedEvent','selectedEventRecord','selectedMatrixId','selectedPosition','transformSource'],...geometryLinks.map(x=>[x.mesh,x.owner,x.meshNode,x.transformNode,x.meshCallbackEvents,x.transformCallbackEvents,x.selectedEvent,x.selectedEventRecord,x.selectedMatrixId,JSON.stringify(x.selectedPosition),x.transformSource])];
fs.writeFileSync(path.join(outDir,'geometry-callback-links.csv'),linkCsv.map(r=>r.map(csv).join(',')).join('\n')+'\n');
const md=[
  '# Scout runtime callback rebuild','',
  '- Input: '+input,'- DPC bytes: '+b.length,'- Root node: '+hex(rootNode),
  '- Top-level DPC records: '+tableCount,'- Callback invocations seeded: '+seedOffsets.length,'- Work entries processed: '+processed,'- Entries remaining: '+work.length,'- Callback events: '+events.length,
  '- Distinct record/state combinations: '+visitedCounts.size,'- Queue edges: '+edgeRows.length,
  '- Leaf callback entries: '+leafRecords.length,'- Unresolved edges: '+unresolved.length,
  '- Geometry sections: '+meshes.length,'- Callback-linked sections: '+geometryLinks.filter(x=>x.transformSource!=='no callback match').length,
  '',
  '## Callback opcodes executed','',
  '| Opcode | Handler | Calls |','|---:|---|---:|',
  ...Array.from({length:14},(_,i)=>'| '+i+' | '+callbackNames[i]+' ('+hex(callbackTargets[i])+') | '+(callbackCounts[i]||0)+' |'),
  '',
  '## Geometry-to-callback mapping','',
  '| Section | Transform callback | Mesh callback | Applied transform |',
  '|---|---:|---:|---|',
  ...geometryLinks.map(x=>'| '+x.mesh+' | '+x.transformCallbackEvents+' | '+x.meshCallbackEvents+' | '+x.transformSource+' |'),
  '',
  '## Exported runtime candidates','',
  ...variants.map(v=>'- '+v.output+' — '+v.transformAppliedCount+'/'+v.meshCount+' sections received callback transforms'),
  '',
  '## Unresolved pointers','',
  ...unresolved.slice(0,100).map(x=>'- '+JSON.stringify({...x,record:Number.isInteger(x.record)?hex(x.record):x.record,field:Number.isInteger(x.field)?hex(x.field):x.field})),
  '',
  '## Status','',
  'This is a callback-work-stack reconstruction, not a claim of a finished model. It uses the real opcode dispatch table and opcode-4 context-derived addressing. The four GLBs are based on callback executions matched to the known nine geometry sections. The next acceptance test is visual: one of these models must look like a correctly assembled Scout, with all expected parts in plausible positions.'
];
fs.writeFileSync(path.join(outDir,'RUNTIME-REBUILD.md'),md.join('\n')+'\n');
console.log('SCOUT RUNTIME REBUILD COMPLETE');
console.log('Root: '+hex(rootNode)+' | top-level DPC records: '+tableCount+' | callbacks seeded: '+seedOffsets.length);
console.log('Processed: '+processed+' | queued remaining: '+work.length+' | truncated: '+truncated);
console.log('Callbacks: '+events.length+' | unique record/states: '+visitedCounts.size+' | unresolved: '+unresolved.length);
console.log('Geometry sections callback-linked: '+geometryLinks.filter(x=>x.transformSource!=='no callback match').length+'/'+meshes.length);
for(const v of variants)console.log(v.convention.name+': '+v.output+' ('+v.transformAppliedCount+'/'+v.meshCount+' transformed)');
console.log('Report: '+path.join(outDir,'RUNTIME-REBUILD.md'));
console.log('Full JSON: '+path.join(outDir,'runtime-rebuild.json'));
console.log('A finished Scout is NOT claimed until visual validation succeeds.');
