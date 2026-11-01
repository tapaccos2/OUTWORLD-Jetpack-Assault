#!/usr/bin/env node
/**
 * One-command Scout finalization.
 *
 * Usage:
 *   node tools/scout-finalize.mjs original-data/units.ff scout-final --exe /path/to/outwars.exe
 *
 * Performs the callback/transform/executable audit, extracts scout_mj.dpc,
 * exports five geometry candidates, validates their GLB accessors and face
 * counts, selects the owner-translated static candidate, writes final reports,
 * and packages everything. No further assistant-side interpretation is needed.
 *
 * The output is deliberately labelled a static candidate, not a bit-exact
 * runtime reconstruction: verified bone ownership, matrix application, UVs,
 * textures, skinning and animation remain separate unresolved items.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const argv=process.argv.slice(2);
let input=null,outArg=null,exePath=null;
for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--exe'){
    if(!argv[i+1])throw new Error('--exe requires a path');
    exePath=path.resolve(argv[++i]);
  }else if(a.startsWith('--'))throw new Error('Unknown option: '+a);
  else if(input===null)input=a;
  else if(outArg===null)outArg=a;
  else throw new Error('Unexpected argument: '+a);
}
if(!input){
  console.error('Usage: node tools/scout-finalize.mjs <units.ff|scout_mj.dpc> [out-dir] [--exe outwars.exe]');
  process.exit(2);
}
const source=path.resolve(input),outDir=path.resolve(outArg||'scout-final');
const outRel=path.relative(process.cwd(),outDir);
if(!outRel||outRel.startsWith('..')||path.isAbsolute(outRel))
  throw new Error('Choose a dedicated output directory inside the repository; refusing to remove a path outside it.');
fs.rmSync(outDir,{recursive:true,force:true});
fs.mkdirSync(outDir,{recursive:true});
const analysisDir=path.join(outDir,'analysis');
const geometryDir=path.join(outDir,'geometry');
fs.mkdirSync(geometryDir,{recursive:true});

function run(label,command,args){
  console.log('\n['+label+']');
  const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:256*1024*1024});
  if(r.stdout)process.stdout.write(r.stdout);
  if(r.stderr)process.stderr.write(r.stderr);
  if(r.status!==0)throw new Error(label+' failed (exit '+r.status+'). '+(r.error?.message||''));
}
function readJson(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(e){throw new Error('Unable to read '+file+': '+e.message);}
}
function parseGlb(file){
  const b=fs.readFileSync(file);
  if(b.length<28||b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2)
    throw new Error('Invalid GLB 2.0 file: '+file);
  const jsonLength=b.readUInt32LE(12),jsonType=b.readUInt32LE(16);
  if(jsonType!==0x4e4f534a||20+jsonLength+8>b.length)throw new Error('Invalid GLB JSON chunk');
  const gltf=JSON.parse(b.toString('utf8',20,20+jsonLength).trim());
  const bh=20+jsonLength,binLength=b.readUInt32LE(bh);
  if(b.readUInt32LE(bh+4)!==0x004e4942||bh+8+binLength>b.length)throw new Error('Invalid GLB BIN chunk');
  return{gltf,bin:b.subarray(bh+8,bh+8+binLength)};
}
function accessor(gltf,bin,id){
  const a=gltf.accessors?.[id],v=a&&gltf.bufferViews?.[a.bufferView];
  if(!a||!v)throw new Error('Missing GLB accessor '+id);
  const cb=({5121:1,5123:2,5125:4,5126:4})[a.componentType];
  const cc=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4})[a.type];
  if(!cb||!cc)throw new Error('Unsupported GLB accessor '+id);
  const stride=v.byteStride||cb*cc,start=(v.byteOffset||0)+(a.byteOffset||0);
  const end=start+(a.count?((a.count-1)*stride+cb*cc):0);
  if(start<0||end>bin.length)throw new Error('GLB accessor outside binary buffer: '+id);
  const values=[];
  for(let i=0;i<a.count;i++){
    const row=[];
    for(let k=0;k<cc;k++){
      const p=start+i*stride+k*cb;
      row.push(a.componentType===5126?bin.readFloatLE(p):
        a.componentType===5125?bin.readUInt32LE(p):
        a.componentType===5123?bin.readUInt16LE(p):bin.readUInt8(p));
    }
    values.push(cc===1?row[0]:row);
  }
  return{meta:a,values};
}
function multiply4(a,b){
  const out=new Array(16).fill(0);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++)
    for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];
  return out;
}
function nodeLocalMatrix(node){
  if(Array.isArray(node.matrix)&&node.matrix.length===16)return node.matrix.slice();
  const t=node.translation||[0,0,0],s=node.scale||[1,1,1],q=node.rotation||[0,0,0,1];
  const [x,y,z,w]=q,xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z;
  return [
    (1-2*(yy+zz))*s[0],(2*(xy+wz))*s[0],(2*(xz-wy))*s[0],0,
    (2*(xy-wz))*s[1],(1-2*(xx+zz))*s[1],(2*(yz+wx))*s[1],0,
    (2*(xz+wy))*s[2],(2*(yz-wx))*s[2],(1-2*(xx+yy))*s[2],0,
    t[0],t[1],t[2],1
  ];
}
function transformPoint(m,v){
  const x=v[0],y=v[1],z=v[2];
  const w=m[3]*x+m[7]*y+m[11]*z+m[15];
  const p=[
    m[0]*x+m[4]*y+m[8]*z+m[12],
    m[1]*x+m[5]*y+m[9]*z+m[13],
    m[2]*x+m[6]*y+m[10]*z+m[14]
  ];
  return w&&w!==1?p.map(x=>x/w):p;
}
function worldBoundsForMesh(gltf,meshIndex,points){
  const roots=gltf.scenes?.[gltf.scene??0]?.nodes||[];
  const instances=[],path=new Set();
  function visit(nodeIndex,parentMatrix){
    if(path.has(nodeIndex))throw new Error('GLB node cycle at '+nodeIndex);
    const node=gltf.nodes?.[nodeIndex];
    if(!node)throw new Error('GLB scene references missing node '+nodeIndex);
    path.add(nodeIndex);
    const world=multiply4(parentMatrix,nodeLocalMatrix(node));
    if(node.mesh===meshIndex){
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      let invalid=0;
      for(const point of points){
        const p=transformPoint(world,point);
        if(p.some(x=>!Number.isFinite(x))){invalid++;continue;}
        for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
      }
      instances.push({nodeIndex,nodeName:node.name||null,worldMatrix:world,min,max,invalidValues:invalid});
    }
    for(const child of node.children||[])visit(child,world);
    path.delete(nodeIndex);
  }
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const root of roots)visit(root,identity);
  if(!roots.length){
    const parents=new Set((gltf.nodes||[]).flatMap(n=>n.children||[]));
    for(let i=0;i<(gltf.nodes||[]).length;i++)if(!parents.has(i))visit(i,identity);
  }
  if(!instances.length)return{instanceCount:0,min:null,max:null,instances:[]};
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const instance of instances)for(let k=0;k<3;k++){
    min[k]=Math.min(min[k],instance.min[k]);max[k]=Math.max(max[k],instance.max[k]);
  }
  return{instanceCount:instances.length,min,max,instances};
}
function validateGlb(file){
  const {gltf,bin}=parseGlb(file);
  const side=readJson(file.replace(/\.glb$/i,'.json'));
  const rows=[],problems=[];
  for(let i=0;i<(gltf.meshes||[]).length;i++){
    const m=gltf.meshes[i],p=m.primitives?.[0];
    if(!p){problems.push(m.name+': missing primitive');continue;}
    const pos=accessor(gltf,bin,p.attributes.POSITION);
    const idx=accessor(gltf,bin,p.indices);
    const points=pos.values,indices=idx.values,source=side.meshes?.[i]||{};
    let invalid=0,degenerate=0;
    const localMin=[Infinity,Infinity,Infinity],localMax=[-Infinity,-Infinity,-Infinity];
    for(const v of points){
      if(!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x))){invalid++;continue;}
      for(let k=0;k<3;k++){localMin[k]=Math.min(localMin[k],v[k]);localMax[k]=Math.max(localMax[k],v[k]);}
    }
    for(let t=0;t+2<indices.length;t+=3){
      const a=indices[t],b=indices[t+1],c=indices[t+2];
      if(!Number.isInteger(a)||!Number.isInteger(b)||!Number.isInteger(c)||
         a<0||b<0||c<0||a>=points.length||b>=points.length||c>=points.length){invalid++;continue;}
      if(a===b||b===c||a===c)degenerate++;
    }
    const triangles=Math.floor(indices.length/3);
    const rangeOk=indices.every(x=>Number.isInteger(x)&&x>=0&&x<points.length);
    const quads=source.uniqueQuadCount??0;
    if(!rangeOk)problems.push(m.name+': index outside local vertex range');
    if(source.triangles!==triangles||triangles!==quads*2)
      problems.push(m.name+': index/quad/triangle count mismatch');
    if(source.sourceFaceRecordCount!==undefined&&source.sourceFaceRecordCount!==quads*2)
      problems.push(m.name+': source face records do not form the observed duplicate pairs');
    if(invalid)problems.push(m.name+': '+invalid+' invalid local values or indices');
    if(degenerate>triangles*0.5+1)problems.push(m.name+': more than half the triangles have repeated indices');
    const world=worldBoundsForMesh(gltf,i,points);
    if(!world.instanceCount)problems.push(m.name+': mesh is not reachable from the active GLB scene');
    if(world.instances.some(x=>x.invalidValues))problems.push(m.name+': invalid transformed world-space positions');
    const localBounds={min:localMin,max:localMax,size:localMax.map((x,k)=>x-localMin[k])};
    const worldBounds=world.min?{min:world.min,max:world.max,size:world.max.map((x,k)=>x-world.min[k])}:null;
    rows.push({
      name:m.name,vertices:points.length,triangles,
      sourceFaceRecords:source.sourceFaceRecordCount??null,
      uniqueQuads:quads,localBounds,worldBounds,
      bounds:worldBounds,
      nodeInstanceCount:world.instanceCount,
      worldMatrices:world.instances.map(x=>({nodeIndex:x.nodeIndex,nodeName:x.nodeName,matrix:x.worldMatrix})),
      indexMin:indices.length?Math.min(...indices):null,
      indexMax:indices.length?Math.max(...indices):null,
      invalidValues:invalid,degenerateIndexTriangles:degenerate
    });
  }
  if(rows.length!==9)problems.push('Expected 9 playable-armour mesh sections; found '+rows.length);
  const combine=(field)=>{
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    let count=0;
    for(const row of rows){
      const bounds=row[field];
      if(!bounds)continue;
      count++;
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],bounds.min[k]);max[k]=Math.max(max[k],bounds.max[k]);}
    }
    return count?{min,max,size:max.map((x,k)=>x-min[k])}:null;
  };
  return{
    file,meshCount:rows.length,totalVertices:rows.reduce((s,x)=>s+x.vertices,0),
    totalTriangles:rows.reduce((s,x)=>s+x.triangles,0),
    localCombinedBounds:combine('localBounds'),
    combinedBounds:combine('worldBounds'),
    validationSpace:'world-space (GLB node matrix/TRS and parent hierarchy applied)',
    activeScene:gltf.scene??0,
    meshes:rows,passed:problems.length===0,problems
  };
}
function markdown(r){
  const g=r.geometry.ownerTranslated;
  const lines=[
    '# Scout one-run finalization report','',
    '- Status: '+r.status,
    '- Source archive/DPC: '+r.source,
    '- Extracted DPC SHA-256: '+r.sourceDpcSha256,
    '- Executable analysis: '+r.executableAnalysis,
    '',
    '## Primary static candidate',
    '',
    '- File: scout-candidate.glb',
    '- Validation: '+(g.passed?'PASS':'FAIL'),
    '- Meshes: '+g.meshCount,
    '- Vertices: '+g.totalVertices,
    '- Triangles: '+g.totalTriangles,
    '- Combined bounds: '+JSON.stringify(g.combinedBounds),
    '',
    '| Mesh | Vertices | Triangles | Face records | Unique quads |',
    '|---|---:|---:|---:|---:|',
    ...g.meshes.map(x=>'| '+x.name+' | '+x.vertices+' | '+x.triangles+' | '+x.sourceFaceRecords+' | '+x.uniqueQuads+' |'),
    '',
    '## Placement',
    '',
    'Bounds in this report are world-space bounds: every GLB node matrix or TRS transform is applied, including parent transforms. Local-space bounds are also reported separately. This corrects the prior validator, which ignored node translations.',
    '',
    '## Coordinate-base comparison',
    '',
    '| Candidate | Meshes | Vertices | Triangles | World-space bounds |',
    '|---|---:|---:|---:|---|',
    ...Object.entries(r.geometry).map(([name,x])=>'| '+name+' | '+x.meshCount+' | '+x.totalVertices+' | '+x.totalTriangles+' | '+JSON.stringify(x.combinedBounds)+' |'),
    '',
    'The mesh-reference candidates apply the alternate vertex base stored at meshNode+28. This was omitted from the earlier pass and must be compared before selecting a final placement.',
    '',
    '## Runtime reconstruction boundary',
    '',
    '- analysis/ contains the integrated callback, descriptor, opcode-4, opcode-5 and executable-disassembly reports.',
    '- The static mesh export does not claim verified per-mesh opcode-5 ownership or composed runtime matrices.',
    '- Original UVs, texture/material assignment, skinning, animation and bit-exact renderer behavior are not claimed.',
    '- The repeated 0x04010C09 records are treated as candidate face records only in the owner-part mesh streams. Elsewhere they remain callback/class records; no global byte-pattern interpretation is applied.',
    '',
    '## Validation',
    '',
    ...(g.problems.length?g.problems.map(x=>'- FAIL: '+x):[
      '- All nine mesh sections passed GLB/index-bound checks.',
      '- World-space bounds include every active-scene node matrix/TRS and parent transform.',
      '- This is structural validation only; bounds do not establish anatomical correctness or select a winning placement.'
      '- Each source face-record count matches the observed two-record-per-unique-quad pattern.',
      '- Triangle counts agree with the exported unique quad counts.'
    ]),
    '',
    '## Files',
    '',
    '- scout-candidate.glb: owner-translated comparison baseline; not a selected or verified final placement.',
    '- geometry/: shared-pool, owner-translated, reference-point-mapped, mesh-reference-base and mesh-reference-plus-owner-translation alternatives with JSON sidecars.',
    '- analysis/: complete integrated forensic report set.',
    '- FINAL-REPORT.json and FINAL-REPORT.md: machine-readable and human-readable summaries.',
    '- The adjacent ZIP contains the complete output directory.'
  ];
  return lines.join('\n')+'\n';
}

console.log('OUTWARS SCOUT FINALIZATION — one command');
console.log('Source: '+source);
console.log('Output: '+outDir);

// 1. Run the complete integrated callback/transform/EXE analysis.
const reconstructionTool=path.join(here,'reconstruct-scout.mjs');
if(!fs.existsSync(reconstructionTool))throw new Error('Missing tools/reconstruct-scout.mjs');
const args2=[reconstructionTool,source,analysisDir];
if(exePath)args2.push('--exe',exePath);
run('integrated callback and executable analysis',process.execPath,args2);
const discovery=readJson(path.join(analysisDir,'autodiscovery','discovery-report.json'));
if(!discovery.input||!fs.existsSync(discovery.input))
  throw new Error('The analysis pipeline did not leave a usable extracted DPC file: '+discovery.input);
const dpc=path.resolve(discovery.input);
const hash=spawnSync('sha256sum',[dpc],{encoding:'utf8'});
const dpcSha=hash.status===0?hash.stdout.trim().split(/\s+/)[0]:null;

// 2. Export independent geometry interpretations from the extracted DPC.
const exporter=path.join(here,'export-dpc-armour-geometry.mjs');
if(!fs.existsSync(exporter))throw new Error('Missing tools/export-dpc-armour-geometry.mjs');
const raw=path.join(geometryDir,'scout-mj-raw-shared.glb');
const owner=path.join(geometryDir,'scout-mj-owner-translated.glb');
const ref=path.join(geometryDir,'scout-mj-reference-point-mapped.glb');
const meshRef=path.join(geometryDir,'scout-mj-mesh-reference-base.glb');
const meshRefOwner=path.join(geometryDir,'scout-mj-mesh-reference-owner-translated.glb');
run('raw shared-pool geometry',process.execPath,[exporter,dpc,raw]);
run('owner-translated geometry',process.execPath,[exporter,dpc,owner,'--apply-owner-translations']);
run('reference-point-mapped comparison',process.execPath,[exporter,dpc,ref,'--apply-reference-point-mapping']);
run('meshNode+28 vertex-reference geometry',process.execPath,[exporter,dpc,meshRef,'--use-mesh-vertex-reference']);
run('meshNode+28 plus owner-translation geometry',process.execPath,[exporter,dpc,meshRefOwner,'--use-mesh-vertex-reference','--apply-owner-translations']);

const geometry={
  rawSharedPool:validateGlb(raw),
  ownerTranslated:validateGlb(owner),
  referencePointMapped:validateGlb(ref),
  meshReferenceBase:validateGlb(meshRef),
  meshReferenceOwnerTranslated:validateGlb(meshRefOwner)
};
const candidate=path.join(outDir,'scout-candidate.glb');
fs.copyFileSync(owner,candidate);
fs.copyFileSync(owner.replace(/\.glb$/i,'.json'),path.join(outDir,'scout-candidate.json'));
const manifest=readJson(path.join(analysisDir,'reconstruction-manifest.json'));
const problems=[];
for(const [name,result] of Object.entries(geometry))if(!result.passed)
  problems.push(name+': '+result.problems.join('; '));
const report={
  pipeline:'Outwars Scout one-run finalization',
  version:'1.0.0',
  generatedAt:new Date().toISOString(),
  source,
  extractedDpc:dpc,
  sourceDpcSha256:dpcSha,
  executable:exePath,
  executableAnalysis:discovery.controls?.executableAnalysis?.status??'not requested',
  callbackEvidence:{
    opcode5TransformCount:manifest.transformHierarchy?.structurallyPlausibleOpcode5Records??null,
    opcode2AttachmentCount:manifest.geometryPayload?.opcode2Attachments??null,
    descriptorCount:manifest.geometryPayload?.inlineDescriptors??null,
    opcode4PayloadCount:manifest.geometryPayload?.opcode4PayloadCount??null,
    opcode4EntryCount:manifest.geometryPayload?.opcode4EntryCount??null,
    strictCallbackEdges:manifest.geometryPayload?.strictCallbackEdges??null,
    strictCallbackEdgesByTargetKind:manifest.geometryPayload?.strictCallbackEdgesByTargetKind??null
  },
  geometry,
  selectedCandidate:{
    file:candidate,
    placement:'owner-translated-baseline-not-proven',
    reason:'Retained for compatibility. Exact owner/paired-node vector equality is necessary evidence, but does not establish the correct vertex base or composed runtime transform. Compare all five geometry variants before treating any as final.',
    passed:geometry.ownerTranslated.passed
  },
  status:Object.values(geometry).every(x=>x.passed)?'STATIC_CANDIDATES_EXPORTED_PLACEMENT_UNVERIFIED':'GEOMETRY_VALIDATION_FAILED',
  runtimeCompletion:{
    bitExact:false,
    unresolved:[
      'Verified shared-pool versus meshNode+28 vertex-base interpretation',
      'Verified opcode-5 transform ownership for each mesh section',
      'Composed runtime matrices applied to each mesh',
      'Original UV and texture/material binding',
      'Skinning and animation'
    ],
    note:'These runtime items are kept separate from the static candidate and are not guessed.'
  },
  warnings:problems
};
fs.writeFileSync(path.join(outDir,'FINAL-REPORT.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(outDir,'FINAL-REPORT.md'),markdown(report));

// 3. Package all evidence and candidates into one archive.
const archive=outDir+'.zip';
fs.rmSync(archive,{force:true});
if(spawnSync('zip',['-v'],{encoding:'utf8'}).status!==0)
  throw new Error('Install the standard zip utility to create the final evidence bundle.');
const zipped=spawnSync('zip',['-qr',archive,'.'],{cwd:outDir,encoding:'utf8',maxBuffer:8*1024*1024});
if(zipped.status!==0)throw new Error('ZIP creation failed: '+(zipped.stderr||zipped.stdout||''));
console.log('\nFINALIZATION COMPLETE');
console.log('Status: '+report.status);
console.log('Primary GLB: '+candidate);
console.log('Meshes: '+geometry.ownerTranslated.meshCount+
  ' | vertices: '+geometry.ownerTranslated.totalVertices+
  ' | triangles: '+geometry.ownerTranslated.totalTriangles);
console.log('GLB validation: '+(geometry.ownerTranslated.passed?'PASS':'FAIL'));
console.log('Report: '+path.join(outDir,'FINAL-REPORT.md'));
console.log('Evidence bundle: '+archive);
if(!Object.values(geometry).every(x=>x.passed))process.exitCode=1;
