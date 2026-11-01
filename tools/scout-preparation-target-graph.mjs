#!/usr/bin/env node
/**
 * OUTWARS SCOUT PREPARATION TARGET GRAPH v1.0.0
 * Expands the 12 targets discovered by the preparation-record pointer map,
 * captures raw bytes, finds nested DPC-relative pointers, and inventories
 * all aligned inbound references in the extracted Scout DPC.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const a=process.argv.slice(2);let ff=null,mapFile=null,prepFile=null,outArg=null;
for(let i=0;i<a.length;i++){if(a[i].startsWith('--'))throw Error('Unknown option '+a[i]);if(!ff)ff=a[i];else if(!mapFile)mapFile=a[i];else if(!prepFile)prepFile=a[i];else if(!outArg)outArg=a[i];else throw Error('Unexpected argument '+a[i]);}
if(!ff||!mapFile||!prepFile)throw Error('Usage: node tools/scout-preparation-target-graph.mjs original-data/units.ff scout-preparation-pointer-map/SCOUT-PREPARATION-POINTER-MAP.json scout-descriptor-preparation-audit-3/SCOUT-DESCRIPTOR-PREPARATION-AUDIT.json scout-preparation-target-graph');
for(const p of [ff,mapFile,prepFile])if(!fs.existsSync(p))throw Error('Missing input: '+p);
const here=path.dirname(new URL(import.meta.url).pathname),repo=path.resolve(here,'..');let out=path.resolve(outArg||'scout-preparation-target-graph');const rel=path.relative(repo,out);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Output must be inside repository.');
if(fs.existsSync(out)&&fs.readdirSync(out).length){const base=out;let n=2;do{out=base+'-'+n++;}while(fs.existsSync(out)&&fs.readdirSync(out).length);}
const ad=path.join(out,'analysis');fs.mkdirSync(ad,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'outwars-scout-graph-'));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:repo,encoding:'utf8',maxBuffer:512*1024*1024});if(r.status!==0)throw Error(cmd+' failed: '+(r.error?.message||r.stderr||r.status));return r.stdout||'';};
try{
 run(process.execPath,[path.join(here,'extract-ff-resources.mjs'),path.resolve(ff),'--out',tmp]);const dpcPath=path.join(tmp,'units','scout_mj.dpc');if(!fs.existsSync(dpcPath))throw Error('Extracted scout_mj.dpc missing.');
 const dpc=fs.readFileSync(dpcPath);
 const loadJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 let actualMapFile=path.resolve(mapFile),map=loadJson(actualMapFile);
 if(!map.uniquePreparationRecords||!map.pointers?.length){
  const dir=path.dirname(actualMapFile),name=path.basename(actualMapFile),stem=path.basename(dir);
  const candidates=[];
  for(let n=2;n<=12;n++){const candidate=path.join(path.dirname(dir),stem+'-'+n,name);if(fs.existsSync(candidate))candidates.push(candidate);}
  let recovered=null;
  for(const candidate of candidates){try{const candidateMap=loadJson(candidate);if(candidateMap.uniquePreparationRecords&&candidateMap.pointers?.length){recovered={file:candidate,data:candidateMap};break;}}catch{}}
  if(!recovered)throw Error('The pointer-map report supplied ('+actualMapFile+') is empty. No valid suffixed report was found beside it. Pass the folder containing the latest successful SCOUT-PREPARATION-POINTER-MAP.json.');
  actualMapFile=recovered.file;map=recovered.data;
 }
 const prep=loadJson(prepFile);
 const base=0x80018000,targets=[...new Set(map.pointers.map(p=>parseInt(p.targetOffset,16)))],knownDesc=(map.knownGeometryDescriptors||[]).map(x=>x.descriptorOffset),knownTransforms=(map.knownOpcode5Transforms||[]).map(x=>x.offset);
 const inbounds=new Map();for(let off=0;off+4<=dpc.length;off+=4){const v=dpc.readUInt32LE(off);if(v>=base&&v<base+dpc.length){const t=v-base;if(!inbounds.has(t))inbounds.set(t,[]);inbounds.get(t).push(off);}}
 const readNode=(off,depth,seen)=>{if(off<0||off>=dpc.length)return null;const size=Math.min(0x80,dpc.length-off),nested=[];for(let rel=0;rel+4<=size;rel+=4){const v=dpc.readUInt32LE(off+rel);if(v>=base&&v<base+dpc.length){const t=v-base;nested.push({fieldOffset:'0x'+(off+rel).toString(16),relativeOffset:rel,value:'0x'+v.toString(16),targetOffset:'0x'+t.toString(16),targetInKnownGeometryDescriptor:knownDesc.includes(t),targetInKnownTransform:knownTransforms.includes(t)});}}
  return{offset:'0x'+off.toString(16),depth,bytesHex:dpc.subarray(off,off+size).toString('hex'),firstDwords:Array.from({length:Math.min(16,Math.floor(size/4))},(_,i)=>'0x'+dpc.readUInt32LE(off+i*4).toString(16).padStart(8,'0')),nestedPointers:nested,inboundFields:(inbounds.get(off)||[]).map(x=>'0x'+x.toString(16)),isKnownGeometryDescriptor:knownDesc.includes(off),isKnownOpcode5Transform:knownTransforms.includes(off),};
 };
 const nodes=[],queue=targets.map(x=>({off:x,depth:0})),seen=new Set();while(queue.length){const q=queue.shift(),key=q.off;if(seen.has(key)||q.depth>2)continue;seen.add(key);const node=readNode(q.off,q.depth);if(!node)continue;nodes.push(node);if(q.depth<2)for(const p of node.nestedPointers)if(!seen.has(parseInt(p.targetOffset,16)))queue.push({off:parseInt(p.targetOffset,16),depth:q.depth+1});}
 const result={title:'OUTWARS SCOUT PREPARATION TARGET GRAPH',version:'1.0.1',pointerMapSource:actualMapFile,dpcBytes:dpc.length,virtualBase:'0x'+base.toString(16),seedTargets:targets.map(x=>'0x'+x.toString(16)),expandedNodeCount:nodes.length,maxDepth:2,nodes,knownGeometryDescriptors:knownDesc.map(x=>'0x'+x.toString(16)),knownOpcode5Transforms:knownTransforms.map(x=>'0x'+x.toString(16)),interpretation:'Nested pointer candidates are identified only by values within the DPC virtual-address range. Raw target bytes and inbound references are evidence; semantic roles require executable consumer analysis.'};
 fs.writeFileSync(path.join(ad,'target-nodes.json'),JSON.stringify(nodes,null,2));fs.writeFileSync(path.join(out,'SCOUT-PREPARATION-TARGET-GRAPH.json'),JSON.stringify(result,null,2)+'\n');
 const md=['# Scout preparation target graph','','Seed targets: '+targets.length,'Expanded nodes (depth <= 2): '+nodes.length,'','','| Target | Depth | Inbound refs | Nested pointers | Geometry descriptor | Opcode-5 transform |','|---|---:|---:|---:|---|---|',...nodes.map(n=>'| '+n.offset+' | '+n.depth+' | '+n.inboundFields.length+' | '+n.nestedPointers.length+' | '+(n.isKnownGeometryDescriptor?'yes':'no')+' | '+(n.isKnownOpcode5Transform?'yes':'no')+' |')];
 for(const n of nodes){md.push('','## '+n.offset+' (depth '+n.depth+')','','Inbound fields: '+n.inboundFields.join(', '),'','```text',n.bytesHex,'```','Nested pointers:',...n.nestedPointers.map(p=>'- '+p.fieldOffset+' → '+p.targetOffset+' (value '+p.value+')'));}
 md.push('','## Interpretation limit','',result.interpretation);fs.writeFileSync(path.join(out,'SCOUT-PREPARATION-TARGET-GRAPH.md'),md.join('\n')+'\n');
 const z=spawnSync('zip',['-qr',out+'.zip','.'],{cwd:out});if(z.status!==0)throw Error('ZIP packaging failed');console.log(JSON.stringify({seedTargets:targets.length,expandedNodes:nodes.length,nestedPointers:nodes.reduce((s,n)=>s+n.nestedPointers.length,0),bundle:out+'.zip'},null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
