#!/usr/bin/env node
/**
 * Outwars Scout runtime callback rebuild.
 *
 * Reproduces the DPC callback work-stack (24-byte entries) from the executable
 * dispatch table at 0x4DFCAC. This replaces the earlier static guesswork that
 * treated opcode-4 payload DWORDs as inline geometry and misnumbered some
 * callback handlers.
 *
 * The simulator implements the visible record/list layouts for opcodes 1-13,
 * including the separate opcode-3 and opcode-9 child-list layouts. Opcode 4
 * reads its inline relocated child pointers at record+0x14. Opcode 5 builds
 * Q20.12 matrix candidates. Helper routines 0x4e59c8 and 0x4df970, and the
 * shared post-handler normalization tail, are logged but not fully emulated.
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
 *   --max-work 50000
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,'..');
const args=process.argv.slice(2);
let input=null,outArg=null,exePath=null,initialScaleOverride=0,maxWork=50000;
for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='--exe'){if(!args[i+1])throw new Error('--exe requires a path');exePath=path.resolve(args[++i]);}
  else if(a==='--initial-scale'){initialScaleOverride=Number(args[++i]);if(!Number.isFinite(initialScaleOverride))throw new Error('Invalid initial scale');}
  else if(a==='--max-work'){maxWork=Number(args[++i]);if(!Number.isInteger(maxWork)||maxWork<1)throw new Error('--max-work must be positive');}
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
const initialScale=initialScaleOverride;
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
  0x4e0494,0x4e04a2,0x4e023a,0x4e0253,0x4e04a2,0x4e02e7,
  0x4e0399,0x4e023a
];
const callbackNames=[
  'record-helper-op0','pointer-list-op1','descriptor-list-op2','flag-child-list-op3',
  'inline-child-list-op4','matrix-transform-op5','class-reset-op6','class-reset-op7',
  'class-word-op8','pointer-list-op9','class-reset-op10','two-child-op11',
  'scale-child-list-op12','class-word-op13'
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
assert('opcode 10 targets repeated reset handler 0x4e04a2',callbackTargets[10]===0x4e04a2);
assert('opcode 11 targets two-child handler 0x4e02e7',callbackTargets[11]===0x4e02e7);
assert('opcode 12 targets scale-list handler 0x4e0399',callbackTargets[12]===0x4e0399);
assert('opcode 13 targets class-word handler 0x4e023a',callbackTargets[13]===0x4e023a);
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
  // 4c5500 reads the parent 3x3 as nine contiguous DWORDs at frame +0..+0x20.
  // The 12-DWORD initial block is copied byte-for-byte into the first 0x30
  // matrix-stack slot by 4dfce4, so the active 3x3 is words[0..8], not a
  // guessed 3x4 row-padded layout.
  const matrix=words.slice(0,9).map(v=>v/4096);
  if(matrix.some(x=>!Number.isFinite(x)||Math.abs(x)>4))return{status:'identity-fallback',matrix:identity(),detail:'First nine static DWORDs did not resemble a Q20.12 3x3 basis',words};
  return{status:'read-from-executable-DGROUP',matrix,words,unusedTail:words.slice(9),rawOffset:raw};
}
function inRangeExe(e,o,n){return o>=0&&o+n<=e.length;}
const initialMatrixInfo=readExeInitialMatrix(exePath);

// Run the executable bridge in the same invocation. Besides disassembling the
// callback handlers it now captures the DPC loader context helper and both
// Scout loader call sites, which are needed to resolve the initial EDX scale.
let executableBridge={status:'not-requested'};
if(exePath){
  const bridge=path.join(here,'scout-exe-transform-bridge.sh');
  if(!fs.existsSync(exePath))executableBridge={status:'failed',reason:'Executable not found: '+exePath};
  else if(!fs.existsSync(bridge))executableBridge={status:'skipped',reason:'scout-exe-transform-bridge.sh not found'};
  else{
    const bridgeOut=path.join(outDir,'executable-analysis');
    fs.mkdirSync(bridgeOut,{recursive:true});
    const r=spawnSync('bash',[bridge,exePath,bridgeOut],{
      cwd:repoRoot,encoding:'utf8',maxBuffer:128*1024*1024
    });
    executableBridge={
      status:r.status===0?'completed':'failed',
      outputDirectory:bridgeOut,
      reportPath:path.join(bridgeOut,'REPORT.txt'),
      exitCode:r.status,
      stdout:r.stdout||'',
      stderr:r.stderr||''
    };
  }
}

// Callback work-stack entry format is the six DWORDs written by 0x4dfce4:
// record, parent/matrix index, state X, state Y, state Z, scale/context.
const work=[],events=[],matrices=new Map([[0,initialMatrixInfo.matrix]]),matrixPositions=new Map([[0,[0,0,0]]]);
const unresolved=[],leafRecords=[],edgeRows=[],callbackCounts={},seedRuns=[],helperCalls=[],descriptorLeaves=[];
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
// Reproduce both entry routes found for this resource: the DPC top-level
// pointer table and the playable-armour/transform-root hierarchy. The first
// run showed that the top-level table alone is not the Scout transform graph.
const tableCount=u32(32)??0,topLevelRecords=[];
if(tableCount>0&&tableCount<=8192&&inRange(36,tableCount*4)){
  for(let i=0;i<tableCount;i++){
    const target=ptr(36+i*4);
    // Preserve table order and duplicate pointers: the native parser calls
    // the callback once per table slot, not once per unique target.
    if(target!==null&&header(target))topLevelRecords.push(target);
  }
}
// Discover opcode-5 transform records by their executable-observed layout:
 // opcode 5, flags 0x0B, near-orthonormal Q20.12 matrix, bounded child count,
 // and relocated child pointers that land on plausible callback headers.
 // Then seed only the roots of the opcode-5-to-opcode-5 forest. The previous
 // run seeded only the one DPC pointer-table item (0x9368), which was a
 // separate two-callback branch and never entered the Scout transform graph.
function isTransformRecord(o){
  if(!inRange(o,0x3c)||u8(o)!==5||u8(o+1)!==0x0b)return false;
  const cls=u16(o+2),count=u8(o+0x36);
  if(count>32||!inRange(o+0x38,count*4))return false;
  if(cls!==0&&cls!==100)return false;
  const m=Array.from({length:9},(_,i)=>s32(o+4+i*4)/4096);
  if(m.some(v=>!Number.isFinite(v)||Math.abs(v)>1.5))return false;
  const rowErr=Math.max(
    Math.abs(m[0]*m[0]+m[1]*m[1]+m[2]*m[2]-1),
    Math.abs(m[3]*m[3]+m[4]*m[4]+m[5]*m[5]-1),
    Math.abs(m[6]*m[6]+m[7]*m[7]+m[8]*m[8]-1),
    Math.abs(m[0]*m[3]+m[1]*m[4]+m[2]*m[5]),
    Math.abs(m[0]*m[6]+m[1]*m[7]+m[2]*m[8]),
    Math.abs(m[3]*m[6]+m[4]*m[7]+m[5]*m[8])
  );
  if(rowErr>0.05||Math.abs(det3(m))<0.8)return false;
  for(let i=0;i<count;i++){
    const target=ptr(o+0x38+i*4);
    if(target===null||!header(target)||u8(target)>13)return false;
  }
  return true;
}
const transformRecords=[];
for(let o=0;o+0x3c<=b.length;o++)if(isTransformRecord(o))transformRecords.push(o);
const transformRecordSet=new Set(transformRecords),transformHasParent=new Set(),transformEdges=[];
for(const o of transformRecords){
  const count=u8(o+0x36);
  for(let i=0;i<count;i++){
    const field=o+0x38+i*4,target=ptr(field);
    if(target!==null&&transformRecordSet.has(target)){
      transformHasParent.add(target);
      transformEdges.push({parent:o,child:target,pointerField:field});
    }
  }
}
const transformRoots=transformRecords.filter(o=>!transformHasParent.has(o));
const seedOffsets=[];
for(const seed of [...topLevelRecords,rootNode,...transformRoots]){
  if(Number.isInteger(seed)&&!seedOffsets.includes(seed))seedOffsets.push(seed);
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
    // 0x4e59c8 consumes the descriptor at this work-stack entry. It reads
    // descriptor+0x10 as a count and descriptor+0x0c as the opcode-4 payload
    // chain, stepping by (payload byte +2)*4 and modifying the eight packed
    // property lanes at each payload item. Record the true descriptor links
    // here; keep the mutation out of the placement calculation.
    const coordinateRaw=u32(record+4),sharedRaw=u32(record+8),payloadRaw=u32(record+12),payloadCount=u32(record+0x10);
    const coordinateTarget=relocatedTarget(coordinateRaw);
    const sharedTarget=relocatedTarget(sharedRaw);
    const payloadTarget=relocatedTarget(payloadRaw);
    const payloadHeader=payloadTarget===null?null:header(payloadTarget);
    event.descriptorData={
      descriptor:hex(record),coordinateRaw:hex(coordinateRaw),coordinateTarget:coordinateTarget===null?null:hex(coordinateTarget),
      sharedRaw:hex(sharedRaw),sharedTarget:sharedTarget===null?null:hex(sharedTarget),
      payloadRaw:hex(payloadRaw),payloadTarget:payloadTarget===null?null:hex(payloadTarget),
      payloadHeader,payloadCount,helper:'0x4e59c8',helperEmulation:'descriptor/payload references decoded; packed payload mutation not yet reproduced'
    };
    descriptorLeaves.push(event.descriptorData);
    event.helperCall={address:'0x4e59c8',emulated:false,reason:'payload mutation logged, not applied to DPC bytes'};
    helperCalls.push({record:hex(record),opcode,handler:'0x4dfde1',helper:'0x4e59c8',payloadTarget:payloadTarget===null?null:hex(payloadTarget),payloadCount,reason:'packed payload mutation logged but not applied'});
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
    if(u8(record+0x12)===1){
      event.helperCall={address:'0x4df970',emulated:false};
      helperCalls.push({record:hex(record),opcode,handler:'0x4dff99',helper:'0x4df970',reason:'conditional helper body not yet translated'});
    }
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
    // Literal execution at 0x4e00be..0x4e00f1: ECX is reset to the record
    // pointer, incremented by four per child, and the callback reads
    // [ECX+0x14]. Therefore the child pointer array is record+0x14,
    // not an address derived from the accumulated position.
    const firstField=record+0x14;
    event.childList={count:n,firstField:hex(firstField),layout:'inline relocated DWORD pointers at record+0x14, stride 4'};
    if(n&&inRange(firstField,n*4)){
      for(let i=0;i<n;i++){
        const child=childFromRelocatedField(firstField+i*4,record);
        if(child!==null){enqueue(child,entry.parentMatrix,nextState,entry.scale,record,i);event.children.push(child);}
      }
    }else if(n)unresolved.push({record,opcode,reason:'opcode-4 inline child-pointer array exceeds DPC bounds',count:n,firstField:hex(firstField)});
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
    matrixPositions.set(matrixId,transformed);
    event.matrix={localQ20_12:local,parentMatrixId:entry.parentMatrix,worldMatrixCandidate:world,determinant:det3(world),matrixId};
    // The executable stores the translated vector at [esp+0x68..0x70] and
    // passes that vector to each child work entry. 4C6610 also computes a
    // local-matrix product into a separate temporary [esp+0x78..0x80]; retain
    // that product as evidence, but do not substitute it for the child state.
    event.positionAfter=translated;
    event.matrix.transformedTranslationCandidate=transformed;
    const n=u8(record+0x36)??0;
    event.list={count:n,base:record+0x38,layout:'relocated DWORD child pointers at +0x38'};
    for(let i=0;i<n;i++){
      const child=childFromRelocatedField(record+0x38+i*4,record);
      if(child!==null){enqueue(child,matrixId,translated,entry.scale,record,i);event.children.push(child);}
    }
    childCount=event.children.length;
  }else if(opcode===6||opcode===7||opcode===10){
    // Table entries 6, 7 and 10 point to reset handlers (10 repeats 0x4e04a2).
    // Both explicitly clear the working class state and push no children.
    event.classStateAfter=0;
    event.opaqueHandler=false;
  }else if(opcode===8||opcode===13){
    // Both table entries use 0x4e023a: preserve WORD +2 as class state.
    event.classStateAfter=classWord;
    event.opaqueHandler=false;
  }else if(opcode===9){
    const n=u8(record+0x06)??0;
    event.list={count:n,base:record+0x10,layout:'relocated DWORD pointers at +0x10'};
    event.children=pushListChildren(record,record+0x10,n,entry,opcode);
    childCount=event.children.length;
  }else if(opcode===11){
    // Executable table index 11 -> 0x4e02e7: emits record+8 and record+0x0c.
    const children=[];
    for(const rel of [8,12]){
      const child=childFromRelocatedField(record+rel,record);
      if(child!==null){enqueue(child,entry.parentMatrix,state,entry.scale,record,rel);children.push(child);}
    }
    event.list={count:2,base:record+8,layout:'two relocated pointers at +8 and +0x0c'};
    event.children=children;childCount=children.length;
  }else if(opcode===12){
    // Executable table index 12 -> 0x4e0399: WORD +4 selects scale level;
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
    // Unmapped callback opcode: retain it as an opaque event rather than
    // guessing a child layout.
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
function readMesh(name,owner,meshNode,transformNode,vertexBase,faceStart,faceCount,anchor=[0,0,0],meshVertexReference=null,referencePoint=null,targetPoint=null,pairedPosition=null){
  const quads=readQuads(faceStart,faceCount,name),srcIds=[...new Set(quads.flat())].sort((a,c)=>a-c);
  const positions=srcIds.map(i=>{
    const p=vertexBase+i*8;if(!inRange(p,6))throw new Error(name+': vertex '+i+' out of range');
    return[s16(p),s16(p+2),s16(p+4)];
  });
  const indexMap=new Map(srcIds.map((v,i)=>[v,i]));
  const indices=[];
  for(const q of quads)indices.push(indexMap.get(q[0]),indexMap.get(q[1]),indexMap.get(q[2]),indexMap.get(q[0]),indexMap.get(q[2]),indexMap.get(q[3]));
  return{name,owner,meshNode,transformNode,vertexBase,faceStart,quads,sourceIndices:srcIds,positions,indices,anchor,meshVertexReference,referencePoint,targetPoint,pairedPosition};
}
const meshes=[];
const rootVertex=ptr(rootNode+28),rootFaces=ptr(rootNode+36);
if(rootVertex===null||rootFaces===null)throw new Error('Root mesh geometry pointers failed relocation');
meshes.push(readMesh('root_mesh',rootNode,rootNode,null,rootVertex,rootFaces,22,[0,0,0]));
for(let i=0;i<owners.length;i++){
  const owner=owners[i],meshNode=ptr(owner+24),transformNode=ptr(owner+28);
  if(meshNode===null||transformNode===null)throw new Error('Part '+(i+1)+' mesh/transform pointer invalid');
  const type16=ptr(meshNode+20);
  if(type16===null)throw new Error('Part '+(i+1)+' mesh type-16 wrapper pointer invalid');
  const descriptor=ptr(type16+8);
  if(descriptor===null)throw new Error('Part '+(i+1)+' mesh descriptor pointer invalid');
  const vertex=ptr(descriptor+4),faces=ptr(meshNode+36);
  if(vertex===null||faces===null)throw new Error('Part '+(i+1)+' geometry pointers failed relocation');
  const ownerPosition=[s32(owner+8),s32(owner+12),s32(owner+16)];
  const pairedPosition=[s32(transformNode+32),s32(transformNode+36),s32(transformNode+40)];
  if(ownerPosition.some((v,k)=>v!==pairedPosition[k]))throw new Error('Part '+(i+1)+' owner/paired translation invariant failed');
  const meshVertexReference=ptr(meshNode+28);
  const referencePoint=meshVertexReference!==null&&inRange(meshVertexReference,6)
    ?[s16(meshVertexReference),s16(meshVertexReference+2),s16(meshVertexReference+4)]:null;
  const targetPoint=[s32(meshNode+56),s32(meshNode+60),s32(meshNode+64)];
  meshes.push(readMesh('submesh_'+(i+1),owner,meshNode,transformNode,vertex,faces,26,ownerPosition,meshVertexReference,referencePoint,targetPoint,pairedPosition));
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
const conventions=[];
for(const transposeMatrix of [false,true]){
  for(const translation of ['after','before']){
    for(const positionSource of ['accumulated','matrix-output','owner-anchor','accumulated-plus-owner','matrix-output-plus-owner']){
      conventions.push({
        name:(transposeMatrix?'transposed':'stored')+'-'+translation+'-'+positionSource,
        transpose:transposeMatrix,translation,positionSource
      });
    }
  }
}
const geometryLinks=meshes.map(mesh=>{
  const transformEvent=mesh.transformNode===null?null:eventFor(mesh.transformNode);
  const meshEvent=eventFor(mesh.meshNode);
  const chosen=transformEvent||meshEvent;
  return{
    mesh:mesh.name,owner:hex(mesh.owner),meshNode:hex(mesh.meshNode),transformNode:mesh.transformNode===null?null:hex(mesh.transformNode),
    vertexBase:hex(mesh.vertexBase),faceStart:hex(mesh.faceStart),vertices:mesh.positions.length,quads:mesh.quads.length,
    meshCallbackEvents:(eventMap.get(String(mesh.meshNode))||[]).length,
    transformNodeCallbackEvents:mesh.transformNode===null?0:(eventMap.get(String(mesh.transformNode))||[]).length,
    matrixTransformEvents:mesh.transformNode===null?0:(eventMap.get(String(mesh.transformNode))||[]).filter(x=>Boolean(x.matrix)||x.parentMatrix!==0).length,
    selectedEvent:chosen?chosen.entryId:null,selectedEventRecord:chosen?hex(chosen.record):null,
    selectedMatrixId:chosen?(chosen.matrix?.matrixId??chosen.parentMatrix):null,
    selectedPosition:chosen?(chosen.positionAfter||chosen.position):null,
    matrixOutputPosition:chosen?matrixPositions.get(chosen.matrix?.matrixId??chosen.parentMatrix)??null:null,
    ownerAnchor:mesh.anchor,
    pairedPosition:mesh.pairedPosition??null,
    meshVertexReference:mesh.meshVertexReference===null?null:hex(mesh.meshVertexReference),
    referencePoint:mesh.referencePoint,
    targetPoint:mesh.targetPoint,
    descriptorCoordinateMatches:mesh.meshVertexReference===null?[]:descriptorLeaves.filter(d=>d.coordinateTarget===hex(mesh.meshVertexReference)).map(d=>d.descriptor),
    descriptorPayloadMatches:descriptorLeaves.filter(d=>d.payloadTarget===hex(mesh.faceStart)).map(d=>d.descriptor),
    transformSource:transformEvent?(transformEvent.matrix||transformEvent.parentMatrix!==0?'paired matrix-bearing transform callback':'paired descriptor callback; no matrix frame applied'):meshEvent?(meshEvent.matrix||meshEvent.parentMatrix!==0?'mesh-node callback under matrix frame':'mesh-node callback; no matrix frame applied'):'no callback match'
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
    const M=matrixForEvent(e);
    const accumulated=e?(e.positionAfter||e.position):[0,0,0];
    const matrixOutput=e?(matrixPositions.get(e.matrix?.matrixId??e.parentMatrix)||accumulated):accumulated;
    const ownerAnchor=mesh.anchor||[0,0,0];
    let pos;
    if(convention.positionSource==='matrix-output')pos=matrixOutput;
    else if(convention.positionSource==='owner-anchor')pos=ownerAnchor;
    else if(convention.positionSource==='accumulated-plus-owner')pos=accumulated.map((v,i)=>v+ownerAnchor[i]);
    else if(convention.positionSource==='matrix-output-plus-owner')pos=matrixOutput.map((v,i)=>v+ownerAnchor[i]);
    else pos=accumulated;
    // Descriptor/list events are not transforms. Count only an opcode-5 matrix
    // event or a callback inheriting a non-root matrix frame.
    const callbackTransformApplied=Boolean(e&&(e.matrix||e.parentMatrix!==0));
    const placementApplied=callbackTransformApplied||pos.some(v=>v!==0);
    const transformed=mesh.positions.map(p=>placementApplied?applyTransform(p,M,pos,convention):p);
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
      callbackPosition:pos,accumulatedPosition:accumulated,matrixOutputPosition:matrixOutput,positionSource:convention.positionSource,ownerAnchor,placementApplied,callbackTransformApplied,coordinateBase:hex(mesh.vertexBase),faceStart:hex(mesh.faceStart),
      sourceVertexIndices:mesh.sourceIndices,sourceQuads:mesh.quads
    }});
    nodes.push({name:mesh.name,mesh:mi});
    transformDiagnostics.push({...link,matrix:M,position:pos,accumulatedPosition:accumulated,matrixOutputPosition:matrixOutput,positionSource:convention.positionSource,ownerAnchor,placementApplied,callbackTransformApplied,bounds:{min,max}});
  }
  const bin=Buffer.concat(parts);
  const gltf={asset:{version:'2.0',generator:'Outwars Scout runtime callback reconstruction'},
    scene:0,scenes:[{name:'Scout runtime callback rebuild candidate',nodes:nodes.map((_,i)=>i),extras:{
      source:path.basename(input),rootNode:hex(rootNode),convention:convention.name,
      initialScale,initialScaleSource:initialScaleOverride===0?'default 0 (runtime caller parameter not decoded)':'CLI override',initialMatrixSource:initialMatrixInfo.status,
      warning:'Transform assignment follows executed callback entries. Compare this candidate visually before declaring final.'
    }}],nodes,meshes:gltfMeshes,materials,accessors,bufferViews,buffers:[{byteLength:bin.length}]};
  let json=Buffer.from(JSON.stringify(gltf));const jPad=(4-json.length%4)%4;if(jPad)json=Buffer.concat([json,Buffer.alloc(jPad,32)]);
  const bPad=(4-bin.length%4)%4,binP=bPad?Buffer.concat([bin,Buffer.alloc(bPad)]):bin;
  const total=12+8+json.length+8+binP.length,headBuf=Buffer.alloc(12);
  headBuf.writeUInt32LE(0x46546c67,0);headBuf.writeUInt32LE(2,4);headBuf.writeUInt32LE(total,8);
  const jh=Buffer.alloc(8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(binP.length,0);bh.writeUInt32LE(0x004e4942,4);
  const output=path.join(outDir,file);fs.writeFileSync(output,Buffer.concat([headBuf,jh,json,bh,binP]));
  return{output,meshCount:meshes.length,totalVertices:meshes.reduce((n,m)=>n+m.positions.length,0),totalTriangles:meshes.reduce((n,m)=>n+m.indices.length/3,0),placementAppliedCount:transformDiagnostics.filter(x=>x.placementApplied).length,callbackTransformAppliedCount:transformDiagnostics.filter(x=>x.callbackTransformApplied).length,diagnostics:transformDiagnostics};
}
const variants=conventions.map(c=>({convention:c,...buildGlb('scout-runtime-'+c.name+'.glb',c)}));

const report={
  title:'OUTWARS SCOUT RUNTIME CALLBACK REBUILD',
  generatedAt:new Date().toISOString(),input,sourceArchive,autoExtractDirectory,
  fileBytes:b.length,relocationBase:hex(base),root:{record:hex(rootRecord),recordClass:rootClass,partClass,callbackStart:hex(rootNode)},
  executable:{path:exePath,initialMatrix:initialMatrixInfo,initialScale:{value:initialScale,source:initialScaleOverride===0?'default 0; loader caller context remains a runtime parameter, override with --initial-scale':'command-line override'}},
  dispatchTable:callbackTargets.map((address,opcode)=>({opcode,handler:hex(address),name:callbackNames[opcode]})),
  descriptorLeaves,
  helperCalls,
  simulationLimitations:[
    'Opcode-0 handler calls 0x4e59c8; this helper is logged but not emulated.',
    'Opcode-3 conditionally calls 0x4df970 when record byte +0x12 is 1; this helper is logged but not emulated.',
    'The shared dispatcher tail at 0x4dfdf9 performs scale/state normalization after callbacks; this routine is not fully emulated.',
    'The caller-supplied initial scale/context defaults to zero unless --initial-scale overrides it; the loader helper dump is included in executable-analysis for resolving it.'
  ],
  callbackRun:{topLevelTableCount:tableCount,topLevelRecordsUsed:topLevelRecords.length,playableArmourRootSeed:hex(rootNode),discoveredTransformRecordCount:transformRecords.length,discoveredTransformRoots:transformRoots.map(hex),discoveredTransformEdges:transformEdges.map(e=>({parent:hex(e.parent),child:hex(e.child),pointerField:hex(e.pointerField)})),seedOffsets:seedOffsets.map(hex),parserContextWord:initialScale,initialStateVector:[0,0,0],seedRuns,processed,remaining:work.length,truncated,callbackCounts,uniqueRecordStates:visitedCounts.size,
    totalQueueEdges:edgeRows.length,leafCount:leafRecords.length,unresolvedCount:unresolved.length,
    events:events.map(e=>({...e,record:hex(e.record),source:e.source===null?null:hex(e.source),children:e.children.map(hex)})),
    leaves:leafRecords.map(x=>({...x,record:hex(x.record),parentMatrix:x.parentMatrix,position:x.position})),
    unresolved:unresolved.map(x=>({...x,record:Number.isInteger(x.record)?hex(x.record):x.record,field:Number.isInteger(x.field)?hex(x.field):x.field}))
  },
  geometry:{meshCount:meshes.length,totalVertices:meshes.reduce((n,m)=>n+m.positions.length,0),totalTriangles:meshes.reduce((n,m)=>n+m.indices.length/3,0),links:geometryLinks},
  matrixFrames:[...matrices.entries()].map(([id,matrix])=>({id,matrix,positionCandidate:matrixPositions.get(id),determinant:det3(matrix)})),
  exports:variants,
  conclusion:{
    status:truncated?'CALLBACK_RUN_LIMIT_REACHED': 'CALLBACK_RUN_COMPLETED',
    assembledScoutClaimed:false,
    matchedGeometryCallbackNodes:geometryLinks.filter(x=>x.transformSource!=='no callback match').length,
    geometrySections:meshes.length,
    matrixBearingGeometryCallbacks:geometryLinks.filter(x=>x.matrixTransformEvents>0).length,
    message:'The callback graph and descriptor payload links are recovered, but the nine geometry callback records are descriptor/list callbacks under matrix ID 0. The opcode-5 transform hierarchy is a separate sibling branch and has not yet been associated with the geometry sections. The exported GLBs are placement experiments, not an assembled Scout.'
  }
};
fs.writeFileSync(path.join(outDir,'runtime-rebuild.json'),JSON.stringify(report,null,2)+'\n');
function csv(v){return'"'+String(v??'').replace(/"/g,'""')+'"';}
const workCsv=[['entryId','runId','seedRecord','record','opcode','classWord','handler','parentMatrix','scale','x','y','z','childCount','children'],...events.map(e=>[e.entryId,e.runId,hex(e.seedRecord),hex(e.record),e.opcode,e.classWord,e.handlerName,e.parentMatrix,e.scale,...e.position,e.childCount,e.children.map(hex).join(' ')])];
fs.writeFileSync(path.join(outDir,'callback-work-stack.csv'),workCsv.map(r=>r.map(csv).join(',')).join('\n')+'\n');
const descriptorCsv=[['descriptor','coordinateTarget','sharedTarget','payloadTarget','payloadCount','helper'],...descriptorLeaves.map(x=>[x.descriptor,x.coordinateTarget,x.sharedTarget,x.payloadTarget,x.payloadCount,x.helper])];
fs.writeFileSync(path.join(outDir,'descriptor-payload-links.csv'),descriptorCsv.map(r=>r.map(csv).join(',')).join('\n')+'\n');
const linkCsv=[['mesh','owner','meshNode','transformNode','meshVertexReference','referencePoint','targetPoint','descriptorCoordinateMatches','descriptorPayloadMatches','meshCallbackEvents','transformNodeCallbackEvents','matrixTransformEvents','selectedEvent','selectedEventRecord','selectedMatrixId','selectedPosition','transformSource'],...geometryLinks.map(x=>[x.mesh,x.owner,x.meshNode,x.transformNode,x.meshVertexReference,JSON.stringify(x.referencePoint),JSON.stringify(x.targetPoint),x.descriptorCoordinateMatches.join(';'),x.descriptorPayloadMatches.join(';'),x.meshCallbackEvents,x.transformNodeCallbackEvents,x.matrixTransformEvents,x.selectedEvent,x.selectedEventRecord,x.selectedMatrixId,JSON.stringify(x.selectedPosition),x.transformSource])];
fs.writeFileSync(path.join(outDir,'geometry-callback-links.csv'),linkCsv.map(r=>r.map(csv).join(',')).join('\n')+'\n');
const md=[
  '# Scout runtime callback rebuild','',
  '- Input: '+input,'- DPC bytes: '+b.length,'- Root node: '+hex(rootNode),
  '- Top-level DPC records: '+tableCount,'- Validated opcode-5 transform records: '+transformRecords.length,'- Opcode-5 transform roots: '+transformRoots.map(hex).join(', '),'- Callback seed records: '+seedOffsets.map(hex).join(', '),'- Work entries processed: '+processed,'- Entries remaining: '+work.length,'- Callback events: '+events.length,
  '- Distinct record/state combinations: '+visitedCounts.size,'- Queue edges: '+edgeRows.length,
  '- Leaf callback entries: '+leafRecords.length,'- Descriptor leaves decoded: '+descriptorLeaves.length,'- Unique descriptor payload targets: '+new Set(descriptorLeaves.map(x=>x.payloadTarget).filter(Boolean)).size,'- Unresolved edges: '+unresolved.length,'- Helper calls logged: '+helperCalls.length,
  '- Geometry sections: '+meshes.length,'- Geometry sections with callback-node matches: '+geometryLinks.filter(x=>x.transformSource!=='no callback match').length,'- Sections with matrix-bearing transform callbacks: '+geometryLinks.filter(x=>x.matrixTransformEvents>0).length,
  '- Owner/paired translation invariants: '+meshes.filter(m=>m.transformNode!==null).length+'/'+(meshes.length-1)+' matched',
  '- Executable disassembly bridge: '+executableBridge.status,
  '',
  '## Executable disassembly bridge','',JSON.stringify(executableBridge,null,2),'',
  '## Callback opcodes executed','',
  '| Opcode | Handler | Calls |','|---:|---|---:|',
  ...Array.from({length:14},(_,i)=>'| '+i+' | '+callbackNames[i]+' ('+hex(callbackTargets[i])+') | '+(callbackCounts[i]||0)+' |'),
  '',
  '## Geometry-to-callback mapping','',
  '| Section | Paired node callbacks | Matrix-bearing callbacks | Descriptor coordinate matches |',
  '|---|---:|---:|---|',
  ...geometryLinks.map(x=>'| '+x.mesh+' | '+x.transformNodeCallbackEvents+' | '+x.matrixTransformEvents+' | '+(x.descriptorPayloadMatches.join(', ')||'none')+' |'),
  '',
  '## Exported runtime candidates','',
  'The run compares 20 placement experiments. Descriptor-list callbacks are not treated as transform matrices: only opcode-5 matrix events or callbacks inheriting a non-root matrix frame count as callback transforms. Owner-anchor and additive placements remain experiments, not proven runtime transforms. Owner anchors are independently cross-checked against their paired transform-node vectors.','',
  ...variants.map(v=>'- '+v.output+' — '+v.callbackTransformAppliedCount+'/'+v.meshCount+' sections have matrix-bearing callback transforms; '+v.placementAppliedCount+'/'+v.meshCount+' sections have candidate placement applied'),
  '',
  '## Descriptor-to-payload links','',
  '| Descriptor | Coordinate target | Payload target | Count |','|---:|---:|---:|---:|',
  ...descriptorLeaves.map(x=>'| '+x.descriptor+' | '+(x.coordinateTarget??'—')+' | '+(x.payloadTarget??'—')+' | '+(x.payloadCount??'—')+' |'),
  '',
  'The opcode-0 resolver at 0x4E59C8 reads descriptor+0x0C/+0x10 and updates packed fields within the payload chain. This runner records the descriptor links and counts but does not yet apply that payload mutation.','',
  '## Unemulated helper calls','',
  ...helperCalls.slice(0,100).map(x=>'- '+JSON.stringify(x)),
  '',
  '## Unresolved pointers','',
  ...unresolved.slice(0,100).map(x=>'- '+JSON.stringify({...x,record:Number.isInteger(x.record)?hex(x.record):x.record,field:Number.isInteger(x.field)?hex(x.field):x.field})),
  '',
  '## Status','',
  'This is a static callback-work-stack reconstruction candidate, not a bit-exact execution of the executable. All nine geometry sections now have descriptor-payload links and callback-node matches, but those geometry callbacks carry matrix ID 0; the opcode-5 transform hierarchy is a separate sibling branch and has not yet been associated with the geometry. Opcode 4 uses its inline record+0x14 child list, and opcode 9 uses its separate +0x10 list. The two helper routines and shared post-handler normalization tail remain unimplemented. The 20 GLBs are placement experiments, not a completed Scout. A final Scout is only accepted after transform-to-geometry association and visual validation.'
];
fs.writeFileSync(path.join(outDir,'RUNTIME-REBUILD.md'),md.join('\n')+'\n');
console.log('SCOUT RUNTIME REBUILD RUN COMPLETE — CANDIDATES EXPORTED');
console.log('Playable-armour root: '+hex(rootNode)+' | top-level DPC records: '+tableCount);
console.log('Validated opcode-5 transforms: '+transformRecords.length+' | transform roots: '+transformRoots.map(hex).join(', '));
console.log('Callback seeds: '+seedOffsets.map(hex).join(', '));
console.log('Executable disassembly bridge: '+executableBridge.status+(executableBridge.reportPath?' | '+executableBridge.reportPath:''));
console.log('Processed: '+processed+' | queued remaining: '+work.length+' | truncated: '+truncated);
console.log('Callbacks: '+events.length+' | unique record/states: '+visitedCounts.size+' | descriptors: '+descriptorLeaves.length+' | unresolved: '+unresolved.length);
console.log('Geometry sections callback-linked: '+geometryLinks.filter(x=>x.transformSource!=='no callback match').length+'/'+meshes.length);
console.log('Owner/paired translation vectors verified: '+meshes.filter(m=>m.transformNode!==null).length+'/'+(meshes.length-1));
console.log('Assembly variants: '+conventions.length+' (matrix orientation × translation placement × position source)');
for(const v of variants)console.log(v.convention.name+': '+v.output+' ('+v.callbackTransformAppliedCount+' callback transforms; '+v.placementAppliedCount+' candidate placements)');
console.log('Report: '+path.join(outDir,'RUNTIME-REBUILD.md'));
console.log('Descriptor links: '+path.join(outDir,'descriptor-payload-links.csv'));
console.log('Full JSON: '+path.join(outDir,'runtime-rebuild.json'));
console.log('A finished Scout is NOT claimed until visual validation succeeds and the callback-to-geometry links are established.');
