#!/usr/bin/env node
/**
 * OUTWARS SCOUT DESCRIPTOR PREPARATION AUDIT v1.0.0
 * Correlates routine 0x4e59c8 with all 16 nested Scout descriptors and
 * decodes the variable-stride records it mutates.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const a=process.argv.slice(2);let ff=null,outArg=null,exe=null;
for(let i=0;i<a.length;i++){if(a[i]==='--exe'){if(!a[i+1])throw Error('--exe requires path');exe=path.resolve(a[++i]);}else if(a[i].startsWith('--'))throw Error('Unknown option '+a[i]);else if(!ff)ff=a[i];else if(!outArg)outArg=a[i];else throw Error('Unexpected argument '+a[i]);}
if(!ff||!exe)throw Error('Usage: node tools/scout-descriptor-preparation-audit.mjs original-data/units.ff scout-descriptor-preparation-audit --exe /home/tapaccos/Outwars-extracted/outwars.exe');
ff=path.resolve(ff);if(!fs.existsSync(ff)||!fs.existsSync(exe))throw Error('units.ff or executable missing.');
const here=path.dirname(new URL(import.meta.url).pathname),repo=path.resolve(here,'..');let out=path.resolve(outArg||'scout-descriptor-preparation-audit');const rel=path.relative(repo,out);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Output must be inside repository.');
if(fs.existsSync(out)&&fs.readdirSync(out).length){const base=out;let n=2;do{out=base+'-'+n++;}while(fs.existsSync(out)&&fs.readdirSync(out).length);}
const ad=path.join(out,'analysis');fs.mkdirSync(ad,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'outwars-scout-prep-'));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:repo,encoding:'utf8',maxBuffer:512*1024*1024});if(r.status!==0)throw Error(cmd+' failed: '+(r.error?.message||r.stderr||r.status));return r.stdout||'';};
try{
 run(process.execPath,[path.join(here,'extract-ff-resources.mjs'),ff,'--out',tmp]);const dpcPath=path.join(tmp,'units','scout_mj.dpc');if(!fs.existsSync(dpcPath))throw Error('Could not find extracted units/scout_mj.dpc.');const dpc=fs.readFileSync(dpcPath);
 const chain=JSON.parse(run(process.execPath,[path.join(here,'inspect-scout-callback-chain.mjs'),dpcPath])).results?.[0];if(!chain?.records?.length)throw Error('Callback parser returned no records.');
 const obj=process.env.OBJDUMP||(fs.existsSync('/usr/bin/i686-w64-mingw32-objdump')?'/usr/bin/i686-w64-mingw32-objdump':'objdump'),dis=run(obj,['-d','-Mintel',exe]),ins=[];
 for(const line of dis.split(/\r?\n/)){const m=line.match(/^\s*([0-9a-fA-F]+):\s*((?:[0-9a-fA-F]{2}\s+)+)\s*(.*)$/);if(m)ins.push({address:parseInt(m[1],16),len:m[2].trim().split(/\s+/).length,text:m[3].trim(),raw:line.trim()});}
 const by=new Map(ins.map((x,i)=>[x.address,i])),start=0x4e59c8,si=by.get(start);if(si===undefined)throw Error('Preparation routine 0x4e59c8 not found in disassembly.');
 const body=[];for(let i=si;i<ins.length&&i<si+120;i++){body.push(ins[i]);if(/^ret\b/i.test(ins[i].text))break;}
 const refs=ins.filter(x=>x.text.toLowerCase().includes('0x12d7370')).map(x=>x.raw);
 const dword=(off)=>dpc.readUInt32LE(off),byte=(off)=>dpc.readUInt8(off),u32hex=n=>'0x'+(n>>>0).toString(16).padStart(8,'0');
 const ptrToOffset=v=>{v=v>>>0;return v>=0x80018000&&v<0x80018000+0x93a0?v-0x80018000:null;};
 const records=[];
 for(const root of chain.records)for(const item of root.callbackItems||[]){const desc=item.descriptor;if(!desc?.dwords?.length)continue;const descriptorOffset=parseInt(item.callbackReadPointerTarget,16),count=dword(descriptorOffset+0x10),arrayPtr=dword(descriptorOffset+0x0c),arrayOffset=ptrToOffset(arrayPtr),entries=[];let cursor=arrayOffset;
  if(arrayOffset!==null&&arrayOffset<dpc.length&&count<4096){for(let n=0;n<count;n++){if(cursor===null||cursor<0||cursor+0x18>dpc.length){entries.push({index:n,offset:cursor===null?null:'0x'+cursor.toString(16),error:'record outside DPC bounds'});break;}
    const strideUnits=byte(cursor+2),entry={index:n,offset:'0x'+cursor.toString(16),strideUnits,advanceBytes:strideUnits*4,byte15:byte(cursor+0x15),dword14:u32hex(dword(cursor+0x14)),bytes24:dpc.subarray(cursor,cursor+0x18).toString('hex')};entries.push(entry);if(n+1<count){if(strideUnits===0){entry.nextError='zero stride';break;}cursor+=strideUnits*4;}
   }}
  records.push({part:root.part,role:root.role,descriptorOffset:'0x'+descriptorOffset.toString(16),descriptorDwords:desc.dwords.slice(0,8),arrayPointer:u32hex(arrayPtr),arrayOffset:arrayOffset===null?null:'0x'+arrayOffset.toString(16),count,entries});
 }
 const result={title:'OUTWARS SCOUT DESCRIPTOR PREPARATION AUDIT',version:'1.0.0',generatedAt:new Date().toISOString(),executable:{file:path.basename(exe),bytes:fs.statSync(exe).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex')},dpc:{file:'units/scout_mj.dpc',bytes:dpc.length},routine:{entry:'0x4e59c8',instructions:body.map(x=>x.raw),instructionCount:body.length,globalReferencesToSeed:['0x12d7370'],seedGlobalXrefs:refs,semantics:{descriptorPointerRead:'[descriptor+0x0c]',recordCountRead:'[descriptor+0x10]',seedRead:'DWORD PTR ds:0x12d7370',recordStride:'At each current record, read BYTE [record+2], multiply by 4, then advance by that many bytes for the next record.',mutations:['BYTE [record+0x15] &= 0x1f','DWORD [record+0x14] |= ((seed & 7) << 13)'],note:'The routine masks byte +0x15 to its low five bits. It ORs a three-bit rolling counter into bits 13..15 of the dword at +0x14. The counter begins with the global seed, increments once per record, and resets to zero when it reaches eight. The final counter is written back to the global.'}},records};
 fs.writeFileSync(path.join(ad,'descriptor-preparation-routine.json'),JSON.stringify(result.routine,null,2));fs.writeFileSync(path.join(ad,'scout-preparation-records.json'),JSON.stringify(records,null,2));fs.writeFileSync(path.join(out,'SCOUT-DESCRIPTOR-PREPARATION-AUDIT.json'),JSON.stringify(result,null,2)+'\n');
 const md=['# Scout descriptor preparation audit','','## Routine 0x4e59c8','','The routine is called directly by Opcode 0 for all 16 nested Scout descriptors. It reads the descriptor array pointer at +0x0C and record count at +0x10. For each variable-stride record it applies:','','- BYTE [record+0x15] &= 0x1f','- DWORD [record+0x14] |= ((seed & 7) << 13)','', 'Seed global: 0x12d7370. The runtime initial value must be read from memory; the routine increments and wraps it modulo eight as it processes records.','','## Routine disassembly','','```asm',...body.map(x=>x.raw),'```','','','## Seed global references','',...refs.map(x=>'- '+x),'','## Scout descriptor record arrays',''];
 for(const r of records){md.push('### Part '+r.part+' — '+r.role,'','Descriptor: '+r.descriptorOffset+'; array: '+r.arrayPointer+' ('+(r.arrayOffset||'unmapped')+'); count: '+r.count,'','| Index | DPC offset | stride units | +0x14 before | +0x15 before |','|---:|---|---:|---|---:|',...r.entries.map(e=>'| '+e.index+' | '+(e.offset||'—')+' | '+(e.strideUnits??'—')+' | '+(e.dword14||'—')+' | '+(e.byte15??'—')+' |'));}
 md.push('','## Interpretation limits','','This confirms the descriptor-preparation routine and the exact fields it mutates. It does not establish that these records are mesh transforms or that their values directly determine final model placement. The rolling seed runtime initial value and downstream consumers remain to be traced.');
 fs.writeFileSync(path.join(out,'SCOUT-DESCRIPTOR-PREPARATION-AUDIT.md'),md.join('\n')+'\n');const z=spawnSync('zip',['-qr',out+'.zip','.'],{cwd:out});if(z.status!==0)throw Error('ZIP packaging failed');console.log(JSON.stringify({routine:'0x4e59c8',routineInstructions:body.length,seedGlobalXrefs:refs.length,scoutRecords:records.length,totalArrayEntries:records.reduce((s,r)=>s+r.entries.length,0),unmappedArrays:records.filter(r=>r.arrayOffset===null).length,bundle:out+'.zip'},null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
