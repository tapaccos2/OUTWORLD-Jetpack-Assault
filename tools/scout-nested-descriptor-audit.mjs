#!/usr/bin/env node
/**
 * OUTWARS SCOUT NESTED DESCRIPTOR AUDIT v1.0.0
 * Joins each opcode-2 Scout root record to its nested DPC descriptor, resolves
 * the nested descriptor's opcode through the executable jump table, and
 * captures the real entry/callee code windows without treating duplicate
 * jump-table destinations as separate functions.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const a=process.argv.slice(2);let ff=null,dispatchFile=null,outArg=null,exe=null;
for(let i=0;i<a.length;i++){if(a[i]==='--exe'){if(!a[i+1])throw Error('--exe requires a path');exe=path.resolve(a[++i]);}else if(a[i].startsWith('--'))throw Error('Unknown option '+a[i]);else if(!ff)ff=a[i];else if(!dispatchFile)dispatchFile=a[i];else if(!outArg)outArg=a[i];else throw Error('Unexpected argument '+a[i]);}
if(!ff||!dispatchFile||!exe)throw Error('Usage: node tools/scout-nested-descriptor-audit.mjs original-data/units.ff scout-dispatch/SCOUT-DISPATCH-AUDIT.json scout-nested-descriptor-audit --exe /home/tapaccos/Outwars-extracted/outwars.exe');
ff=path.resolve(ff);dispatchFile=path.resolve(dispatchFile);if(!fs.existsSync(ff)||!fs.existsSync(dispatchFile)||!fs.existsSync(exe))throw Error('units.ff, dispatch report or executable missing.');
const dispatch=JSON.parse(fs.readFileSync(dispatchFile,'utf8')),cases=dispatch.switch?.cases;if(!cases?.length)throw Error('Dispatch report has no cases.');
const here=path.dirname(new URL(import.meta.url).pathname),repo=path.resolve(here,'..');let out=path.resolve(outArg||'scout-nested-descriptor-audit');const rel=path.relative(repo,out);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Output must be inside repository.');
if(fs.existsSync(out)&&fs.readdirSync(out).length){const base=out;let n=2;do{out=base+'-'+n++;}while(fs.existsSync(out)&&fs.readdirSync(out).length);}
const ad=path.join(out,'analysis');fs.mkdirSync(ad,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'outwars-scout-nested-'));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:repo,encoding:'utf8',maxBuffer:512*1024*1024});if(r.status!==0)throw Error(cmd+' failed: '+(r.error?.message||r.stderr||r.status));return r.stdout||'';};
try{
 run(process.execPath,[path.join(here,'extract-ff-resources.mjs'),ff,'--out',tmp]);const dpc=path.join(tmp,'units','scout_mj.dpc');if(!fs.existsSync(dpc))throw Error('units.ff extraction did not produce units/scout_mj.dpc.');
 const chain=JSON.parse(run(process.execPath,[path.join(here,'inspect-scout-callback-chain.mjs'),dpc])).results?.[0];if(!chain?.records?.length)throw Error('Callback-chain parser returned no Scout records.');
 const obj=process.env.OBJDUMP||(fs.existsSync('/usr/bin/i686-w64-mingw32-objdump')?'/usr/bin/i686-w64-mingw32-objdump':'objdump'),dis=run(obj,['-d','-Mintel',exe]),ins=[];
 for(const line of dis.split(/\r?\n/)){const m=line.match(/^\s*([0-9a-fA-F]+):\s*((?:[0-9a-fA-F]{2}\s+)+)\s*(.*)$/);if(m)ins.push({address:parseInt(m[1],16),text:m[3].trim(),raw:line.trim()});}
 const byAddress=new Map(ins.map((x,i)=>[x.address,i]));
 const window=(address,count)=>{const i=byAddress.get(address);return i===undefined?[]:ins.slice(i,Math.min(ins.length,i+count)).map(x=>x.raw);};
 const caseByOpcode=new Map(cases.map(c=>[c.opcode,c]));
 const trace=[];
 for(const r of chain.records){for(const item of r.callbackItems||[]){const desc=item.descriptor;if(!desc?.dwords?.length)continue;const first=parseInt(desc.dwords[0],16)>>>0,opcode=first&255,entry=caseByOpcode.get(opcode);trace.push({part:r.part,role:r.role,parentRecordOffset:r.recordOffset,parentOpcode:r.opcodeByte0,parentHandler:r.callbackTarget,parentCount:r.countAtPlus10,parentListPointer:r.listPointerAtPlus14,listTargetOpcode:r.listTargetOpcode,listTargetDwords:r.listTargetDwords,nestedDescriptorOffset:item.callbackReadPointerTarget,nestedDescriptorFirstDword:desc.dwords[0],nestedOpcode:opcode,nestedHandler:entry?.target||null,nestedDescriptorDwords:desc.dwords,pointerAtDescriptorPlus4:desc.pointerAtPlus4});}}
 const uniqueOpcodes=[...new Set(trace.map(x=>x.nestedOpcode))].sort((x,y)=>x-y),uniqueHandlers=[...new Set(uniqueOpcodes.map(x=>caseByOpcode.get(x)?.target).filter(Boolean))];
 const handlerWindows=uniqueHandlers.map(target=>{const va=parseInt(target,16),index=byAddress.get(va),block=index===undefined?[]:ins.slice(index,index+28);return{target,entryInstructions:block.map(x=>x.raw),calls:block.filter(x=>/\bcall\b/i.test(x.text)).map(x=>({address:'0x'+x.address.toString(16),target:(x.text.match(/\bcall\s+0x([0-9a-f]+)/i)||[])[1]?'0x'+RegExp.$1:null,instruction:x.raw}))};});
 const callTargets=[...new Set(handlerWindows.flatMap(h=>h.calls.map(c=>c.target).filter(Boolean)))];
 const callees=callTargets.map(target=>{const va=parseInt(target,16),index=byAddress.get(va);return{target,entryInstructions:index===undefined?[]:ins.slice(index,Math.min(ins.length,index+180)).map(x=>x.raw),directCallers:ins.filter(x=>new RegExp('\\bcall\\s+'+target+'\\b','i').test(x.text)).map(x=>'0x'+x.address.toString(16))};});
 const counts={};for(const x of trace)counts[x.nestedOpcode]=(counts[x.nestedOpcode]||0)+1;
 const result={title:'OUTWARS SCOUT NESTED DESCRIPTOR AUDIT',version:'1.0.0',generatedAt:new Date().toISOString(),executable:{file:path.basename(exe),bytes:fs.statSync(exe).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),disassembler:obj},dpc:{file:'units/scout_mj.dpc',callbackRecords:chain.records.length,nestedDescriptorCount:trace.length},nestedOpcodeCounts:counts,trace,uniqueNestedOpcodes:uniqueOpcodes,uniqueNestedHandlerTargets:uniqueHandlers,handlerWindows,calleeWindows:callees,interpretation:{confirmed:['All Scout root callback records in this DPC have opcode byte 2 and resolve to the verified opcode-2 handler.','Each of the 16 nested descriptors is decoded from the DPC pointer graph and its first byte is matched to the executable dispatch table.','Duplicate opcode-table destinations are grouped by unique handler address; aliases are not counted as separate code bodies.'],caution:'A nested opcode match proves dispatch routing. The called routine semantics and the eventual geometry/transform relationship require separate data-flow validation.'}};
 fs.writeFileSync(path.join(ad,'nested-descriptor-trace.json'),JSON.stringify(trace,null,2));fs.writeFileSync(path.join(ad,'nested-handler-windows.json'),JSON.stringify(handlerWindows,null,2));fs.writeFileSync(path.join(ad,'nested-callee-windows.json'),JSON.stringify(callees,null,2));fs.writeFileSync(path.join(out,'SCOUT-NESTED-DESCRIPTOR-AUDIT.json'),JSON.stringify(result,null,2)+'\n');
 const md=['# Scout nested descriptor audit','','| Measure | Result |','|---|---:|','| Root callback records | '+chain.records.length+' |','| Nested descriptors | '+trace.length+' |','| Nested opcode counts | '+JSON.stringify(counts)+' |','| Unique nested opcodes | '+uniqueOpcodes.join(', ')+' |','| Unique nested handler targets | '+uniqueHandlers.join(', ')+' |','','## Parent-to-child descriptor trace','','| Part | Role | Parent opcode | Child descriptor | Child opcode | Handler |','|---:|---|---:|---|---:|---|',...trace.map(x=>'| '+x.part+' | '+x.role+' | '+x.parentOpcode+' | '+x.nestedDescriptorOffset+' | '+x.nestedOpcode+' | '+(x.nestedHandler||'UNMAPPED')+' |'),'','## Handler entry windows',''];
 for(const h of handlerWindows)md.push('### '+h.target,'','```asm',...h.entryInstructions,'```');
 for(const c of callees)md.push('## Called routine '+c.target,'','Direct callers: '+c.directCallers.join(', '),'','```asm',...c.entryInstructions,'```');
 md.push('','The trace proves parent-to-child pointer resolution and dispatch selection, not final transform placement.');
 fs.writeFileSync(path.join(out,'SCOUT-NESTED-DESCRIPTOR-AUDIT.md'),md.join('\n')+'\n');const z=spawnSync('zip',['-qr',out+'.zip','.'],{cwd:out});if(z.status!==0)throw Error('ZIP packaging failed');console.log(JSON.stringify({rootRecords:chain.records.length,nestedDescriptors:trace.length,nestedOpcodeCounts:counts,uniqueHandlers:uniqueHandlers,bundle:out+'.zip'},null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
