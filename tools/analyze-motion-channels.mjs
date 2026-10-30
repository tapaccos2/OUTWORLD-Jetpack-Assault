#!/usr/bin/env node
/**
 * Profile the 19 x 8-byte signed-word channels in Outwars .MC motion files.
 * Reports ranges, value diversity, frame-to-frame activity and invariants.
 * Does not assign channels to named bones.
 * Usage: node tools/analyze-motion-channels.mjs <motion-directory> [report.json]
 */
import fs from 'node:fs';
import path from 'node:path';
const [directory, output] = process.argv.slice(2);
if (!directory) throw new Error('Usage: node analyze-motion-channels.mjs <motion-directory> [report.json]');
const files=fs.readdirSync(directory).filter(x=>x.toLowerCase().endsWith('.mc')).sort();
if(!files.length) throw new Error('No .mc files found');
const global=Array.from({length:19},()=>Array.from({length:3},()=>({min:Infinity,max:-Infinity,sum:0,sumSq:0,count:0,unique:new Set()})));
const slotActivity=Array(19).fill(0), fileRows=[], sentinelCounts=Array.from({length:19},()=>new Map());
let totalFrames=0; const badPayload=[];
for(const file of files){
 const full=path.join(directory,file),b=fs.readFileSync(full);
 if(b.length<4) throw new Error(file+': truncated');
 const declared=b.readUInt32LE(0),payload=b.length-4;
 if(payload%152!==0){badPayload.push({file,bytes:payload});continue;}
 const frames=payload/152,prev=Array(19).fill(null),transitions=Array(19).fill(0);
 for(let f=0;f<frames;f++) for(let s=0;s<19;s++){
  const vals=[b.readInt16LE(4+f*152+s*8),b.readInt16LE(6+f*152+s*8),b.readInt16LE(8+f*152+s*8)];
  const fourth=b.readInt16LE(10+f*152+s*8),key=vals.join(',');
  if(prev[s]!==null&&prev[s]!==key) transitions[s]++; prev[s]=key;
  sentinelCounts[s].set(fourth,(sentinelCounts[s].get(fourth)||0)+1);
  for(let k=0;k<3;k++){
   const v=vals[k],g=global[s][k];
   g.min=Math.min(g.min,v);g.max=Math.max(g.max,v);g.sum+=v;g.sumSq+=v*v;g.count++;g.unique.add(v);
  }
 }
 totalFrames+=frames;
 for(let s=0;s<19;s++)slotActivity[s]+=transitions[s];
 fileRows.push({file,declaredFrames:declared,decodedFrames:frames,declaredCountMatches:declared===frames,slotTransitions:transitions,
  activeSlots:transitions.map((n,i)=>n?i:null).filter(x=>x!==null)});
}
const slotSummary=global.map((fields,slot)=>({slot,components:fields.map((g,component)=>{
 const mean=g.sum/g.count,variance=Math.max(0,g.sumSq/g.count-mean*mean);
 return {component,min:g.min,max:g.max,range:g.max-g.min,uniqueValues:g.unique.size,mean:Number(mean.toFixed(3)),stddev:Number(Math.sqrt(variance).toFixed(3)),constant:g.min===g.max};
}),totalFrameTransitions:slotActivity[slot],
fourthWordValues:[...sentinelCounts[slot].entries()].map(([value,count])=>({value,hex:'0x'+(value&0xffff).toString(16).padStart(4,'0'),count}))}));
const fourthWords=[...new Set(sentinelCounts.flatMap(m=>[...m.keys()]))];
const result={sourceDirectory:path.resolve(directory),summary:{fileCount:files.length,decodedFrames:totalFrames,frameBytes:152,slotsPerFrame:19,bytesPerSlot:8,
 threeSigned16BitValuesPlusFourthWord:true,fourthWordUniqueValues:fourthWords,
 declaredFrameMismatches:fileRows.filter(x=>!x.declaredCountMatches),badPayloadFiles:badPayload},slotSummary,fileRows,
 interpretation:'Runtime evidence confirms 19 entries per frame. This report profiles channel behaviour only; channel-to-bone names and hierarchy remain unknown.'};
const json=JSON.stringify(result,null,2)+'\n';
if(output)fs.writeFileSync(output,json);else process.stdout.write(json);
