#!/usr/bin/env node
/**
 * Integrated Scout DPC reconstruction pipeline.
 *
 * Usage:
 *   node tools/reconstruct-scout.mjs <scout.dpc> [out-dir] [--exe outwars.exe]
 *
 * Runs the established DPC transform-hierarchy, attachment and opcode-4
 * payload inspectors in one invocation. It also writes the source-faithful
 * nine-mesh extraction as a diagnostic baseline, not as the assembled Scout.
 *
 * The final GLB is intentionally withheld until opcode-4 child entries and
 * their render payloads are decoded. The old class-102/105 owner-translation
 * experiment is known to be visually wrong and is no longer generated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const argv=process.argv.slice(2);
let input=null, outDirArg=null, exePath=null;
for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--exe'){
    if(!argv[i+1]) throw new Error('--exe requires a path');
    exePath=path.resolve(argv[++i]);
  } else if(a.startsWith('--')) {
    throw new Error('Unknown option: '+a);
  } else if(input===null) input=a;
  else if(outDirArg===null) outDirArg=a;
  else throw new Error('Unexpected argument: '+a);
}
if(!input){
  console.error('Usage: node tools/reconstruct-scout.mjs <scout.dpc> [out-dir] [--exe outwars.exe]');
  process.exit(2);
}
input=path.resolve(input);
if(!fs.existsSync(input)) throw new Error('DPC file not found: '+input);
const outDir=path.resolve(outDirArg||'scout-reconstruction');
fs.mkdirSync(outDir,{recursive:true});
const stem=path.basename(input).replace(/\.dpc$/i,'');
const source=path.join(outDir,'source-geometry');
const transforms=path.join(outDir,'transform-hierarchy');
const attachments=path.join(outDir,'attachments');
const callbacks=path.join(outDir,'callbacks');
for(const d of [source,transforms,attachments,callbacks])fs.mkdirSync(d,{recursive:true});

function run(label,command,args,stdoutFile=null){
  console.log('['+label+']');
  const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:128*1024*1024});
  if(r.stdout && !stdoutFile) process.stdout.write(r.stdout);
  if(r.stderr) process.stderr.write(r.stderr);
  if(r.status!==0) throw new Error(label+' failed (exit '+r.status+')');
  if(stdoutFile && r.stdout) fs.writeFileSync(stdoutFile,r.stdout);
}
function nodeTool(label,name,args,outputFile){
  const script=path.join(here,name);
  if(!fs.existsSync(script)) throw new Error('Required tool missing: '+script);
  run(label,process.execPath,[script,...args]);
}
function readJson(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}
}

// 1. Keep the already-decoded class-102/105 meshes as a baseline only.
const baselineGlb=path.join(source,stem+'-raw-baseline.glb');
nodeTool('source geometry baseline','export-dpc-armour-geometry.mjs',[input,baselineGlb]);
const baseline=readJson(baselineGlb.replace(/\.glb$/i,'.json'));

// 2. Decode candidate opcode-5 transform records and their pointer hierarchy.
const transformFile=path.join(transforms,'opcode5-records.json');
nodeTool('opcode-5 transform graph','inspect-scout-transform-records.mjs',[input,transformFile]);
const transformData=readJson(transformFile);
const transformResult=transformData?.results?.[0]||{};
const transformCount=transformResult.structurallyPlausibleOpcode5Records??null;

// 3. Cross-map transform-child attachment descriptors against the legacy part list.
const attachmentFile=path.join(attachments,'transform-to-geometry-audit.json');
nodeTool('transform-to-geometry attachment audit','audit-scout-transform-attachments.mjs',[input,attachmentFile]);
const attachmentData=readJson(attachmentFile);

// 4. Read every inline descriptor under opcode-2 children (no guessed topology).
const payloadFile=path.join(attachments,'transform-mesh-payloads.json');
nodeTool('transform mesh payload inventory','inspect-scout-transform-mesh-payloads.mjs',[input,payloadFile]);
const payloadData=readJson(payloadFile);

// 5. Decode opcode-4/class-0x090c callback payload entries rather than treating
//    the byte pattern as a four-index face. This is the current hard blocker.
const opcode4File=path.join(attachments,'opcode4-child-payloads.json');
nodeTool('opcode-4 child payload decoding','inspect-scout-opcode4-payloads.mjs',[input,opcode4File]);
const opcode4Data=readJson(opcode4File);

// 6. Cross-check the eight legacy part-list records and callback descriptor path.
const callbackFile=path.join(callbacks,'part-list-callback-records.json');
nodeTool('part-list callback record audit','inspect-scout-callback-records.mjs',[input,callbackFile]);
const callbackData=readJson(callbackFile);
const callbackChainFile=path.join(callbacks,'part-list-callback-chain.json');
nodeTool('part-list callback descriptor chain','inspect-scout-callback-chain.mjs',[input],callbackChainFile);
const callbackChainData=readJson(callbackChainFile);

// 7. Optional executable analysis for validating static code semantics.
let exeReport=null;
if(exePath){
  if(!fs.existsSync(exePath))throw new Error('Executable not found: '+exePath);
  const bridgeOut=path.join(outDir,'executable-analysis');
  run('executable transform disassembly','bash',[path.join(here,'scout-exe-transform-bridge.sh'),exePath,bridgeOut]);
  exeReport=path.join(bridgeOut,'REPORT.txt');
}

const attachmentSummary=attachmentData?.summary||{};
const payloadSummary=payloadData?.summary||{};
const opcode4Summary=opcode4Data?.summary||{};
const callbackResult=callbackData?.results?.[0]||{};
const manifest={
  pipeline:'Outwars Scout DPC reconstruction pipeline',
  version:'1.1.0',
  source:input,
  executable:exePath,
  outputs:{
    sourceGeometryBaseline:baselineGlb,
    sourceGeometryReport:baselineGlb.replace(/\.glb$/i,'.json'),
    opcode5TransformRecords:transformFile,
    transformAttachmentAudit:attachmentFile,
    transformMeshPayloadInventory:payloadFile,
    opcode4ChildPayloads:opcode4File,
    partListCallbackRecords:callbackFile,
    partListCallbackChain:callbackChainFile,
    executableAnalysis:exeReport
  },
  validatedBaseline:{
    meshCount:baseline?.meshCount??null,
    vertices:baseline?.totalVertices??null,
    triangles:baseline?.totalTriangles??null,
    note:'This is the earlier class-102/105 raw extraction only. It is not the assembled Scout and no owner translation is applied.'
  },
  transformHierarchy:{
    structurallyPlausibleOpcode5Records:transformCount,
    transformRoots:transformResult.candidates?.filter(x=>!x.parents?.length).map(x=>x.offset)??null,
    plausibleTransformsFromAttachmentAudit:attachmentSummary.plausibleOpcode5TransformCount??null,
    transformRootsFromAttachmentAudit:attachmentSummary.transformRoots??null,
    note:'Matrices and parent-child pointers are present in the DPC transform callback hierarchy. Matrix order and final geometry linkage still require decoding.'
  },
  geometryPayload:{
    opcode2Attachments:payloadSummary.opcode2AttachmentCount??null,
    inlineDescriptors:payloadSummary.inlineDescriptorCount??null,
    descriptorsWithFaceStreams:payloadSummary.descriptorsWithFaceStreams??null,
    opcode4PayloadCount:opcode4Summary.opcode4PayloadCount??null,
    opcode4EntryCount:opcode4Summary.reportedEntryCount??null,
    callbackPartListRecords:callbackResult.callbackRecordCount??null
  },
  reconstruction:{
    status:'NOT_YET_ASSEMBLED_OPCODE4_PAYLOAD_SEMANTICS',
    assembledScout:false,
    currentBlocker:'The transform hierarchy is identified, but opcode-4 child entries have not yet been decoded into the actual render primitives/topology and linked to their coordinate payloads. The old signature-based quad interpretation is invalid.',
    acceptanceCriteria:[
      'Decode opcode-4 child-entry targets by actual callback opcode and record layout',
      'Identify the leaf render-primitive payload and its vertex/index interpretation',
      'Compose the DPC opcode-5 fixed-point matrices through the verified parent-child hierarchy',
      'Export a recognisable Scout GLB and validate it visually against the in-game model'
    ]
  }
};
fs.writeFileSync(path.join(outDir,'reconstruction-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('\nReconstruction manifest: '+path.join(outDir,'reconstruction-manifest.json'));
console.log('Opcode-5 transforms: '+(transformCount??'unknown'));
console.log('Opcode-2 attachments: '+(payloadSummary.opcode2AttachmentCount??'unknown'));
console.log('Opcode-4 payloads: '+(opcode4Summary.opcode4PayloadCount??'not yet available'));
console.log('Final Scout GLB: NOT CLAIMED — render primitive semantics still unresolved.');
