#!/usr/bin/env node
/**
 * OUTWARS SCOUT TRANSFORM-ATTACHED DESCRIPTOR AUDIT v1.1.0
 * Extracts the descriptor arrays attached to Opcode-5 transform nodes.
 * These are separate from the 16 descriptors discovered in the part graph.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const a=process.argv.slice(2);let ff=null,bridgeFile=null,outArg=null;
for(let i=0;i<a.length;i++){if(a[i].startsWith('--'))throw Error('Unknown option '+a[i]);if(!ff)ff=a[i];else if(!bridgeFile)bridgeFile=a[i];else if(!outArg)outArg=a[i];else throw Error('Unexpected argument '+a[i]);}
if(!ff||!bridgeFile)throw Error('Usage: node tools/scout-transform-attached-descriptor-audit.mjs <units.ff|scout_mj.dpc> scout-bridge/analysis/transform-attachment-audit.json [out-dir]');
ff=path.resolve(ff);bridgeFile=path.resolve(bridgeFile);if(!fs.existsSync(ff)||!fs.existsSync(bridgeFile))throw Error('DPC/units.ff or transform-attachment-audit.json missing.');
const here=path.dirname(new URL(import.meta.url).pathname),repo=path.resolve(here,'..');let out=path.resolve(outArg||'scout-transform-attached-descriptor-audit');const rel=path.relative(repo,out);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Output must be inside repository.');
if(fs.existsSync(out)&&fs.readdirSync(out).length){const base=out;let n=2;do{out=base+'-'+n++;}while(fs.existsSync(out)&&fs.readdirSync(out).length);}
const ad=path.join(out,'analysis');fs.mkdirSync(ad,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'outwars-scout-xdesc-'));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:repo,encoding:'utf8',maxBuffer:512*1024*1024});if(r.status!==0)throw Error(cmd+' failed: '+(r.error?.message||r.stderr||r.status));return r.stdout||'';};
try{
 let dpcPath=ff;if(path.extname(ff).toLowerCase()==='.ff'){run(process.execPath,[path.join(here,'extract-ff-resources.mjs'),ff,'--out',tmp]);dpcPath=path.join(tmp,'units','scout_mj.dpc');}if(!fs.existsSync(dpcPath))throw Error('DPC input missing.');
 const dpc=fs.readFileSync(dpcPath),bridge=JSON.parse(fs.readFileSync(bridgeFile,'utf8'));
 // The header's +0x0c value is the relocation base for DPC pointer fields.
 // The mapped image/load base is 0x1c40 bytes earlier; do not resolve pointers against it.
 const relocationBase=dpc.readUInt32LE(12),virtualBase=relocationBase-0x1c40;
 const ptrToOffset=v=>{v=v>>>0;return v>=relocationBase&&v<relocationBase+dpc.length?v-relocationBase:null;};
 const u32hex=v=>'0x'+(v>>>0).toString(16).padStart(8,'0');
 const geometry=(bridge.geometryDescriptors||[]).map(x=>parseInt(x.descriptorOffset,16)),transforms=(bridge.transforms||[]).map(x=>parseInt(x.offset,16));
 const attachments=bridge.summary?.opcode2AttachmentsInTransformChildren||[];if(!attachments.length)throw Error('Bridge report contains no Opcode-2 transform-child attachments.');
 const reports=[];
 for(const a of attachments){
  const descriptorOffset=parseInt(a.descriptor,16),transformOffset=parseInt(a.transform,16),attachmentOffset=parseInt(a.attachment,16);
  if(!Number.isInteger(descriptorOffset)||descriptorOffset<0||descriptorOffset+32>dpc.length){reports.push({transform:a.transform,attachment:a.attachment,descriptor:a.descriptor,error:'descriptor outside DPC'});continue;}
  const words=Array.from({length:8},(_,i)=>dpc.readUInt32LE(descriptorOffset+i*4)),opcode=words[0]&255,arrayPointer=words[3],count=words[4],arrayOffset=ptrToOffset(arrayPointer),iterations=[];let cursor=arrayOffset;
  if(opcode===0&&arrayOffset!==null&&count<=4096){
   for(let i=0;i<count;i++){
    if(cursor===null||cursor<0||cursor+24>dpc.length){iterations.push({iteration:i,offset:cursor===null?null:'0x'+cursor.toString(16),error:'record outside DPC'});break;}
    const stride=dpc.readUInt8(cursor+2),pointers=[];
    for(let rel=0;rel<=20;rel+=4){const value=dpc.readUInt32LE(cursor+rel),target=ptrToOffset(value);if(target!==null)pointers.push({relativeOffset:rel,value:u32hex(value),targetOffset:'0x'+target.toString(16),matchesPartGeometryDescriptor:geometry.includes(target),matchesOpcode5Transform:transforms.includes(target)});}
    iterations.push({iteration:i,offset:'0x'+cursor.toString(16),strideUnits:stride,advanceBytes:stride*4,dword14Before:u32hex(dpc.readUInt32LE(cursor+20)),byte15Before:dpc.readUInt8(cursor+21),raw24:dpc.subarray(cursor,cursor+24).toString('hex'),pointers});
    cursor+=stride*4;
   }
  }
  reports.push({transform:a.transform,attachment:a.attachment,descriptor:a.descriptor,descriptorOffset:'0x'+descriptorOffset.toString(16),descriptorDwords:words.map(u32hex),opcode,descriptorFlags:(words[0]>>>8)&255,descriptorClassWord:words[0]>>>16,arrayPointer:u32hex(arrayPointer),arrayOffset:arrayOffset===null?null:'0x'+arrayOffset.toString(16),count,descriptorPlus4Target:ptrToOffset(words[1])===null?null:'0x'+ptrToOffset(words[1]).toString(16),iterations,skippedReason:opcode!==0?'descriptor opcode is not zero':arrayOffset===null?'array pointer is outside DPC':undefined});
 }
 const result={title:'OUTWARS SCOUT TRANSFORM-ATTACHED DESCRIPTOR AUDIT',version:'1.1.0',dpcBytes:dpc.length,virtualBase:'0x'+virtualBase.toString(16),relocationBase:'0x'+relocationBase.toString(16),pointerResolution:'rawPointer - DPC header relocation base at file offset 0x0c',transformAttachmentCount:attachments.length,opcode0DescriptorCount:reports.filter(x=>x.opcode===0).length,nonOpcode0DescriptorCount:reports.filter(x=>x.opcode!==undefined&&x.opcode!==0).length,processedIterations:reports.reduce((s,x)=>s+(x.iterations?.length||0),0),reports,interpretation:'These descriptors are reached as Opcode-2 attachments beneath Opcode-5 transform nodes. Their opcode byte, array pointer, count, and record contents are decoded independently of the 16 part-graph descriptors. A structural attachment does not by itself prove that the referenced records are vertex geometry; downstream consumers still determine their semantic role.'};
 fs.writeFileSync(path.join(ad,'transform-attached-descriptor-arrays.json'),JSON.stringify(reports,null,2));fs.writeFileSync(path.join(out,'SCOUT-TRANSFORM-ATTACHED-DESCRIPTOR-AUDIT.json'),JSON.stringify(result,null,2)+'\n');
 const md=['# Scout transform-attached descriptor audit','','Transform-child Opcode-2 attachments: '+attachments.length,'DPC image/load base: 0x'+virtualBase.toString(16),'DPC pointer relocation base (header +0x0c): 0x'+relocationBase.toString(16),'Pointer resolution: raw pointer minus relocation base (not image/load base)',''Opcode-0 child descriptors: '+result.opcode0DescriptorCount,'Other opcode descriptors: '+result.nonOpcode0DescriptorCount,'Decoded record iterations: '+result.processedIterations,''];
 for(const r of reports){md.push('## Transform '+r.transform+' — descriptor '+r.descriptor,'','Attachment: '+r.attachment,'Opcode: '+(r.opcode??'unavailable')+'; array: '+(r.arrayOffset||'unmapped')+'; count: '+(r.count??'—'));if(r.skippedReason)md.push('Skipped: '+r.skippedReason);if(r.iterations?.length){md.push('','| Iteration | Record | stride | +0x14 before | +0x15 before | DPC pointers |','|---:|---|---:|---|---:|---|',...r.iterations.map(x=>'| '+x.iteration+' | '+(x.offset||'—')+' | '+(x.strideUnits??'—')+' | '+(x.dword14Before||'—')+' | '+(x.byte15Before??'—')+' | '+(x.pointers||[]).map(p=>p.targetOffset).join(', ')+' |'));}}
 md.push('','## Interpretation limit','',result.interpretation);fs.writeFileSync(path.join(out,'SCOUT-TRANSFORM-ATTACHED-DESCRIPTOR-AUDIT.md'),md.join('\n')+'\n');
 const z=spawnSync('zip',['-qr',out+'.zip','.'],{cwd:out});if(z.status!==0)throw Error('ZIP packaging failed');console.log(JSON.stringify({attachments:attachments.length,opcode0Descriptors:result.opcode0DescriptorCount,nonOpcode0Descriptors:result.nonOpcode0DescriptorCount,decodedIterations:result.processedIterations,bundle:out+'.zip'},null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
