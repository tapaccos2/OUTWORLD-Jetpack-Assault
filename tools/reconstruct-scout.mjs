#!/usr/bin/env node
/**
 * Integrated Scout DPC reconstruction pipeline.
 *
 * Usage:
 *   node tools/reconstruct-scout.mjs <units.ff|scout.dpc> [out-dir] [--exe outwars.exe]
 *
 * Runs the autonomous mixed-entry callback discovery plus the transform,
 * attachment, opcode-4 payload and legacy part-list audits in one invocation.
 * units.ff is accepted and scout_mj.dpc is extracted automatically.
 *
 * It deliberately does NOT run the legacy 0x04010C09 signature exporter:
 * those records are opcode-4 callbacks, not proven four-index faces. No GLB
 * is emitted until leaf render payload semantics and transform ownership are
 * established.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const argv=process.argv.slice(2);
let input=null, outDirArg=null, exePath=null, maxTargets=700;
for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--exe'){
    if(!argv[i+1]) throw new Error('--exe requires a path');
    exePath=path.resolve(argv[++i]);
  } else if(a==='--max-targets'){
    maxTargets=Number(argv[++i]);
    if(!Number.isInteger(maxTargets)||maxTargets<1)throw new Error('--max-targets must be positive');
  } else if(a.startsWith('--')) {
    throw new Error('Unknown option: '+a);
  } else if(input===null) input=a;
  else if(outDirArg===null) outDirArg=a;
  else throw new Error('Unexpected argument: '+a);
}
if(!input){
  console.error('Usage: node tools/reconstruct-scout.mjs <units.ff|scout.dpc> [out-dir] [--exe outwars.exe] [--max-targets 700]');
  process.exit(2);
}
const requestedInput=path.resolve(input);
const outDir=path.resolve(outDirArg||'scout-reconstruction');
fs.mkdirSync(outDir,{recursive:true});
const autodiscoveryDir=path.join(outDir,'autodiscovery');
const transforms=path.join(outDir,'transform-hierarchy');
const attachments=path.join(outDir,'attachments');
const callbacks=path.join(outDir,'callbacks');
const partGraph=path.join(outDir,'part-graph');
for(const d of [autodiscoveryDir,transforms,attachments,callbacks,partGraph])fs.mkdirSync(d,{recursive:true});

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

// 1. Run autonomous discovery with the legacy signature-derived geometry GLB
//    explicitly disabled. This resolves units.ff automatically and emits the
//    mixed opcode-4 entry graph plus exact relocated callback-edge counts.
const discoveryReportFile=path.join(autodiscoveryDir,'discovery-report.json');
const discoveryArgs=[path.join(here,'scout-autodiscovery.mjs'),requestedInput,autodiscoveryDir,'--max-targets',String(maxTargets),'--no-baseline'];
if(exePath)discoveryArgs.push('--exe',exePath);
run('autonomous mixed-entry callback discovery',process.execPath,discoveryArgs);
const discoveryData=readJson(discoveryReportFile);
if(!discoveryData?.input||!fs.existsSync(discoveryData.input))
  throw new Error('Autodiscovery did not provide a usable extracted DPC path in '+discoveryReportFile);
input=path.resolve(discoveryData.input);

const sourceArchive=discoveryData.sourceArchive??null;

// 2. Decode candidate opcode-5 transform records and their pointer hierarchy.
const transformFile=path.join(transforms,'opcode5-records.json');
run('opcode-5 transform graph',process.execPath,[path.join(here,'inspect-scout-transform-records.mjs'),input],transformFile);
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
run('part-list callback record audit',process.execPath,[path.join(here,'inspect-scout-callback-records.mjs'),input],callbackFile);
const callbackData=readJson(callbackFile);
const callbackChainFile=path.join(callbacks,'part-list-callback-chain.json');
run('part-list callback descriptor chain',process.execPath,[path.join(here,'inspect-scout-callback-chain.mjs'),input],callbackChainFile);
const callbackChainData=readJson(callbackChainFile);

// 7. Preserve the detailed legacy part-list record structure. The data is
//    retained as a separate geometry-pool audit, not treated as the bone tree.
const partGraphFile=path.join(partGraph,'male-part-graph.json');
nodeTool('legacy part-list structural audit','inspect-scout-part-graph.mjs',[input,partGraphFile]);

// The executable bridge is run by scout-autodiscovery above.
const exeReport=discoveryData?.controls?.executableAnalysis?.output
  ?path.join(discoveryData.controls.executableAnalysis.output,'REPORT.txt'):null;

const attachmentSummary=attachmentData?.summary||{};
const payloadSummary=payloadData?.summary||{};
const opcode4Summary=opcode4Data?.summary||{};
const callbackResult=callbackData?.results?.[0]||{};
const discoveryGraph=discoveryData?.graph?.callbackEntryGraph||{};
const discoveryOpcode4=discoveryData?.callbackLayouts?.opcode4||{};
const manifest={
  pipeline:'Outwars Scout DPC reconstruction pipeline',
  version:'1.2.0',
  requestedInput:requestedInput,
  source:input,
  sourceArchive,
  executable:exePath,
  outputs:{
    discoveryReport:path.join(autodiscoveryDir,'DISCOVERY-REPORT.md'),
    discoveryJson:discoveryReportFile,
    opcode4EntryCandidates:path.join(autodiscoveryDir,'opcode4-entry-candidates.csv'),
    hypothesisScoreboard:path.join(autodiscoveryDir,'hypothesis-scoreboard.csv'),
    payloadCoordinateCandidates:path.join(autodiscoveryDir,'payload-coordinate-candidates.csv'),
    payloadIndexCandidates:path.join(autodiscoveryDir,'payload-index-candidates.csv'),
    opcode5TransformRecords:transformFile,
    transformAttachmentAudit:attachmentFile,
    transformMeshPayloadInventory:payloadFile,
    opcode4ChildPayloads:opcode4File,
    partListCallbackRecords:callbackFile,
    partListCallbackChain:callbackChainFile,
    legacyPartGraph:partGraphFile,
    executableAnalysis:exeReport
  },
  legacySignatureGeometryExport:{
    generated:false,
    reason:'The 0x04 0x01 0x0C 0x09 signature is not a proven four-index face. Opcode-4/class-0x090c records are callback nodes with translation fields and child DWORD entries. The legacy GLB is intentionally omitted.'
  },
  transformHierarchy:{
    structurallyPlausibleOpcode5Records:transformCount,
    transformRoots:attachmentSummary.transformRoots??null,
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
    callbackPartListRecords:callbackResult.callbackRecordCount??null,
    recursivelyDiscoveredOpcode4Records:discoveryOpcode4.records?.length??null,
    opcode4ChildEntryCount:discoveryOpcode4.records?.reduce((sum,record)=>sum+(record.entries?.length??0),0)??null,
    strictCallbackEdges:discoveryGraph.validatedEntryToCallbackEdgeCount??null,
    strictCallbackEdgesByTargetKind:discoveryGraph.edgeCountsByTargetKind??null,
    reachableOpcode4FromDescriptorRoots:discoveryGraph.opcode4ReachableFromDescriptorRootsByRelocatedPointers??null
  },
  reconstruction:{
    status:'NOT_YET_ASSEMBLED_OPCODE4_PAYLOAD_SEMANTICS',
    assembledScout:false,
    currentBlocker:'The opcode-4 mixed-entry graph is now inventoried and strict relocated pointers to known opcode-2/opcode-4/opcode-5 records are counted. The remaining task is to establish which opcode-4 child entries point to renderable leaves, decode those leaves into real primitives/topology, and bind them to the matching coordinate payloads. The old signature-based quad interpretation is invalid.',
    acceptanceCriteria:[
      'Decode opcode-4 child-entry targets by actual callback opcode and record layout',
      'Identify the leaf render-primitive payload and its vertex/index interpretation',
      'Compose the DPC opcode-5 fixed-point matrices through the verified parent-child hierarchy',
      'Export a recognisable Scout GLB and validate it visually against the in-game model'
    ]
  }
};
fs.writeFileSync(path.join(outDir,'reconstruction-manifest.json'),JSON.stringify(manifest,null,2)+'\n');

// Package every audit output into one uploadable evidence bundle when the
// standard zip utility is available. The archive sits beside the output folder.
const evidenceArchive=path.resolve(outDir+'.zip');
const zipProbe=spawnSync('zip',['-v'],{encoding:'utf8',maxBuffer:1024*1024});
let archiveStatus='unavailable';
if(zipProbe.status===0){
  const zipped=spawnSync('zip',['-qr',evidenceArchive,'.'],{cwd:outDir,encoding:'utf8',maxBuffer:8*1024*1024});
  archiveStatus=zipped.status===0?'created':'failed';
  if(zipped.status!==0)console.error('[evidence archive] '+(zipped.stderr||zipped.stdout||'zip failed'));
}
console.log('\nReconstruction manifest: '+path.join(outDir,'reconstruction-manifest.json'));
if(archiveStatus==='created')console.log('Evidence bundle: '+evidenceArchive);
else console.log('Evidence bundle not created ('+archiveStatus+'); upload the output folder contents instead.');
console.log('Opcode-5 transforms: '+(transformCount??'unknown'));
console.log('Opcode-2 attachments: '+(payloadSummary.opcode2AttachmentCount??'unknown'));
console.log('Opcode-4 payloads: '+(opcode4Summary.opcode4PayloadCount??'not yet available'));
console.log('Strict callback edges: '+(discoveryGraph.validatedEntryToCallbackEdgeCount??'unknown'));
console.log('Strict edge targets: '+JSON.stringify(discoveryGraph.edgeCountsByTargetKind??{}));
console.log('Opcode-4 reachable records: '+(discoveryGraph.opcode4ReachableFromDescriptorRootsByRelocatedPointers??'unknown'));
console.log('Legacy signature-derived GLB: OMITTED (invalid topology assumption).');
console.log('Final Scout GLB: NOT CLAIMED — render primitive semantics still unresolved.');
