#!/usr/bin/env node
/**
 * Extract resources from FF archives whose directory table matches the
 * validated 4-byte count + 44-byte entry format.
 *
 * Every archive is validated before extraction. The final empty-name entry
 * is an EOF sentinel and is not extracted.
 *
 * Usage:
 *   node tools/extract-ff-resources.mjs original-data/motion.ff original-data/shelldb/*.ff
 *   node tools/extract-ff-resources.mjs original-data/units.ff --out extracted-ff
 */
import fs from 'node:fs';
import path from 'node:path';

const args=process.argv.slice(2);
let outDir='extracted-ff';
const outIndex=args.indexOf('--out');
if(outIndex!==-1){
 if(!args[outIndex+1]){console.error('--out requires a directory');process.exit(2)}
 outDir=args[outIndex+1];
 args.splice(outIndex,2);
}
const files=args;
if(!files.length){console.error('Usage: node tools/extract-ff-resources.mjs <archive.ff> [...] [--out directory]');process.exit(2)}
function parseArchive(file){
 const data=fs.readFileSync(file);
 if(data.length<4)throw new Error('File is shorter than the 4-byte entry count');
 const count=data.readUInt32LE(0);
 if(count<1||count>100000)throw new Error(`Implausible directory entry count: ${count}`);
 const tableEnd=4+count*44;
 if(tableEnd>data.length)throw new Error(`Directory table ends at ${tableEnd}, beyond EOF ${data.length}`);
 const entries=[];
 for(let i=0;i<count;i++){
  const p=4+i*44,offset=data.readUInt32LE(p);
  const raw=data.subarray(p+4,p+44);
  const nul=raw.indexOf(0);
  const nameBytes=nul===-1?raw:raw.subarray(0,nul);
  const name=nameBytes.toString('latin1');
  if(offset>data.length)throw new Error(`Entry ${i} offset ${offset} exceeds EOF ${data.length}`);
  entries.push({index:i,offset,name});
 }
 if(entries[0].offset!==tableEnd)throw new Error(`First payload offset ${entries[0].offset} differs from directory end ${tableEnd}`);
 for(let i=1;i<entries.length;i++)if(entries[i].offset<entries[i-1].offset)throw new Error(`Entry ${i} offset decreases`);
 const sentinel=entries.at(-1);
 if(sentinel.name!=='')throw new Error('Last entry is not an empty-name sentinel');
 if(sentinel.offset!==data.length)throw new Error(`Sentinel offset ${sentinel.offset} differs from EOF ${data.length}`);
 const resources=entries.slice(0,-1).map((entry,i)=>{
  if(!entry.name)throw new Error(`Unexpected empty filename at entry ${i}`);
  if(entry.name==='.'||entry.name==='..'||/[\\/]/.test(entry.name))throw new Error(`Unsafe resource filename: ${JSON.stringify(entry.name)}`);
  const end=entries[i+1].offset;
  if(end<entry.offset)throw new Error(`Invalid range for ${entry.name}`);
  return {...entry,size:end-entry.offset,bytes:data.subarray(entry.offset,end)};
 });
 return {data,count,tableEnd,resources};
}
let failed=false;
const summary=[];
for(const file of files){
 try{
  const parsed=parseArchive(file);
  const archiveOut=path.join(outDir,path.basename(file,path.extname(file)));
  fs.mkdirSync(archiveOut,{recursive:true});
  const manifest=[];
  for(const resource of parsed.resources){
   const destination=path.join(archiveOut,resource.name);
   fs.writeFileSync(destination,resource.bytes);
   manifest.push({name:resource.name,offset:resource.offset,size:resource.size,file:destination});
  }
  const report={archive:file,bytes:parsed.data.length,entryCount:parsed.count,directoryEnd:parsed.tableEnd,resourceCount:manifest.length,outputDirectory:archiveOut,resources:manifest};
  fs.writeFileSync(path.join(archiveOut,'_manifest.json'),JSON.stringify(report,null,2)+'\n');
  summary.push({archive:file,validated:true,bytes:parsed.data.length,resourceCount:manifest.length,outputDirectory:archiveOut});
 }catch(error){
  failed=true;
  summary.push({archive:file,validated:false,error:error instanceof Error?error.message:String(error)});
 }
}
process.stdout.write(JSON.stringify(summary,null,2)+'\n');
if(failed)process.exitCode=1;
