#!/usr/bin/env node
/**
 * OUTWARS SCOUT DISPATCH TABLE AUDIT v1.0.0
 * Decodes the executable opcode switch table and matches its case targets
 * against callback addresses in scout_mj.dpc. It avoids false function
 * boundaries caused by stripped PE symbols.
 *
 * Usage:
 * node tools/scout-dispatch-audit.mjs original-data/units.ff scout-dispatch --exe /home/tapaccos/Outwars-extracted/outwars.exe
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'..'),argv=process.argv.slice(2);
let input=null,outArg=null,exe=null;
for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--exe'){if(!argv[i+1])throw new Error('--exe requires outwars.exe');exe=path.resolve(argv[++i]);}else if(a.startsWith('--'))throw new Error('Unknown option: '+a);else if(input===null)input=a;else if(outArg===null)outArg=a;else throw new Error('Unexpected argument: '+a);}
if(!input||!exe){console.error('Usage: node tools/scout-dispatch-audit.mjs <units.ff|scout_mj.dpc> <out-dir> --exe <outwars.exe>');process.exit(2);}
input=path.resolve(input);exe=path.resolve(exe);if(!fs.existsSync(input))throw new Error('Input not found: '+input);if(!fs.existsSync(exe))throw new Error('Executable not found: '+exe);
let out=path.resolve(outArg||'scout-dispatch');const rel=path.relative(repo,out);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Output must be inside repository.');
if(fs.existsSync(out)&&fs.readdirSync(out).length){const requested=out;let n=2;do{out=requested+'-'+n++;}while(fs.existsSync(out)&&fs.readdirSync(out).length);console.log('Preserving old output; writing to '+out);}
fs.mkdirSync(out,{recursive:true});const ad=path.join(out,'analysis');fs.mkdirSync(ad,{recursive:true});
const run=(label,cmd,args)=>{console.log('['+label+']');const r=spawnSync(cmd,args,{cwd:repo,encoding:'utf8',maxBuffer:512*1024*1024});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)throw new Error(label+' failed: '+(r.error?.message||r.stderr||r.status));return r.stdout||'';};
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),hx=n=>'0x'+Number(n).toString(16);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'outwars-scout-dispatch-'));
try{
 let dpc=input;if(path.extname(input).toLowerCase()==='.ff'){run('validated FF extraction',process.execPath,[path.join(here,'extract-ff-resources.mjs'),input,'--out',temp]);dpc=path.join(temp,'units','scout_mj.dpc');}
 if(!fs.existsSync(dpc))throw new Error('scout_mj.dpc not found after extraction.');
 const db=fs.readFileSync(dpc);if(db.length<40||db.toString('ascii',0,4)!=='DCPM'||db[4]!==0x43)throw new Error('Expected DCPMC v0x43.');
 const callbackText=run('DPC callback-chain decode',process.execPath,[path.join(here,'inspect-scout-callback-chain.mjs'),dpc]),callbackRecords=JSON.parse(callbackText).results?.[0]?.records||[];
 const callbackTargets=[...new Set(callbackRecords.map(r=>parseInt(r.callbackTarget,16)).filter(Number.isFinite))].sort((a,b)=>a-b);
 const eb=fs.readFileSync(exe);if(eb.toString('ascii',0,2)!=='MZ')throw new Error('Executable is not an MZ/PE file.');
 const pe=eb.readUInt32LE(0x3c);if(eb.toString('ascii',pe,pe+4)!=='PE\0\0')throw new Error('Invalid PE signature.');
 const nsec=eb.readUInt16LE(pe+6),optsize=eb.readUInt16LE(pe+20),opt=pe+24,magic=eb.readUInt16LE(opt);if(magic!==0x10b)throw new Error('Expected PE32 optional header.');
 const imageBase=eb.readUInt32LE(opt+28),st=opt+optsize,sections=[];
 for(let i=0;i<nsec;i++){const o=st+i*40;sections.push({name:eb.toString('ascii',o,o+8).replace(/\0.*$/,''),vsize:eb.readUInt32LE(o+8),rva:eb.readUInt32LE(o+12),rawSize:eb.readUInt32LE(o+16),raw:eb.readUInt32LE(o+20),flags:eb.readUInt32LE(o+36)});}
 const vaToRaw=va=>{const rva=va-imageBase,s=sections.find(x=>rva>=x.rva&&rva<x.rva+Math.max(x.vsize,x.rawSize));if(!s)return null;const delta=rva-s.rva;if(delta>=s.rawSize)return null;return{offset:s.raw+delta,section:s.name,executable:!!(s.flags&0x20000000)};};
 const objdump=process.env.OBJDUMP||(fs.existsSync('/usr/bin/i686-w64-mingw32-objdump')?'/usr/bin/i686-w64-mingw32-objdump':'objdump');
 const dis=run('executable disassembly',objdump,['-d','-Mintel',exe]),instructions=[];
 for(const line of dis.split(/\r?\n/)){const m=line.match(/^\s*([0-9a-fA-F]+):\s*((?:[0-9a-fA-F]{2}\s+)+)\s*(.*)$/);if(m)instructions.push({address:parseInt(m[1],16),text:m[3].trim(),raw:line.trim()});}
 const candidates=[];
 for(let i=0;i<instructions.length;i++){const ins=instructions[i];if(!/^jmp\b/i.test(ins.text))continue;const tm=ins.text.match(/\[[a-z]{2,3}\*4\+0x([0-9a-f]+)\]/i);if(!tm)continue;let max=null,cmp=null;for(let j=Math.max(0,i-20);j<i;j++){const m=instructions[j].text.match(/\bcmp\s+(?:al|eax),\s*0x([0-9a-f]+)/i);if(m){max=parseInt(m[1],16);cmp=instructions[j].address;}}if(max!==null)candidates.push({jumpAddress:ins.address,tableVA:parseInt(tm[1],16),maxOpcode:max,compareAddress:cmp,jumpInstruction:ins.raw});}
 if(!candidates.length)throw new Error('No indexed DWORD jump table with a preceding opcode comparison found.');
 const sw=candidates.sort((a,b)=>Math.abs(a.jumpAddress-0x4e04c5)-Math.abs(b.jumpAddress-0x4e04c5))[0],tm=vaToRaw(sw.tableVA);if(!tm)throw new Error('Jump table VA '+hx(sw.tableVA)+' does not map to PE raw data.');
 const count=sw.maxOpcode+1;if(tm.offset+count*4>eb.length)throw new Error('Jump table extends beyond executable.');
 const cases=[];
 for(let i=0;i<count;i++){const target=eb.readUInt32LE(tm.offset+i*4),m=vaToRaw(target);cases.push({opcode:i,entryVA:hx(sw.tableVA+i*4),targetVA:target,target:hx(target),executableTarget:!!m?.executable,targetSection:m?.section||null,matchingDpcCallback:callbackTargets.includes(target)});}
 const byTarget=new Map();for(const r of callbackRecords){const t=parseInt(r.callbackTarget,16);if(!byTarget.has(t))byTarget.set(t,[]);byTarget.get(t).push({part:r.part,role:r.role,recordOffset:r.recordOffset,opcodeByte0:r.opcodeByte0,countAtPlus10:r.countAtPlus10,descriptorTargets:(r.callbackItems||[]).map(x=>x.callbackReadPointerTarget)});}
 for(const c of cases)c.dpcRecords=byTarget.get(c.targetVA)||[];
 const windows=cases.map(c=>{const i=instructions.findIndex(x=>x.address===c.targetVA);return{...c,disassemblyFound:i>=0,instructions:i<0?[]:instructions.slice(i,i+28).map(x=>x.raw)};});
 const globals=[0x12d6c74,0x12d6c78,0x12d6c7c],scratchRefs=instructions.filter(x=>globals.some(g=>x.text.toLowerCase().includes(hx(g))));
 const scratch=scratchRefs.map(ins=>{const nearest=[...cases].sort((a,b)=>Math.abs(ins.address-a.targetVA)-Math.abs(ins.address-b.targetVA))[0];return{address:hx(ins.address),instruction:ins.text,nearestCase:nearest?{opcode:nearest.opcode,target:nearest.target,distance:Math.abs(ins.address-nearest.targetVA)}:null};});
 const matches=cases.filter(c=>c.dpcRecords.length),unmatched=callbackTargets.filter(t=>!cases.some(c=>c.targetVA===t));
 const report={title:'OUTWARS SCOUT OPCODE DISPATCH AUDIT',version:'1.0.0',generatedAt:new Date().toISOString(),
  executable:{file:path.basename(exe),bytes:eb.length,sha256:sha(exe),imageBase:hx(imageBase),disassembler:objdump},
  dpc:{file:'scout_mj.dpc',bytes:db.length,sha256:sha(dpc),callbackRecordCount:callbackRecords.length,uniqueCallbackTargets:callbackTargets.map(hx)},
  switch:{jumpAddress:hx(sw.jumpAddress),compareAddress:hx(sw.compareAddress),maxOpcode:sw.maxOpcode,caseCount:count,tableVA:hx(sw.tableVA),tableFileOffset:tm.offset,tableSection:tm.section,jumpInstruction:sw.jumpInstruction,cases},
  mapping:{matchedCases:matches.length,unmatchedDpcCallbackTargets:unmatched.map(hx),matchedCaseRecords:matches.map(c=>({opcode:c.opcode,target:c.target,records:c.dpcRecords}))},
  scratch:{globals:globals.map(hx),referenceCount:scratchRefs.length,references:scratch},
  conclusion:'The switch table is read directly from PE bytes and matched against exact callback addresses in the DPC. Exact address matches establish opcode dispatch routing only; they do not by themselves prove descriptor interpretation or final rendering.'
 };
 fs.writeFileSync(path.join(ad,'dispatch-table.json'),JSON.stringify(report.switch,null,2));
 fs.writeFileSync(path.join(ad,'dispatch-case-windows.json'),JSON.stringify(windows,null,2));
 fs.writeFileSync(path.join(ad,'callback-dispatch-joins.json'),JSON.stringify(report.mapping,null,2));
 fs.writeFileSync(path.join(ad,'scratch-global-xrefs.json'),JSON.stringify(report.scratch,null,2));
 fs.writeFileSync(path.join(out,'SCOUT-DISPATCH-AUDIT.json'),JSON.stringify(report,null,2)+'\n');
 const md=['# Scout opcode dispatch audit','','| Measure | Result |','|---|---:|','| Switch cases | '+count+' |','| DPC callback records | '+callbackRecords.length+' |','| Unique DPC callback targets | '+callbackTargets.length+' |','| Exact callback targets matched to switch cases | '+matches.length+' |','| Scratch-global instruction references | '+scratchRefs.length+' |','','## Opcode-to-handler map','','| Opcode | Handler | DPC records |','|---:|---|---:|',...cases.map(c=>'| '+c.opcode+' | '+c.target+' | '+c.dpcRecords.length+' |'),'','## Unmatched DPC callback targets','',...(unmatched.length?unmatched.map(x=>'- '+hx(x)):['- None']),'','## Scratch-table references','',...scratch.map(x=>'- '+x.address+' '+x.instruction+' (nearest case '+(x.nearestCase?.opcode??'none')+')'),'','Exact address matches establish dispatch routing only. Handler data semantics and final mesh placement remain separate validation steps.'];
 fs.writeFileSync(path.join(out,'SCOUT-DISPATCH-AUDIT.md'),md.join('\n')+'\n');
 const zip=out+'.zip',z=spawnSync('zip',['-qr',zip,'.'],{cwd:out,encoding:'utf8',maxBuffer:16*1024*1024});if(z.status!==0)throw new Error('ZIP packaging failed: '+(z.stderr||z.stdout));
 console.log('\nSCOUT DISPATCH AUDIT COMPLETE');console.log(JSON.stringify({switchCases:count,callbackRecords:callbackRecords.length,matchedCases:matches.length,unmatchedTargets:unmatched.length,scratchReferences:scratchRefs.length},null,2));console.log('Report: '+path.join(out,'SCOUT-DISPATCH-AUDIT.md'));console.log('Bundle: '+zip);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
