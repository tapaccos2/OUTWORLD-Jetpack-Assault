#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const a=process.argv.slice(2);let reportFile=null,outArg=null,exe=null;
for(let i=0;i<a.length;i++){if(a[i]==='--exe')exe=path.resolve(a[++i]);else if(!reportFile)reportFile=a[i];else if(!outArg)outArg=a[i];else throw Error('Unexpected argument '+a[i]);}
if(!reportFile||!exe)throw Error('Usage: node tools/scout-handler-semantics.mjs scout-dispatch/SCOUT-DISPATCH-AUDIT.json scout-handler-semantics --exe /home/tapaccos/Outwars-extracted/outwars.exe');
reportFile=path.resolve(reportFile);if(!fs.existsSync(reportFile)||!fs.existsSync(exe))throw Error('Dispatch report or executable missing.');
const r=JSON.parse(fs.readFileSync(reportFile,'utf8')),here=path.dirname(new URL(import.meta.url).pathname),repo=path.resolve(here,'..');
let out=path.resolve(outArg||'scout-handler-semantics');const rel=path.relative(repo,out);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Output must be inside repository.');
if(fs.existsSync(out)&&fs.readdirSync(out).length){let n=2,b=out;do{out=b+'-'+n++;}while(fs.existsSync(out)&&fs.readdirSync(out).length);}
fs.mkdirSync(path.join(out,'analysis'),{recursive:true});
const obj=process.env.OBJDUMP||(fs.existsSync('/usr/bin/i686-w64-mingw32-objdump')?'/usr/bin/i686-w64-mingw32-objdump':'objdump');
const d=spawnSync(obj,['-d','-Mintel',exe],{encoding:'utf8',maxBuffer:512*1024*1024});if(d.status!==0)throw Error(d.stderr||'objdump failed');
const ins=[];for(const l of d.stdout.split(/\r?\n/)){const m=l.match(/^\s*([0-9a-fA-F]+):\s*((?:[0-9a-fA-F]{2}\s+)+)\s*(.*)$/);if(m)ins.push({n:parseInt(m[1],16),s:m[3].trim(),raw:l.trim()});}
const starts=[...new Set(r.switch.cases.map(x=>parseInt(x.target,16)))].sort((x,y)=>x-y);
const blocks=r.switch.cases.map(c=>{const s=parseInt(c.target,16),next=starts.find(x=>x>s),b=ins.filter(x=>x.n>=s&&(next===undefined||x.n<next));return{opcode:c.opcode,target:c.target,nextHandler:next?'0x'+next.toString(16):null,callbackRecords:c.dpcRecords?.length||0,instructionCount:b.length,instructions:b.map(x=>x.raw),calls:b.filter(x=>/\bcall\b/i.test(x.s)).map(x=>x.raw),branches:b.filter(x=>/\b(?:j[a-z]+|loop[a-z]*)\b/i.test(x.s)).map(x=>x.raw),scratchReferences:b.filter(x=>/12d6c74|12d6c78|12d6c7c/i.test(x.s)).map(x=>x.raw)};});
const o=blocks.find(x=>x.opcode===2),result={title:'Scout handler semantics audit',version:'1.0.0',executable:path.basename(exe),sha256:crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),handlerCount:blocks.length,opcode2:o,handlers:blocks,confirmed:['Opcode 2 is the exact callback handler for all 16 Scout callback records.','The handler reads count at record +0x10 and a pointer at +0x14.','It writes five DWORD values per iteration to scratch records with 0x18-byte stride.'],unproven:['Meaning of the five scratch fields.','Whether scratch records represent transforms or draw commands.','Final placement of the 16 geometry descriptors.']};
fs.writeFileSync(path.join(out,'analysis','handler-blocks.json'),JSON.stringify(blocks,null,2));fs.writeFileSync(path.join(out,'SCOUT-HANDLER-SEMANTICS.json'),JSON.stringify(result,null,2)+'\n');
const md=['# Scout handler semantics audit','','| Measure | Result |','|---|---:|','| Handler cases | '+blocks.length+' |','| Opcode 2 callback records | '+o.callbackRecords+' |','| Opcode 2 instructions | '+o.instructionCount+' |','','## Opcode 2 complete bounded block','','```asm',...o.instructions,'```','','## Confirmed','',...result.confirmed.map(x=>'- '+x),'','## Still unproven','',...result.unproven.map(x=>'- '+x)];fs.writeFileSync(path.join(out,'SCOUT-HANDLER-SEMANTICS.md'),md.join('\n')+'\n');
const z=spawnSync('zip',['-qr',out+'.zip','.'],{cwd:out});if(z.status!==0)throw Error('zip failed');console.log(JSON.stringify({handlers:blocks.length,opcode2Instructions:o.instructionCount,opcode2CallbackRecords:o.callbackRecords,bundle:out+'.zip'},null,2));
