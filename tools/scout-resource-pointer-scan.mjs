#!/usr/bin/env node
/**
 * Scout resource-pointer resolver.
 *
 * Scans the Scout DPC for relocated addresses outside the DPC image, then
 * searches every extracted unit/structure resource for a virtual-address range
 * that owns each target. This is intended to resolve cross-resource pointers
 * before attempting to join the independent geometry and transform graphs.
 *
 * Usage:
 *   node tools/scout-resource-pointer-scan.mjs <scout_mj.dpc> <output-dir> <resource-root...>
 *
 * Resource roots may include the extracted units directory and original-data/
 * (which contains the extracted structure resources and source archives).
 */
import fs from 'node:fs';
import path from 'node:path';

const argv=process.argv.slice(2);
if(argv.length<3){
  console.error('Usage: node tools/scout-resource-pointer-scan.mjs <scout_mj.dpc> <output-dir> <resource-root...>');
  process.exit(2);
}
const dpcPath=path.resolve(argv[0]);
const outDir=path.resolve(argv[1]);
const resourceRoots=argv.slice(2).map(root=>path.resolve(root));
if(!fs.existsSync(dpcPath))throw new Error('DPC not found: '+dpcPath);
for(const root of resourceRoots)if(!fs.existsSync(root))throw new Error('Resource root not found: '+root);
fs.mkdirSync(outDir,{recursive:true});
const dpc=fs.readFileSync(dpcPath);
if(dpc.length<40||dpc.toString('ascii',0,4)!=='DCPM')throw new Error('Input is not a DCPM resource: '+dpcPath);
const base=dpc.readUInt32LE(12);
const inRange=(o,n=4)=>Number.isInteger(o)&&o>=0&&o+n<=dpc.length;
const u8=o=>inRange(o,1)?dpc.readUInt8(o):null;
const u16=o=>inRange(o,2)?dpc.readUInt16LE(o):null;
const u32=o=>inRange(o,4)?dpc.readUInt32LE(o):null;
const s32=o=>inRange(o,4)?dpc.readInt32LE(o):null;
const rel=raw=>Number.isInteger(raw)&&raw>=base&&raw-base<dpc.length?raw-base:null;
const hex=n=>'0x'+Number(n).toString(16);
const seenFiles=new Set();
const files=[];
function walk(root){
  const stack=[root];
  while(stack.length){
    const dir=stack.pop();
    let entries;
    try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
    for(const ent of entries){
      if(ent.name==='.git'||ent.name==='node_modules'||ent.name==='.scout-variant-extracted')continue;
      const p=path.join(dir,ent.name);
      if(ent.isDirectory())stack.push(p);
      else if(ent.isFile()&&!seenFiles.has(p)){
        seenFiles.add(p);
        let stat;try{stat=fs.statSync(p);}catch{continue;}
        if(stat.size<=64*1024*1024)files.push({path:p,size:stat.size});
      }
    }
  }
}
for(const root of resourceRoots)walk(root);
files.sort((a,b)=>a.path.localeCompare(b.path));

