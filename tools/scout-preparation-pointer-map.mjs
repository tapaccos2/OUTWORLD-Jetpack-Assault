#!/usr/bin/env node
/**
 * OUTWARS SCOUT PREPARATION-RECORD POINTER MAP v1.0.0
 * Maps every DPC-relative pointer in the 56 unique physical records reached
 * by the 16 Scout preparation descriptors, and correlates targets with the
 * known geometry descriptors and opcode-5 transform nodes.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const a=process.argv.slice(2);let ff=null,prepFile=null,transformFile=null,outArg=null;
for(let i=0;i<a.length;i++){if(a[i].startsWith('--'))throw Error('Unknown option '+a[i]);if(!ff)ff=a[i];else if(!prepFile)prepFile=a[i];else if(!transformFile)transformFile=a[i];else if(!outArg)outArg=a[i];else throw Error('Unexpected argument '+a[i]);}
if(!ff||!prepFile||!transformFile)throw Error('Usage: node tools/scout-preparation-pointer-map.mjs original-data/units.ff scout-descriptor-preparation-audit/SCOUT-DESCRIPTOR-PREPARATION-AUDIT.json scout-bridge/analysis/transform-attachment-audit.json scout-preparation-pointer-map');
for(const p of [ff,prepFile,transformFile])if(!fs.existsSync(p))throw Error('Missing input: '+p);
const here=path.dirname(new URL(import.meta.url).pathname),repo=path.resolve(here,'..');let out=path.resolve(outArg||'scout-preparation-pointer-map');const rel=path.relative(repo,out);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Output must be inside repository.');
if(fs.existsSync(out)&&fs.readdirSync(out).length){const base=out;let n=2;do{out=base+'-'+n++;}while(fs.existsSync(out)&&fs.readdirSync(out).length);}
const ad=path.join(out,'analysis');fs.mkdirSync(ad,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'outwars-scout-ptr-'));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:repo,encoding:'utf8',maxBuffer:512*1024*1024});if(r.status!==0)throw Error(cmd+' failed: '+(r.error?.message||r.stderr||r.status));return r.stdout||'';};
try{
 run(process.execPath,[path.join(here,'extract-ff-resources.mjs'),path.resolve(ff),'--out',tmp]);const dpcPath=path.join(tmp,'units','scout_mj.dpc');if(!fs.existsSync(dpcPath))throw Error('Extracted scout_mj.dpc missing.');
 const dpc=fs.readFileSync(dpcPath),prep=JSON.parse(fs.readFileSync(prepFile,'utf8')),tr=JSON.parse(fs.readFileSync(transformFile,'utf8')),base=0x80018000;
 const transforms=(tr.transforms||[]).map(x=>({offset:x.offset,hex:'0x'+x.offset.toString(16),position:x.position,matrixFixed4096:x.matrixFixed4096,childCount:x.childCount}));
 const geom=(tr.geometryDescriptors||[]).map(x=>({part:x.part,role:x.role,descriptorOffset:x.descriptorOffset,descriptorHex:'0x'+x.descriptorOffset.toString(16),recordOffset:x.recordOffset,ownerOffset:x.ownerOffset}));
 const unique=new Map();for(const r of prep.records||[])for(const e of r.entries||[]){if(!unique.has(e.offset))unique.set(e.offset,{offset:parseInt(e.offset,16),hex:e.offset,sources:[]});unique.get(e.offset).sources.push({part:r.part,role:r.role,iteration:e.index});}
 const pointers=[];
 for(const rec of unique.values()){if(rec.offset<0||rec.offset+24>dpc.length)continue;for(let rel=0;rel<=20;rel+=4){const value=dpc.readUInt32LE(rec.offset+rel);if(value<base||value>=base+dpc.length)continue;const target=value-base,header=target+4<=dpc.length?{opcode:dpc[target],flags:dpc[target+1],classWord:dpc.readUInt16LE(target+2)}:null;
  pointers.push({sourceOffset:rec.hex,sourceRelativeOffset:rel,value:'0x'+value.toString(16),targetOffset:'0x'+target.toString(16),targetHeader:header,sourceUses:rec.sources,geometryDescriptorMatches:geom.filter(x=>x.descriptorOffset===target),transformMatches:transforms.filter(x=>x.offset===target),targetInsidePreparationRecord:unique.has('0x'+target.toString(16))});
 }}
 const inbound=new Map();for(let off=0;off+4<=dpc.length;off+=4){const v=dpc.readUInt32LE(off);if(v>=base&&v<base+dpc.length){const t=v-base;if(pointers.some(p=>parseInt(p.targetOffset,16)===t)){if(!inbound.has(t))inbound.set(t,[]);inbound.get(t).push('0x'+off.toString(16));}}}
 const targetSummary=[...new Set(pointers.map(p=>p.targetOffset))].map(t=>({targetOffset:t,refs:pointers.filter(p=>p.targetOffset===t).length,sourceOffsets:[...new Set(pointers.filter(p=>p.targetOffset===t).map(p=>p.sourceOffset))],allDpcInboundFields:(inbound.get(parseInt(t,16))||[]),geometryDescriptorMatches:pointers.filter(p=>p.targetOffset===t).flatMap(p=>p.geometryDescriptorMatches),transformMatches:pointers.filter(p=>p.targetOffset===t).flatMap(p=>p.transformMatches)}));
 const result={title:'OUTWARS SCOUT PREPARATION RECORD POINTER MAP',version:'1.0.0',dpcBytes:dpc.length,virtualBase:'0x'+base.toString(16),uniquePreparationRecords:unique.size,recordPointerCount:pointers.length,uniquePointerTargets:targetSummary.length,pointers,targetSummary,knownGeometryDescriptors:geom,knownOpcode5Transforms:transforms,interpretation:'A pointer match establishes a DPC-relative reference only. A target header is a raw four-byte interpretation and does not, by itself, prove that the target is an opcode record or transform.'};
 fs.writeFileSync(path.join(ad,'preparation-record-pointers.json'),JSON.stringify(pointers,null,2));fs.writeFileSync(path.join(ad,'preparation-pointer-targets.json'),JSON.stringify(targetSummary,null,2));fs.writeFileSync(path.join(out,'SCOUT-PREPARATION-POINTER-MAP.json'),JSON.stringify(result,null,2)+'\n');
 const md=['# Scout preparation-record pointer map','','Unique physical preparation records: '+unique.size,'DPC-relative pointer fields: '+pointers.length,'Unique pointer targets: '+targetSummary.length,'','','## Pointer targets','','| Target offset | Ref count | Source record offsets | Transform match | Geometry descriptor match |','|---|---:|---|---|---|',...targetSummary.map(t=>'| '+t.targetOffset+' | '+t.refs+' | '+t.sourceOffsets.join(', ')+' | '+(t.transformMatches.length?'yes':'no')+' | '+(t.geometryDescriptorMatches.length?'yes':'no')+' |'),'','## Full pointer evidence',''];
 for(const p of pointers)md.push('- '+p.sourceOffset+' + '+p.sourceRelativeOffset.toString(16)+' → '+p.targetOffset+' (value '+p.value+'); header '+JSON.stringify(p.targetHeader)+'; uses '+p.sourceUses.map(s=>'P'+s.part+' '+s.role+' #'+s.iteration).join(', '));
 md.push('','## Interpretation limit','',result.interpretation);fs.writeFileSync(path.join(out,'SCOUT-PREPARATION-POINTER-MAP.md'),md.join('\n')+'\n');
 const z=spawnSync('zip',['-qr',out+'.zip','.'],{cwd:out});if(z.status!==0)throw Error('ZIP packaging failed');console.log(JSON.stringify({uniquePreparationRecords:unique.size,recordPointerCount:pointers.length,uniquePointerTargets:targetSummary.length,bundle:out+'.zip'},null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
