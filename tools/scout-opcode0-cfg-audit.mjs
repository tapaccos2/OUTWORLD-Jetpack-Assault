#!/usr/bin/env node
/**
 * OUTWARS SCOUT OPCODE-0 CONTROL-FLOW AUDIT v1.0.0
 * Uses instruction-address CFG traversal rather than linear address ranges.
 * Stops at other dispatch entries, records direct calls and follows the
 * reachable direct callees to a bounded depth.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const a=process.argv.slice(2);let dispatchFile=null,outArg=null,exe=null;
for(let i=0;i<a.length;i++){if(a[i]==='--exe'){if(!a[i+1])throw Error('--exe requires a path');exe=path.resolve(a[++i]);}else if(a[i].startsWith('--'))throw Error('Unknown option '+a[i]);else if(!dispatchFile)dispatchFile=a[i];else if(!outArg)outArg=a[i];else throw Error('Unexpected argument '+a[i]);}
if(!dispatchFile||!exe)throw Error('Usage: node tools/scout-opcode0-cfg-audit.mjs scout-dispatch/SCOUT-DISPATCH-AUDIT.json scout-opcode0-cfg-audit --exe /home/tapaccos/Outwars-extracted/outwars.exe');
dispatchFile=path.resolve(dispatchFile);if(!fs.existsSync(dispatchFile)||!fs.existsSync(exe))throw Error('Dispatch report or executable missing.');
const dispatch=JSON.parse(fs.readFileSync(dispatchFile,'utf8')),cases=dispatch.switch?.cases;if(!cases?.length)throw Error('No dispatch cases in report.');
const here=path.dirname(new URL(import.meta.url).pathname),repo=path.resolve(here,'..');let out=path.resolve(outArg||'scout-opcode0-cfg-audit');const rel=path.relative(repo,out);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Output must be inside repository.');
if(fs.existsSync(out)&&fs.readdirSync(out).length){const base=out;let n=2;do{out=base+'-'+n++;}while(fs.existsSync(out)&&fs.readdirSync(out).length);}
const ad=path.join(out,'analysis');fs.mkdirSync(ad,{recursive:true});
const obj=process.env.OBJDUMP||(fs.existsSync('/usr/bin/i686-w64-mingw32-objdump')?'/usr/bin/i686-w64-mingw32-objdump':'objdump'),d=spawnSync(obj,['-d','-Mintel',exe],{encoding:'utf8',maxBuffer:512*1024*1024});if(d.status!==0)throw Error(d.stderr||'objdump failed');
const ins=[];for(const line of d.stdout.split(/\r?\n/)){const m=line.match(/^\s*([0-9a-fA-F]+):\s*((?:[0-9a-fA-F]{2}\s+)+)\s*(.*)$/);if(m){const bytes=m[2].trim().split(/\s+/);ins.push({address:parseInt(m[1],16),length:bytes.length,text:m[3].trim(),raw:line.trim()});}}
const byAddress=new Map(ins.map(x=>[x.address,x])),dispatchStarts=new Set(cases.map(c=>parseInt(c.target,16))),opcode0=cases.find(c=>c.opcode===0);if(!opcode0)throw Error('Opcode 0 missing.');
const parseTarget=s=>{const m=s.match(/\b(?:call|jmp|j[a-z]+)\s+(?:SHORT\s+)?0x([0-9a-f]+)/i);return m?parseInt(m[1],16):null;};
function walk(start,maxNodes=6000){const queue=[start],seen=new Set(),calls=new Map(),edges=[];let stops={ret:0,dispatch:0,missing:0,limit:0};while(queue.length){const pc=queue.pop();if(seen.has(pc))continue;if(seen.size>=maxNodes){stops.limit++;break;}if(pc!==start&&dispatchStarts.has(pc)){stops.dispatch++;continue;}const x=byAddress.get(pc);if(!x){stops.missing++;continue;}seen.add(pc);const t=x.text.toLowerCase(),next=pc+x.length;
 if(/^ret/.test(t)){stops.ret++;continue;}
 if(/^call\b/.test(t)){const target=parseTarget(x.text);if(target!==null){if(!calls.has(target))calls.set(target,[]);calls.get(target).push(pc);}if(byAddress.has(next))queue.push(next);continue;}
 if(/^jmp\b/.test(t)){const target=parseTarget(x.text);if(target!==null){edges.push({from:pc,to:target,type:'jmp'});if(!dispatchStarts.has(target))queue.push(target);}continue;}
 if(/^j[a-z]+\b/.test(t)||/^loop[a-z]*\b/.test(t)){const target=parseTarget(x.text);if(target!==null){edges.push({from:pc,to:target,type:'conditional'});if(!dispatchStarts.has(target))queue.push(target);}if(byAddress.has(next))queue.push(next);continue;}
 if(byAddress.has(next))queue.push(next);else stops.missing++;
 }
 const ordered=[...seen].sort((x,y)=>x-y),body=ordered.map(pc=>byAddress.get(pc)),memory=[];
 for(const x of body){const re=/\b(?:BYTE|WORD|DWORD|QWORD|XMMWORD) PTR\s+([^,]+)/gi;let m;while((m=re.exec(x.text)))memory.push({address:'0x'+x.address.toString(16),operand:m[1],instruction:x.text});}
 return{entry:'0x'+start.toString(16),reachableInstructionCount:seen.size,termination:stops,instructions:body.map(x=>x.raw),directCalls:[...calls].map(([target,sites])=>({target:'0x'+target.toString(16),sites:sites.map(x=>'0x'+x.toString(16)),count:sites.length})),controlFlowEdges:edges.map(e=>({from:'0x'+e.from.toString(16),to:'0x'+e.to.toString(16),type:e.type})),memoryOperands:memory,reachableAddresses:ordered};
}
const root=walk(parseInt(opcode0.target,16)),callTargets=root.directCalls.map(x=>parseInt(x.target,16)),calleeReports=callTargets.map(t=>walk(t,12000));
const depth2Targets=[...new Set(calleeReports.flatMap(x=>x.directCalls.map(c=>parseInt(c.target,16))))].filter(t=>!callTargets.includes(t));
const depth2=depth2Targets.map(t=>walk(t,5000));
const refs=[];for(const x of ins){if(/\b(?:call|jmp)\s+0x[0-9a-f]+/i.test(x.text))continue;const hits=[...x.text.matchAll(/\b(?:ds:)?(0x[0-9a-f]{6,8})\b/gi)];if(hits.length)refs.push({address:'0x'+x.address.toString(16),instruction:x.text,absoluteOperands:hits.map(m=>m[1])});}
const result={title:'OUTWARS SCOUT OPCODE-0 CONTROL-FLOW AUDIT',version:'1.0.0',generatedAt:new Date().toISOString(),executable:{file:path.basename(exe),bytes:fs.statSync(exe).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),disassembler:obj},dispatch:{caseCount:cases.length,opcode0:opcode0.target,opcode0AliasCases:cases.filter(c=>c.target===opcode0.target).map(c=>c.opcode)},opcode0ControlFlow:root,firstLevelCallees:calleeReports,secondLevelCallees:depth2,notes:['Instruction reachability is determined by decoded instruction lengths and direct control-flow edges, not by a linear interval between jump-table targets.','Calls are recorded as edges and analyzed separately; callees are not merged into the caller CFG.','Traversal stops when it reaches another verified dispatch-table entry.','Indirect calls and indirect jumps are reported in the instruction listing but cannot be resolved by this static direct-edge walk.']};
fs.writeFileSync(path.join(ad,'opcode0-control-flow.json'),JSON.stringify(root,null,2));fs.writeFileSync(path.join(ad,'opcode0-first-level-callees.json'),JSON.stringify(calleeReports,null,2));fs.writeFileSync(path.join(ad,'opcode0-second-level-callees.json'),JSON.stringify(depth2,null,2));fs.writeFileSync(path.join(out,'SCOUT-OPCODE0-CFG-AUDIT.json'),JSON.stringify(result,null,2)+'\n');
const md=['# Scout Opcode 0 control-flow audit','','| Measure | Result |','|---|---:|','| Opcode 0 entry | '+opcode0.target+' |','| Reachable instructions | '+root.reachableInstructionCount+' |','| Direct callees | '+root.directCalls.length+' |','| Conditional/unconditional CFG edges | '+root.controlFlowEdges.length+' |','| First-level callee bodies | '+calleeReports.length+' |','| Second-level callee bodies | '+depth2.length+' |','','## Opcode 0 reachable control-flow body','','```asm',...root.instructions,'```','','## Direct call targets','',...root.directCalls.map(c=>'- '+c.target+' (calls: '+c.count+', sites: '+c.sites.join(', ')+')')];
for(const c of calleeReports){md.push('','## Callee '+c.entry,'','Reachable instructions: '+c.reachableInstructionCount,'Direct callees: '+c.directCalls.map(x=>x.target).join(', '),'','```asm',...c.instructions,'```');}
md.push('','## Analysis limitations','',...result.notes.map(x=>'- '+x));fs.writeFileSync(path.join(out,'SCOUT-OPCODE0-CFG-AUDIT.md'),md.join('\n')+'\n');
const z=spawnSync('zip',['-qr',out+'.zip','.'],{cwd:out});if(z.status!==0)throw Error('ZIP packaging failed');console.log(JSON.stringify({opcode0:opcode0.target,reachableInstructions:root.reachableInstructionCount,directCallees:root.directCalls.map(x=>x.target),firstLevelCallees:calleeReports.length,secondLevelCallees:depth2.length,bundle:out+'.zip'},null,2));
