#!/usr/bin/env node
/**
 * Cross-reference Outwars mission and structure resource names with files on disk.
 * Inventory only: this does not decode binary resource formats.
 *
 * Usage:
 *   node tools/cross-reference-resources.mjs original-data
 *   node tools/cross-reference-resources.mjs original-data --include-tpc
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const includeTpc = args.includes('--include-tpc');
const rootArg = args.find(arg => !arg.startsWith('--')) ?? 'original-data';
const root = path.resolve(rootArg);
const dirs = ['misn', 'netmisn', 'structs'];
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) files.push(full);
  }
}
for (const dir of dirs) walk(path.join(root, dir));
walk(root); // Also include top-level archives and support resources.
// Include extracted FF payloads alongside loose files when present, so mission
// references resolve to resources packaged inside archives.
const extractedRoot = path.join(path.dirname(root), 'extracted-ff');
if (path.resolve(extractedRoot) !== root) walk(extractedRoot);
const uniqueFiles = [...new Set(files)].sort();
const byName = new Map(uniqueFiles.map(file => [path.basename(file).toLowerCase(), file]));
const extensionCounts = {};
for (const file of uniqueFiles) {
  const ext = path.extname(file).toLowerCase();
  extensionCounts[ext || '(no extension)'] = (extensionCounts[ext || '(no extension)'] ?? 0) + 1;
}
function extractStrings(buf, min=4) {
  const out=[]; let start=-1;
  for (let i=0;i<=buf.length;i++) {
    const v=i<buf.length?buf[i]:0;
    if (v>=32&&v<=126) { if(start<0) start=i; }
    else if(start>=0) { if(i-start>=min) out.push({offset:start,text:buf.toString('latin1',start,i)}); start=-1; }
  }
  return out;
}
const resourceRegex = /[A-Za-z0-9_][A-Za-z0-9_.-]{0,100}\.(?:dpc|gpc|rpc|tpc|gry|pcx|wav|avi|ff|spt|fnt|mis|txt)\b/gi;
const refs = [];
// TPC files contain large binary texture payloads. Printable sequences there
// produce filename-shaped false positives, so scan them only when explicitly requested.
const sourceExtensions = includeTpc
  ? ['.mis','.dpc','.gpc','.rpc','.tpc','.ff']
  : ['.mis','.dpc','.gpc','.rpc','.ff'];
const candidates = uniqueFiles.filter(file => sourceExtensions.includes(path.extname(file).toLowerCase()));
for (const file of candidates) {
  const data=fs.readFileSync(file);
  const strings=extractStrings(data);
  for(const s of strings) {
    for(const match of s.text.matchAll(resourceRegex)) {
      const raw=match[0].trim();
      // De-duplicate a name per source offset.
      refs.push({source:path.relative(root,file).replaceAll(path.sep,'/'),offset:s.offset+match.index,name:raw});
    }
  }
}
const resolved = refs.map(ref=>{
  const candidate=path.basename(ref.name).toLowerCase();
  return {...ref, basename:candidate, resolvedPath:byName.get(candidate) ? path.relative(root,byName.get(candidate)).replaceAll(path.sep,'/') : null};
});
const uniqueMissing = new Map();
for(const ref of resolved.filter(x=>!x.resolvedPath)) {
  const key=ref.basename;
  if(!uniqueMissing.has(key))uniqueMissing.set(key,{name:ref.name.toLowerCase(),sourceCount:new Set(),examples:[]});
  const item=uniqueMissing.get(key); item.sourceCount.add(ref.source);
  if(item.examples.length<4)item.examples.push({source:ref.source,offset:ref.offset});
}
const missing=[...uniqueMissing.values()].map(x=>({name:x.name,sourceCount:x.sourceCount.size,examples:x.examples})).sort((a,b)=>a.name.localeCompare(b.name));
const result={
  root,
  extractedRoot: fs.existsSync(extractedRoot) ? extractedRoot : null,
  indexedFileCount:uniqueFiles.length,
  extensionCounts,
  sourceFileCount:candidates.length,
  includeTpc,
  excludedSourceExtensions: includeTpc ? [] : ['.tpc'],
  referenceOccurrenceCount:refs.length,
  resolvedReferenceOccurrenceCount:resolved.filter(x=>x.resolvedPath).length,
  unresolvedUniqueBasenames:missing.length,
  unresolved:missing,
  resolved:resolved.filter(x=>x.resolvedPath).slice(0,1000),
  note:'Printable-string reference scan only; absence of a string match does not mean a resource is unused. Binary IDs and compressed internal names are not decoded.'
};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