function isTransform(o){
  if(!inRange(o,0x3c)||u8(o)!==5||u8(o+1)!==0x0b)return false;
  const cls=u16(o+2),n=u8(o+0x36);
  if((cls!==0&&cls!==100)||n>32||!inRange(o+0x38,n*4))return false;
  const m=Array.from({length:9},(_,i)=>s32(o+4+i*4)/4096);
  if(m.some(v=>!Number.isFinite(v)||Math.abs(v)>1.5))return false;
  const err=Math.max(
    Math.abs(m[0]**2+m[1]**2+m[2]**2-1),
    Math.abs(m[3]**2+m[4]**2+m[5]**2-1),
    Math.abs(m[6]**2+m[7]**2+m[8]**2-1),
    Math.abs(m[0]*m[3]+m[1]*m[4]+m[2]*m[5]),
    Math.abs(m[0]*m[6]+m[1]*m[7]+m[2]*m[8]),
    Math.abs(m[3]*m[6]+m[4]*m[7]+m[5]*m[8])
  );
  return err<0.05;
}
const transformRecords=[];
for(let o=0;o+0x3c<=dpc.length;o++)if(isTransform(o))transformRecords.push(o);
const transformSet=new Set(transformRecords);
const transformChildRecords=new Set();
for(const o of transformRecords){
  const n=u8(o+0x36);
  for(let i=0;i<n;i++){
    const child=rel(u32(o+0x38+i*4));
    if(child!==null)transformChildRecords.add(child);
  }
}
const knownDescriptors=[];
for(let o=0;o+0x18<=dpc.length;o++){
  if(u8(o)!==0)continue;
  const n=u32(o+0x10),payload=rel(u32(o+0x0c));
  if(payload===null||n===null||n<1||n>128)continue;
  let cursor=payload,ok=true;
  for(let i=0;i<n;i++){
    if(!inRange(cursor+0x16,1)){ok=false;break;}
    const stride=(u8(cursor+2)||0)*4;
    if(stride<0x18||stride>0x400||!inRange(cursor,stride)){ok=false;break;}
    cursor+=stride;
  }
  if(ok)knownDescriptors.push({offset:o,payload,count:n});
}
const knownRanges=[];
for(const o of transformRecords)knownRanges.push({start:o,end:o+0x3c,label:'opcode5-transform'});
for(const o of transformChildRecords)knownRanges.push({start:o,end:Math.min(dpc.length,o+0x80),label:'transform-child-target'});
for(const d of knownDescriptors){
  knownRanges.push({start:d.offset,end:d.offset+0x18,label:'opcode0-descriptor'});
  let cursor=d.payload;
  for(let i=0;i<d.count;i++){
    const stride=(u8(cursor+2)||0)*4;
    knownRanges.push({start:cursor,end:cursor+stride,label:'descriptor-payload'});
    cursor+=stride;
  }
}
function contextAt(offset){
  const hit=knownRanges.find(r=>offset>=r.start&&offset<r.end);
  if(!hit)return null;
  return {kind:hit.label,recordOffset:hex(hit.start),relativeOffset:offset-hit.start};
}
const pointerOccurrences=new Map();
for(let p=0;p+4<=dpc.length;p+=4){
  const raw=u32(p);
  if(raw===null||raw<base)continue;
  const target=raw-base;
  if(target<dpc.length)continue;
  if(raw>0x90000000)continue;
  const key=raw;
  if(!pointerOccurrences.has(key))pointerOccurrences.set(key,[]);
  pointerOccurrences.get(key).push({sourceOffset:p,context:contextAt(p)});
}
const externalPointers=[...pointerOccurrences.entries()].map(([raw,occurrences])=>({
  raw:hex(raw),rawValue:raw,targetOffset:raw-base,occurrenceCount:occurrences.length,
  sourceOffsets:occurrences.map(x=>hex(x.sourceOffset)),contexts:occurrences.filter(x=>x.context).map(x=>({sourceOffset:hex(x.sourceOffset),...x.context}))
})).sort((a,b)=>a.targetOffset-b.targetOffset);

// Cross-resource DPC pointers may address the containing FF archive rather than
// another DPC relocation range. The DPC relocation base is 0x1c40 bytes after
// the archive image base for this resource family.
const archiveImageBase=base-0x1c40;
let archiveManifest=null,archiveManifestPath=null;
for(const root of resourceRoots){
  const candidate=fs.statSync(root).isDirectory()?path.join(root,'_manifest.json'):root;
  if(fs.existsSync(candidate)&&candidate.endsWith('_manifest.json')){
    try{const parsed=JSON.parse(fs.readFileSync(candidate,'utf8'));if(Array.isArray(parsed.resources)){archiveManifest=parsed;archiveManifestPath=candidate;break;}}catch{}
  }
}
const archiveResolutions=externalPointers.map(p=>{
  const archiveOffset=p.rawValue-archiveImageBase;
  if(!archiveManifest||archiveOffset<0)return null;
  const resource=archiveManifest.resources.find(r=>archiveOffset>=r.offset&&archiveOffset<r.offset+r.size);
  if(!resource)return {pointer:p.raw,archiveOffset:hex(archiveOffset),archiveImageBase:hex(archiveImageBase),resource:null};
  return {pointer:p.raw,archiveOffset:hex(archiveOffset),archiveImageBase:hex(archiveImageBase),resource:resource.name,resourceArchiveOffset:hex(resource.offset),resourceRelativeOffset:hex(archiveOffset-resource.offset),resourceSize:resource.size};
}).filter(Boolean);
const archiveResolutionByPointer=new Map(archiveResolutions.map(x=>[x.pointer,x]));
for(const p of externalPointers)p.archiveResolution=archiveResolutionByPointer.get(p.raw)||null;

