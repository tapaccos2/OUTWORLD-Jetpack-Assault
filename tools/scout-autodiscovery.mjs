#!/usr/bin/env node
/**
 * Outwars Scout autonomous DPC discovery runner.
 * Tests pointer encodings, callback traversal, transform conventions, coordinate
 * layouts and index streams in one invocation. Candidate scores are evidence
 * rankings, not claims that a format interpretation is proven.
 *
 * Usage:
 *   node tools/scout-autodiscovery.mjs path/to/scout_mj.dpc [output-dir] [--exe path/to/outwars.exe]
 *   Optional: --max-targets 700   --no-baseline
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const argv=process.argv.slice(2);
let input=null,outArg=null,exePath=null,maxTargets=700,noBaseline=false;
for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--exe'){if(!argv[i+1])throw new Error('--exe requires a path');exePath=path.resolve(argv[++i]);}
  else if(a==='--max-targets'){maxTargets=Number(argv[++i]);if(!Number.isInteger(maxTargets)||maxTargets<1)throw new Error('--max-targets must be positive');}
  else if(a==='--no-baseline')noBaseline=true;
  else if(a.startsWith('--'))throw new Error('Unknown option: '+a);
  else if(input===null)input=a;else if(outArg===null)outArg=a;else throw new Error('Unexpected argument: '+a);
}
if(!input){console.error('Usage: node tools/scout-autodiscovery.mjs <scout.dpc> [output-dir] [--exe outwars.exe]');process.exit(2);}
input=path.resolve(input);
if(!fs.existsSync(input))throw new Error('DPC file not found: '+input);
const outDir=path.resolve(outArg||'scout-autodiscovery');
fs.mkdirSync(outDir,{recursive:true});
const b=fs.readFileSync(input);
if(b.length<40||b.toString('ascii',0,4)!=='DCPM'||b[4]!==0x43)throw new Error('Expected DCPMC resource');
const base=b.readUInt32LE(12);
const U16=o=>o>=0&&o+2<=b.length?b.readUInt16LE(o):null;
const S16=o=>o>=0&&o+2<=b.length?b.readInt16LE(o):null;
const U32=o=>o>=0&&o+4<=b.length?b.readUInt32LE(o):null;
const S32=o=>o>=0&&o+4<=b.length?b.readInt32LE(o):null;
const hex=n=>n===null||n===undefined?null:'0x'+Number(n).toString(16);
const inside=o=>Number.isInteger(o)&&o>=0&&o+4<=b.length;
const head=o=>inside(o)?{offset:o,opcode:b[o],flags:b[o+1],classWord:U16(o+2)}:null;

function resolve(field,mode){
  const raw=U32(field);if(raw===null)return null;
  let target;
  if(mode==='relocated-base')target=raw-base;
  else if(mode==='absolute-file-offset')target=raw;
  else if(mode==='signed-relative-to-field')target=field+S32(field);
  else if(mode==='signed-relative-to-next-dword')target=field+4+S32(field);
  else return null;
  return inside(target)?target:null;
}
const pointerModes=['relocated-base','absolute-file-offset','signed-relative-to-field','signed-relative-to-next-dword'];
function det3(m){return m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);}
function transpose3(m){return[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];}
function matMul3(a,c){const o=new Array(9).fill(0);for(let r=0;r<3;r++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)o[r*3+j]+=a[r*3+k]*c[k*3+j];return o;}
function apply3(m,v){return[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];}
function matrixQuality(m){
  const groups=[[m.slice(0,3),m.slice(3,6),m.slice(6,9)],[[m[0],m[3],m[6]],[m[1],m[4],m[7]],[m[2],m[5],m[8]]]];
  const errors=groups.map(g=>{let e=0;for(let i=0;i<3;i++)for(let j=0;j<3;j++){const d=g[i].reduce((s,v,k)=>s+v*g[j][k],0);e+=Math.abs(d-(i===j?1:0));}return e;});
  const det=det3(m),de=Math.min(Math.abs(det-1),Math.abs(det+1)),oe=Math.min(...errors);
  return{determinant:det,determinantError:de,rowOrthogonalityError:errors[0],columnOrthogonalityError:errors[1],orthogonalityError:oe,score:100/(1+de*4+oe*3)};
}
function selfTests(){
  const rows=[],assert=(name,ok)=>rows.push({name,passed:!!ok});
  const id=[1,0,0,0,1,0,0,0,1],other=[2,3,4,5,6,7,8,9,10];
  assert('identity determinant',Math.abs(det3(id)-1)<1e-9);
  assert('identity orthogonality',matrixQuality(id).orthogonalityError<1e-9);
  assert('matrix multiply identity',matMul3(id,other).every((v,i)=>v===other[i]));
  assert('identity vector transform',apply3(id,[3,4,5]).join(',')==='3,4,5');
  assert('transpose is involution',transpose3(transpose3(other)).every((v,i)=>v===other[i]));
  assert('relocated pointer arithmetic',0x10000080-0x10000000===0x80);
  const graph=new Map([[1,[2]],[2,[3]],[3,[1]]]),seen=new Set();
  const walk=n=>{if(seen.has(n))return;seen.add(n);for(const c of graph.get(n)||[])walk(c);};walk(1);
  assert('cycle-safe graph walk',seen.size===3);
  return{passed:rows.filter(x=>x.passed).length,total:rows.length,results:rows};
}
const tests=selfTests();if(tests.passed!==tests.total)throw new Error('Internal self-tests failed');
function writeJson(name,value){fs.writeFileSync(path.join(outDir,name),JSON.stringify(value,null,2)+'\n');}
function csvEscape(v){return'"'+String(v??'').replace(/"/g,'""')+'"';}

// Broad aligned-record census. The histogram is a byte-pattern census, not a
// claim that every occurrence is a record boundary.
const recordHistogram=new Array(16).fill(0),plausibleHeaders=[];
for(let o=0;o<b.length;o++)if(b[o]<16)recordHistogram[b[o]]++;
for(let o=0;o+4<=b.length;o+=4)if(b[o]<=13)plausibleHeaders.push({offset:o,opcode:b[o],flags:b[o+1],classWord:U16(o+2)});

const ptr=field=>resolve(field,'relocated-base');
function validOp5(o){
  if(!inside(o)||b[o]!==5||o+0x38>b.length)return false;
  const n=b[o+0x36];if(n<1||n>32||o+0x38+n*4>b.length)return false;
  for(let i=0;i<n;i++)if(ptr(o+0x38+i*4)===null)return false;
  return true;
}
function readOp5(o){
  const n=b[o+0x36],children=[];
  for(let i=0;i<n;i++){const f=o+0x38+i*4,t=ptr(f);children.push({index:i,pointerField:f,target:t,targetHeader:head(t)});}
  const raw=Array.from({length:9},(_,i)=>S32(o+4+i*4)),fixed=raw.map(v=>v/4096);
  return{offset:o,header:head(o),matrixRawQ20_12:raw,matrixQ20_12:fixed,matrixTransposeQ20_12:transpose3(fixed),matrixQuality:matrixQuality(fixed),positionRaw:[S32(o+0x28),S32(o+0x2c),S32(o+0x30)],childCount:n,children};
}
const transforms=[];
for(let o=0;o+0x38<=b.length;o+=4)if(validOp5(o))transforms.push(readOp5(o));
const transformByOffset=new Map(transforms.map(x=>[x.offset,x]));
const parentMap=new Map(transforms.map(x=>[x.offset,[]]));
for(const t of transforms)for(const c of t.children)if(transformByOffset.has(c.target))parentMap.get(c.target).push(t.offset);
for(const t of transforms)t.parentOffsets=parentMap.get(t.offset);
const roots=transforms.filter(t=>t.parentOffsets.length===0);
const transformEdges=transforms.flatMap(t=>t.children.filter(c=>transformByOffset.has(c.target)).map(c=>({from:t.offset,to:c.target,pointerField:c.pointerField})));

function parseOp2(o,context){
  if(!inside(o)||b[o]!==2||o+0x14>b.length)return null;
  const count=U32(o+0x10);
  if(count===null||count>64||o+0x14+count*4>b.length)return{offset:o,valid:false,reason:'count/slot array out of bounds',count};
  const slots=[];
  for(let i=0;i<count;i++){
    const field=o+0x14+i*4,wrapper=ptr(field),descriptor=wrapper===null?null:ptr(wrapper+8);
    const d={slot:i,field,wrapper,wrapperHeader:head(wrapper),descriptor,valid:descriptor!==null};
    if(descriptor!==null&&descriptor+16<=b.length){
      d.dwords=Array.from({length:4},(_,k)=>({relativeOffset:k*4,value:U32(descriptor+k*4),signed:S32(descriptor+k*4)}));
      d.targets={};
      for(const rel of [4,8,12]){const target=ptr(descriptor+rel);d.targets['plus'+rel]={field:descriptor+rel,target,targetHeader:head(target)};}
      d.coordinateTarget=d.targets.plus4.target;d.sharedTarget=d.targets.plus8.target;d.payloadTarget=d.targets.plus12.target;
      d.payloadHeader=head(d.payloadTarget);d.looksOpcode4=d.payloadHeader?.opcode===4&&d.payloadHeader?.classWord===0x090c;
    }
    slots.push(d);
  }
  return{offset:o,header:head(o),context,count,slots};
}
const opcode2Map=new Map();
for(const t of transforms)for(const c of t.children)if(c.targetHeader?.opcode===2&&!opcode2Map.has(c.target))opcode2Map.set(c.target,parseOp2(c.target,{transform:t.offset}));
const attachments=[...opcode2Map.values()].filter(Boolean);

function parseOp4(o,context){
  if(!inside(o)||b[o]!==4||o+0x14>b.length)return null;
  const count=b[o+0x12],available=Math.min(count,Math.floor((b.length-o-0x14)/4)),entries=[];
  for(let i=0;i<available;i++){
    const field=o+0x14+i*4,raw=U32(field),resolutions={};
    for(const mode of pointerModes){const target=resolve(field,mode);if(target!==null)resolutions[mode]={target,header:head(target)};}
    entries.push({index:i,field,raw,rawHex:hex(raw),signed:S32(field),resolutions});
  }
  return{offset:o,header:head(o),context,translationRaw:[S32(o+4),S32(o+8),S32(o+12)],wordAtPlus10:U16(o+0x10),entryCount:count,available,truncated:available!==count,entries,rawHex:b.subarray(o,Math.min(b.length,o+0x14+available*4)).toString('hex')};
}
const opcode4Map=new Map();
for(const a of attachments)for(const s of a.slots||[])if(s.looksOpcode4&&!opcode4Map.has(s.payloadTarget))
  opcode4Map.set(s.payloadTarget,parseOp4(s.payloadTarget,{attachment:a.offset,descriptor:s.descriptor,slot:s.slot}));
const opcode4s=[...opcode4Map.values()].filter(Boolean);

// Follow all opcode-4 child entries through every plausible pointer encoding.
// The interpretations remain separate and are never silently conflated.
const recursiveTargets=new Map();
for(const o of opcode4s)for(const e of o.entries)for(const mode of pointerModes){
  const target=e.resolutions[mode]?.target;if(target===undefined||target===null)continue;
  const key=mode+':'+target;
  if(!recursiveTargets.has(key))recursiveTargets.set(key,{mode,target,header:head(target),references:[]});
  recursiveTargets.get(key).references.push({opcode4:o.offset,entry:e.index,field:e.field,raw:e.raw});
}
const recursiveTargetRows=[...recursiveTargets.values()].sort((a,c)=>a.target-c.target);

// Index every aligned file DWORD that points to a discovered target. This gives
// reverse references, not inferred ownership.
const targetOffsets=new Set([...transforms.map(x=>x.offset),...attachments.map(x=>x.offset),...opcode4s.map(x=>x.offset),
  ...attachments.flatMap(a=>(a.slots||[]).flatMap(s=>[s.wrapper,s.descriptor,s.coordinateTarget,s.sharedTarget,s.payloadTarget].filter(Number.isInteger))),
  ...recursiveTargetRows.map(x=>x.target)]);
const reverseRefs=new Map([...targetOffsets].map(o=>[o,[]]));
for(let field=0;field+4<=b.length;field+=4){
  const raw=U32(field),targets=[['relocated-base',raw-base],['absolute-file-offset',raw]];
  for(const [mode,target]of targets)if(reverseRefs.has(target))reverseRefs.get(target).push({field,mode,raw});
}
const references=[...reverseRefs.entries()].map(([target,refs])=>({target,referenceCount:refs.length,references:refs.slice(0,100)})).sort((a,c)=>c.referenceCount-a.referenceCount);

// Compose every transform root with both multiplication orders, both matrix
// orientations, and both plausible translation scales. Score rigidity but do
// not select a convention on this metric alone.
function composeTree(root,order,transpose,translationScale){
  const rows=[];
  function visit(offset,parentM,parentP,stack){
    if(stack.includes(offset))return;
    const t=transformByOffset.get(offset);if(!t)return;
    const localM=transpose?t.matrixTransposeQ20_12:t.matrixQ20_12;
    const worldM=parentM===null?localM:(order==='parent-child'?matMul3(parentM,localM):matMul3(localM,parentM));
    const localP=t.positionRaw.map(v=>v*translationScale);
    let worldP=localP;
    if(parentP!==null){const rotated=apply3(order==='parent-child'?parentM:localM,localP);worldP=parentP.map((v,i)=>v+rotated[i]);}
    rows.push({offset,depth:stack.length,worldMatrix:worldM,worldPosition:worldP,matrixQuality:matrixQuality(worldM)});
    const next=stack.concat(offset);
    for(const c of t.children)if(transformByOffset.has(c.target))visit(c.target,worldM,worldP,next);
  }
  visit(root,null,null,[]);return rows;
}
const transformHypotheses=[];
for(const root of roots)for(const order of ['parent-child','child-parent'])for(const transpose of [false,true])for(const scale of [1,1/4096]){
  const rows=composeTree(root.offset,order,transpose,scale),scores=rows.map(x=>x.matrixQuality.score),dets=rows.map(x=>x.matrixQuality.determinant);
  transformHypotheses.push({root:root.offset,order,transpose,translationScale:scale,nodeCount:rows.length,averageOrthonormalityScore:scores.length?scores.reduce((a,c)=>a+c,0)/scores.length:0,determinantRange:dets.length?[Math.min(...dets),Math.max(...dets)]:null,positions:rows.map(x=>({offset:x.offset,depth:x.depth,position:x.worldPosition})),matrices:rows.map(x=>({offset:x.offset,matrix:x.worldMatrix,quality:x.matrixQuality}))});
}
transformHypotheses.sort((a,c)=>c.averageOrthonormalityScore-a.averageOrthonormalityScore);

// Probe coordinate and index candidates around every discovered payload target.
// Candidate data layouts are scored for internal consistency only.
const payloadCentres=new Set();
for(const a of attachments)for(const s of a.slots||[])for(const k of ['coordinateTarget','sharedTarget','payloadTarget'])if(Number.isInteger(s[k]))payloadCentres.add(s[k]);
for(const o of opcode4s)for(const e of o.entries)for(const mode of ['relocated-base','absolute-file-offset'])if(e.resolutions[mode])payloadCentres.add(e.resolutions[mode].target);
for(const r of recursiveTargetRows)payloadCentres.add(r.target);
const centres=[...payloadCentres].filter(o=>o>=0&&o<b.length).slice(0,maxTargets);
function coordinateCandidate(start,stride,count,kind){
  const points=[],seen=new Set();
  for(let i=0;i<count;i++){
    const p=start+i*stride;if(p<0||p+(kind==='i16x3'?6:12)>b.length)return null;
    let v;
    if(kind==='i16x3')v=[S16(p),S16(p+2),S16(p+4)];
    else{v=[b.readFloatLE(p),b.readFloatLE(p+4),b.readFloatLE(p+8)];if(v.some(x=>!Number.isFinite(x)||Math.abs(x)>1e8))return null;}
    points.push(v);seen.add(v.join(','));
  }
  const mins=[0,1,2].map(k=>Math.min(...points.map(v=>v[k]))),maxs=[0,1,2].map(k=>Math.max(...points.map(v=>v[k])));
  const ext=mins.map((v,k)=>maxs[k]-v),nonzero=ext.filter(v=>v>0).length,uniqueRatio=seen.size/count,magnitude=Math.max(...maxs.map(Math.abs),...mins.map(Math.abs));
  const score=Math.max(0,Math.min(100,uniqueRatio*45+nonzero*12+(count>=8?10:0)+(magnitude<50000?8:0)-(nonzero<2?25:0)));
  return{start,stride,count,kind,score,uniqueCount:seen.size,uniqueRatio,mins,maxs,extents:ext};
}
const coordinateCandidates=[];
for(const centre of centres){
  for(let delta=-24;delta<=24;delta+=4)for(const stride of [6,8,12,16])for(const count of [8,16,32]){
    const c=coordinateCandidate(centre+delta,stride,count,'i16x3');if(c)coordinateCandidates.push({...c,nearTarget:centre,delta});
  }
  for(let delta=-24;delta<=24;delta+=4)for(const stride of [12,16])for(const count of [8,16,32]){
    const c=coordinateCandidate(centre+delta,stride,count,'f32x3');if(c)coordinateCandidates.push({...c,nearTarget:centre,delta});
  }
}
coordinateCandidates.sort((a,c)=>c.score-a.score);
const topCoordinates=coordinateCandidates.slice(0,100);
const indexCandidates=[];
for(const centre of centres)for(let delta=-32;delta<=32;delta+=4)for(const width of [1,2,4]){
  const start=centre+delta;
  for(const count of [12,18,24,30,36,48,60,72,96]){
    if(start<0||start+count*width>b.length)continue;
    const vals=[];for(let i=0;i<count;i++)vals.push(width===1?b[start+i]:width===2?U16(start+i*2):U32(start+i*4));
    const max=Math.max(...vals),min=Math.min(...vals),unique=new Set(vals).size;
    let degenerate=0;for(let i=0;i+2<count;i+=3)if(vals[i]===vals[i+1]||vals[i]===vals[i+2]||vals[i+1]===vals[i+2])degenerate++;
    const coverage=unique/count,triCount=Math.floor(count/3),plausible=max<=2048&&coverage>0.15&&degenerate<Math.max(2,triCount*0.5);
    const score=plausible?Math.max(0,Math.min(100,coverage*45+(max>2?15:0)+(max<512?20:0)+(degenerate===0?20:0))):0;
    if(score>=30)indexCandidates.push({start,nearTarget:centre,delta,width,count,min,max,uniqueCount:unique,coverage,degenerateTriangles:degenerate,score,firstValues:vals.slice(0,36)});
  }
}
indexCandidates.sort((a,c)=>c.score-a.score);
const topIndices=indexCandidates.slice(0,100);
const opcode4EntryRows=opcode4s.flatMap(o=>o.entries.map(e=>({
  opcode4Offset:o.offset,entryIndex:e.index,field:e.field,rawHex:e.rawHex,signed:e.signed,
  relocated:e.resolutions['relocated-base']?.target??null,relocatedOpcode:e.resolutions['relocated-base']?.header?.opcode??null,
  absolute:e.resolutions['absolute-file-offset']?.target??null,absoluteOpcode:e.resolutions['absolute-file-offset']?.header?.opcode??null,
  relativeField:e.resolutions['signed-relative-to-field']?.target??null,relativeNext:e.resolutions['signed-relative-to-next-dword']?.target??null
})));
const pointerSummary={};
for(const mode of pointerModes)pointerSummary[mode]=opcode4EntryRows.filter(x=>mode==='relocated-base'?x.relocated!==null:mode==='absolute-file-offset'?x.absolute!==null:mode==='signed-relative-to-field'?x.relativeField!==null:x.relativeNext!==null).length;

const hypotheses=[];
const addHyp=(name,score,evidence,verdict='candidate')=>hypotheses.push({name,score,evidence,verdict});
addHyp('Relocated-base pointers in opcode-5 child arrays',transforms.length?95:0,{validOpcode5Records:transforms.length,edges:transformEdges.length,relocationBase:hex(base)},transforms.length?'strong structural match':'not observed');
addHyp('Opcode-2 descriptor slot arrays under opcode-5 children',attachments.length?90:0,{attachmentRecords:attachments.length,descriptorSlots:attachments.reduce((n,a)=>n+(a.slots?.length||0),0)},attachments.length?'strong structural match':'not observed');
addHyp('Descriptor +12 targets opcode-4/class-0x090c',opcode4s.length?92:0,{payloadRecords:opcode4s.length,entryCount:opcode4s.reduce((n,o)=>n+o.entryCount,0)},opcode4s.length?'strong structural match':'not observed');
for(const mode of pointerModes)addHyp('Opcode-4 entries resolve as '+mode,opcode4EntryRows.length?100*pointerSummary[mode]/opcode4EntryRows.length:0,{resolvedEntries:pointerSummary[mode],totalEntries:opcode4EntryRows.length},pointerSummary[mode]?'mechanically resolves; meaning unproven':'no in-range resolutions');
for(const c of topCoordinates.slice(0,20))addHyp('Coordinate '+c.kind+' stride '+c.stride+' near '+hex(c.nearTarget),c.score,{start:hex(c.start),count:c.count,uniqueRatio:c.uniqueRatio,extents:c.extents},'candidate only');
for(const c of topIndices.slice(0,20))addHyp('Index stream width '+c.width+' count '+c.count+' near '+hex(c.nearTarget),c.score,{start:hex(c.start),max:c.max,uniqueCount:c.uniqueCount,degenerateTriangles:c.degenerateTriangles},'candidate only');
for(const h of transformHypotheses.slice(0,16))addHyp('Transform root '+hex(h.root)+' '+h.order+' transpose='+h.transpose+' positionScale='+h.translationScale,h.averageOrthonormalityScore,{nodes:h.nodeCount,determinantRange:h.determinantRange},'math convention candidate only');
hypotheses.sort((a,c)=>c.score-a.score);

// Control run: retain the established raw geometry extraction, but never label
// it as the assembled soldier.
let baseline={status:'skipped'};
if(!noBaseline){
  const exporter=path.join(here,'export-dpc-armour-geometry.mjs');
  if(fs.existsSync(exporter)){
    const out=path.join(outDir,path.basename(input).replace(/\.dpc$/i,'')+'-raw-control.glb');
    const r=spawnSync(process.execPath,[exporter,input,out],{encoding:'utf8',maxBuffer:128*1024*1024});
    baseline={status:r.status===0?'completed':'failed',output:out,stdout:r.stdout||'',stderr:r.stderr||'',exitCode:r.status};
    const rp=out.replace(/\.glb$/i,'.json');
    if(fs.existsSync(rp))try{const x=JSON.parse(fs.readFileSync(rp,'utf8'));baseline.meshCount=x.meshCount;baseline.vertices=x.totalVertices;baseline.triangles=x.totalTriangles;baseline.note='Raw geometry control only; not assembled Scout.';}catch{}
  }else baseline={status:'not available',reason:'export-dpc-armour-geometry.mjs not found beside this tool'};
}
let exeAnalysis={status:'not requested'};
if(exePath){
  const bridge=path.join(here,'scout-exe-transform-bridge.sh');
  if(!fs.existsSync(exePath))exeAnalysis={status:'failed',reason:'Executable not found: '+exePath};
  else if(!fs.existsSync(bridge))exeAnalysis={status:'skipped',reason:'scout-exe-transform-bridge.sh not found'};
  else{
    const exeOut=path.join(outDir,'executable-analysis');fs.mkdirSync(exeOut,{recursive:true});
    const r=spawnSync('bash',[bridge,exePath,exeOut],{encoding:'utf8',maxBuffer:128*1024*1024});
    exeAnalysis={status:r.status===0?'completed':'failed',output:exeOut,stdout:r.stdout||'',stderr:r.stderr||'',exitCode:r.status};
  }
}

const report={
  title:'OUTWARS SCOUT AUTONOMOUS DPC DISCOVERY',generatedAt:new Date().toISOString(),input,fileBytes:b.length,relocationBase:hex(base),outputDirectory:outDir,selfTests:tests,
  scan:{recordOpcodeHistogram:recordHistogram.slice(0,14),alignedCandidateRecordHeaders:plausibleHeaders.length},
  callbackLayouts:{
    opcode5:{recordByte:5,matrix:'+0x04..+0x24 nine signed DWORDs; Q20.12 interpretation tested',position:'+0x28/+0x2c/+0x30',childCount:'+0x36 BYTE',children:'+0x38 relocated DWORD pointers',records:transforms},
    opcode2:{recordByte:2,count:'+0x10 DWORD',slots:'+0x14 DWORD pointer slots; wrapper+8 -> descriptor',attachments},
    opcode4:{recordByte:4,classWord:'0x090c',translation:'+0x04/+0x08/+0x0c DWORD',count:'+0x12 BYTE',children:'+0x14 DWORD entries',records:opcode4s}
  },
  graph:{transformRoots:roots.map(t=>t.offset),transformEdges,reverseReferences:references,recursiveOpcode4EntryTargets:recursiveTargetRows},
  pointerTests:{modes:pointerModes,opcode4EntryResolutionCounts:pointerSummary,opcode4EntryRows},
  transformMathTests:transformHypotheses,
  payloadTests:{testedPayloadCentres:centres.length,coordinateCandidatesTested:coordinateCandidates.length,topCoordinateCandidates:topCoordinates,indexCandidatesTested:indexCandidates.length,topIndexCandidates:topIndices},
  hypothesisScoreboard:hypotheses,
  controls:{rawGeometryBaseline:baseline,executableAnalysis:exeAnalysis},
  conclusion:{
    assembledScoutProduced:false,status:'AUTOMATED_DISCOVERY_COMPLETED_ASSEMBLY_NOT_YET_VALIDATED',
    statement:'The runner tests pointer encodings, callback graph structure, transform conventions and nearby payload layouts. An in-range pointer or plausible coordinate/index run is not proof of game semantics. A completed Scout still requires a proven transform-to-render-payload mapping and a recognisable exported GLB.',
    unresolvedTests:[
      'Determine which opcode-4 child-entry representation the callback stack actually consumes, rather than merely finding an in-range interpretation',
      'Identify the true leaf geometry/index payload among recursively discovered targets',
      'Prove which transform node/path owns each renderable payload',
      'Confirm matrix order and position units from executable data flow or a unique cross-resource invariant',
      'Export and visually validate the assembled Scout'
    ]
  }
};
writeJson('discovery-report.json',report);

const md=[
  '# Scout autonomous discovery report','',
  '- Input: '+input,'- Bytes: '+b.length,'- Relocation base: '+hex(base),
  '- Opcode-5 records: '+transforms.length,'- Transform roots: '+roots.map(x=>hex(x.offset)).join(', '),
  '- Transform edges: '+transformEdges.length,'- Opcode-2 attachments: '+attachments.length,
  '- Descriptor slots: '+attachments.reduce((n,a)=>n+(a.slots?.length||0),0),
  '- Opcode-4 payload records: '+opcode4s.length,'- Opcode-4 child entries: '+opcode4EntryRows.length,
  '- Payload centres tested: '+centres.length,'- Coordinate candidates: '+coordinateCandidates.length,'- Index candidates: '+indexCandidates.length,
  '','## Highest-ranked findings','',
  ...hypotheses.slice(0,30).map(h=>'- **'+h.score.toFixed(1)+'/100 — '+h.name+'** ('+h.verdict+'). Evidence: '+JSON.stringify(h.evidence)),
  '','## Opcode-4 pointer encoding sweep','','| Encoding | In-range entries |','|---|---:|',
  ...pointerModes.map(m=>'| '+m+' | '+pointerSummary[m]+' / '+opcode4EntryRows.length+' |'),
  '','## Highest-ranked coordinate candidates','','| Score | Target | Start | Kind | Stride | Samples | Extents |','|---:|---:|---:|---:|---:|---:|---|',
  ...topCoordinates.slice(0,25).map(c=>'| '+c.score.toFixed(1)+' | '+hex(c.nearTarget)+' | '+hex(c.start)+' | '+c.kind+' | '+c.stride+' | '+c.count+' | '+c.extents.map(x=>x.toFixed(1)).join(', ')+' |'),
  '','## Highest-ranked index candidates','','| Score | Target | Start | Width | Values | Maximum | Degenerate triples |','|---:|---:|---:|---:|---:|---:|---:|',
  ...topIndices.slice(0,25).map(c=>'| '+c.score.toFixed(1)+' | '+hex(c.nearTarget)+' | '+hex(c.start)+' | '+c.width+' | '+c.count+' | '+c.max+' | '+c.degenerateTriangles+' |'),
  '','## Transform convention sweep','','| Score | Root | Order | Transpose | Position scale | Nodes | Determinant range |','|---:|---:|---|---|---:|---:|---|',
  ...transformHypotheses.slice(0,32).map(h=>'| '+h.averageOrthonormalityScore.toFixed(1)+' | '+hex(h.root)+' | '+h.order+' | '+h.transpose+' | '+h.translationScale+' | '+h.nodeCount+' | '+(h.determinantRange||[]).map(x=>x.toFixed(4)).join(' .. ')+' |'),
  '','## Raw geometry control','',JSON.stringify(baseline,null,2),
  '','## Interpretation boundary','',
  'This is a broad static discovery sweep, not a claim that every candidate is semantically correct. The raw GLB control is not assembled Scout geometry. Assembly remains incomplete until payload ownership and transform composition are established and the result is visually recognisable.',
  '','## Output files','',
  '- discovery-report.json: full evidence, graph, target references and candidate results.',
  '- DISCOVERY-REPORT.md: ranked human-readable results.',
  '- opcode4-entry-candidates.csv: each opcode-4 child entry and pointer interpretation.',
  '- hypothesis-scoreboard.csv: ranked hypotheses.',
  '- payload-coordinate-candidates.csv: leading coordinate layouts.',
  '- payload-index-candidates.csv: leading index-stream candidates.',
  '- Raw geometry GLB and JSON control, when the existing exporter succeeds.'
];
fs.writeFileSync(path.join(outDir,'DISCOVERY-REPORT.md'),md.join('\n')+'\n');

const entryCsv=[['opcode4Offset','entryIndex','field','rawHex','signed','relocatedTarget','relocatedOpcode','absoluteTarget','absoluteOpcode','relativeFieldTarget','relativeNextTarget'],
...opcode4EntryRows.map(x=>[hex(x.opcode4Offset),x.entryIndex,hex(x.field),x.rawHex,x.signed,hex(x.relocated),x.relocatedOpcode,hex(x.absolute),x.absoluteOpcode,hex(x.relativeField),hex(x.relativeNext)])];
fs.writeFileSync(path.join(outDir,'opcode4-entry-candidates.csv'),entryCsv.map(r=>r.map(csvEscape).join(',')).join('\n')+'\n');
const hypCsv=[['score','verdict','hypothesis','evidence'],...hypotheses.map(h=>[h.score.toFixed(2),h.verdict,h.name,JSON.stringify(h.evidence)])];
fs.writeFileSync(path.join(outDir,'hypothesis-scoreboard.csv'),hypCsv.map(r=>r.map(csvEscape).join(',')).join('\n')+'\n');
const coordCsv=[['score','nearTarget','start','delta','kind','stride','count','uniqueRatio','minX','minY','minZ','maxX','maxY','maxZ'],
...topCoordinates.map(c=>[c.score,hex(c.nearTarget),hex(c.start),c.delta,c.kind,c.stride,c.count,c.uniqueRatio,...c.mins,...c.maxs])];
fs.writeFileSync(path.join(outDir,'payload-coordinate-candidates.csv'),coordCsv.map(r=>r.map(csvEscape).join(',')).join('\n')+'\n');
const indexCsv=[['score','nearTarget','start','delta','width','count','min','max','uniqueCount','coverage','degenerateTriangles','firstValues'],
...topIndices.map(c=>[c.score,hex(c.nearTarget),hex(c.start),c.delta,c.width,c.count,c.min,c.max,c.uniqueCount,c.coverage,c.degenerateTriangles,c.firstValues.join(' ')])];
fs.writeFileSync(path.join(outDir,'payload-index-candidates.csv'),indexCsv.map(r=>r.map(csvEscape).join(',')).join('\n')+'\n');

console.log('SCOUT AUTODISCOVERY COMPLETE');
console.log('Transforms: '+transforms.length+' | roots: '+roots.length+' | transform edges: '+transformEdges.length);
console.log('Opcode-2 attachments: '+attachments.length+' | descriptor slots: '+attachments.reduce((n,a)=>n+(a.slots?.length||0),0));
console.log('Opcode-4 payloads: '+opcode4s.length+' | child entries: '+opcode4EntryRows.length);
console.log('Payload centres: '+centres.length+' | coordinate candidates: '+coordinateCandidates.length+' | index candidates: '+indexCandidates.length);
console.log('Raw geometry control: '+baseline.status);
console.log('Assembled Scout: NOT CLAIMED — transform-to-payload ownership still needs proof.');
console.log('Report: '+path.join(outDir,'DISCOVERY-REPORT.md'));
console.log('Full JSON: '+path.join(outDir,'discovery-report.json'));