const targetSet=new Set(externalPointers.map(x=>x.rawValue));
const matches=[];
const rawHits=new Map([...targetSet].map(x=>[x,[]]));
for(const f of files){
  let buf;try{buf=fs.readFileSync(f.path);}catch{continue;}
  if(buf.length>=16){
    const fileBase=buf.readUInt32LE(12);
    if(fileBase>=0x80000000&&fileBase<0x90000000){
      const end=fileBase+buf.length;
      for(const p of externalPointers){
        if(p.rawValue>=fileBase&&p.rawValue<end){
          matches.push({
            pointer:p.raw,targetOffset:p.targetOffset,resource:path.relative(process.cwd(),f.path),
            resourceSize:buf.length,resourceBase:hex(fileBase),resourceOffset:hex(p.rawValue-fileBase),
            targetPreview:buf.subarray(p.rawValue-fileBase,Math.min(buf.length,p.rawValue-fileBase+32)).toString('hex').match(/.{1,2}/g)?.join(' ')||''
          });
        }
      }
    }
  }
  // Also locate raw occurrences of the pointer value in resource contents.
  for(const p of externalPointers){
    const needle=Buffer.alloc(4);needle.writeUInt32LE(p.rawValue);
    let at=0,found=0;
    while((at=buf.indexOf(needle,at))>=0&&found<8){
      rawHits.get(p.rawValue).push({resource:path.relative(process.cwd(),f.path),offset:hex(at)});
      at+=4;found++;
    }
  }
}
const matchedValues=new Set(matches.map(x=>x.pointer));
const matchesByPointer=new Map();
for(const m of matches){
  if(!matchesByPointer.has(m.pointer))matchesByPointer.set(m.pointer,[]);
  matchesByPointer.get(m.pointer).push(m);
}
const uniqueRangeMatchValues=new Set([...matchesByPointer.entries()].filter(([,v])=>v.length===1).map(([k])=>k));
const ambiguousRangeMatchValues=new Set([...matchesByPointer.entries()].filter(([,v])=>v.length>1).map(([k])=>k));
const ambiguousPointers=externalPointers.filter(p=>(matchesByPointer.get(p.raw)||[]).length>1).map(p=>({
  pointer:p.raw,targetOffset:hex(p.targetOffset),candidateCount:matchesByPointer.get(p.raw).length,
  candidates:matchesByPointer.get(p.raw).map(m=>({resource:m.resource,resourceBase:m.resourceBase,resourceOffset:m.resourceOffset,targetPreview:m.targetPreview}))
}));
const matchedResourcePaths=new Set(matches.map(m=>m.resource));
const matchedResourceDir=path.join(outDir,'matched-resources');
fs.mkdirSync(matchedResourceDir,{recursive:true});
for(const f of files){
  const relPath=path.relative(process.cwd(),f.path);
  if(!matchedResourcePaths.has(relPath))continue;
  const safeName=relPath.replace(/[\\/]/g,'__');
  fs.copyFileSync(f.path,path.join(matchedResourceDir,safeName));
}
const rawReferenceRows=[];
for(const [raw,hits] of rawHits)if(hits.length)rawReferenceRows.push({pointer:hex(raw),references:hits});
const unresolved=externalPointers.filter(x=>!matchedValues.has(x.raw)&&!rawHits.get(x.rawValue).length);
const report={
  input:dpcPath,dpcBytes:dpc.length,dpcBase:hex(base),dpcVirtualEnd:hex(base+dpc.length),
  resourceRoots,resourceFileCount:files.length,archiveManifestPath,archiveImageBase:hex(archiveImageBase),
  summary:{
    transformRecordCount:transformRecords.length,transformChildTargetCount:transformChildRecords.size,
    opcode0DescriptorCandidates:knownDescriptors.length,uniqueExternalPointerCount:externalPointers.length,
    matchedPointerCount:matchedValues.size,uniqueRangeMatchPointerCount:uniqueRangeMatchValues.size,
    ambiguousRangeMatchPointerCount:ambiguousRangeMatchValues.size,archiveResolvedPointerCount:archiveResolutions.filter(x=>x.resource).length,rawReferencePointerCount:rawReferenceRows.length,
    unresolvedPointerCount:unresolved.length
  },
  transformRecords:transformRecords.map(o=>({offset:hex(o),classWord:u16(o+2),position:[s32(o+0x28),s32(o+0x2c),s32(o+0x30)],childCount:u8(o+0x36)})),
  transformChildTargets:[...transformChildRecords].sort((a,b)=>a-b).map(o=>({offset:hex(o),opcode:u8(o),classWord:u16(o+2)})),
  descriptorCandidates:knownDescriptors.map(x=>({offset:hex(x.offset),payload:hex(x.payload),count:x.count})),
  externalPointers,matches,ambiguousPointers,archiveResolutions,rawReferenceRows,unresolvedPointers:unresolved
};
fs.writeFileSync(path.join(outDir,'RESOURCE-POINTER-SCAN.json'),JSON.stringify(report,null,2)+'\n');
const md=[
  '# Scout cross-resource pointer scan','',
  '- DPC: '+dpcPath,
  '- DPC virtual range: '+hex(base)+'–'+hex(base+dpc.length),
  '- Resource files scanned: '+files.length,
  '- Validated opcode-5 transforms: '+transformRecords.length,
  '- Opcode-5 child targets: '+transformChildRecords.size,
  '- Opcode-0 descriptor candidates: '+knownDescriptors.length,
  '',
  '## Results','',
  '| Metric | Count |','|---|---:|',
  ...Object.entries(report.summary).map(([k,v])=>'| '+k+' | '+v+' |'),
  '',
  '## External pointers','',
  '| Pointer | DPC target offset | Occurrences | Range matches | Resolution |',
  '|---:|---:|---:|---:|---|',
  ...externalPointers.map(p=>{
    const n=(matchesByPointer.get(p.raw)||[]).length;
    const status=n===1?'UNIQUE':n>1?'AMBIGUOUS':'UNRESOLVED';
    return '| '+p.raw+' | '+hex(p.targetOffset)+' | '+p.occurrenceCount+' | '+n+' | '+status+' |';
  }),
  '',
  '## Archive-base resolutions','',
  '- Archive image base: '+hex(archiveImageBase),
  '- Manifest: '+(archiveManifestPath||'not found'),
  ...archiveResolutions.map(x=>'- '+x.pointer+' → archive '+x.archiveOffset+(x.resource?' → '+x.resource+' + '+x.resourceRelativeOffset:' (no resource range match)')),
  '',
  '## Exact resource-range candidates','',
  ...matches.map(m=>'- '+m.pointer+' → '+m.resource+' + '+m.resourceOffset+' (base '+m.resourceBase+')'),
  '',
  '## Ambiguous pointers','',
  ...(ambiguousPointers.length?ambiguousPointers.map(p=>'- '+p.pointer+' has '+p.candidateCount+' overlapping resource candidates; none is selected automatically'):['- None']),
  '',
  'Matched candidate files are copied into matched-resources/ for direct inspection.',
  '',
  '## Raw pointer references','',
  ...rawReferenceRows.map(x=>'- '+x.pointer+': '+x.references.map(y=>y.resource+' @ '+y.offset).join(', ')),
  '',
  '## Unresolved pointers','',
  ...(unresolved.length?unresolved.map(x=>'- '+x.raw+' (DPC offset '+hex(x.targetOffset)+', '+x.occurrenceCount+' occurrence(s))'):['- None']),
  '',
  '## Interpretation boundary','',
  'A resource-range match establishes only that an address falls inside a file image. When multiple DPC files share the same virtual base and range, the match is ambiguous and does not identify the target resource. A raw pointer occurrence establishes only that the value is stored in that file. The pointed-to record must still be decoded and linked to the Scout geometry callbacks.'
];
fs.writeFileSync(path.join(outDir,'RESOURCE-POINTER-SCAN.md'),md.join('\n')+'\n');
console.log('Scout resource-pointer scan complete');
console.log(JSON.stringify(report.summary));
console.log('Report: '+path.join(outDir,'RESOURCE-POINTER-SCAN.md'));
