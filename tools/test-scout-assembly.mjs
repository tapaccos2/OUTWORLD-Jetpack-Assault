#!/usr/bin/env node
/**
 * Scout assembly diagnostic.
 * Runs the existing raw and candidate-anchor exporters, then reports:
 * - per-part and combined local/translated bounds;
 * - whether candidate translations reduce the spatial spread;
 * - statistics for bytes +6/+7 in each 8-byte vertex record.
 *
 * Diagnostic only. Translation candidates are not the verified runtime
 * transform hierarchy. No game code is changed.
 *
 * Usage:
 *   node tools/test-scout-assembly.mjs
 *   node tools/test-scout-assembly.mjs original-data/units/scout_mj.dpc
 *   node tools/test-scout-assembly.mjs path/to/scout_mj.dpc ./scout-test-output
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const requestedDpc = args[0] ? path.resolve(args[0]) : null;
const outputDir = path.resolve(args[1] || path.join(os.tmpdir(), 'outwars-scout-diagnostic'));
const exporter = path.join(repoRoot, 'tools', 'export-dpc-armour-geometry.mjs');

function fail(message) {
  console.error(JSON.stringify({ status: 'FAILED', error: message }, null, 2));
  process.exit(1);
}
function runNode(script, scriptArgs) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error([
      'Command failed: node ' + path.relative(repoRoot, script) + ' ' + scriptArgs.join(' '),
      result.stderr?.trim(), result.stdout?.trim()
    ].filter(Boolean).join('\n'));
  }
  return result.stdout;
}
function findScoutDpc() {
  if (requestedDpc) return fs.existsSync(requestedDpc) ? requestedDpc : null;
  const candidates = [
    'original-data/units/scout_mj.dpc',
    'original-data/units.ff/scout_mj.dpc',
    'extracted-ff/units/scout_mj.dpc',
    'units/scout_mj.dpc',
    'scout_mj.dpc'
  ];
  for (const candidate of candidates) {
    const full = path.join(repoRoot, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  const roots = ['original-data', 'extracted-ff', 'units'];
  for (const root of roots) {
    const startDir = path.join(repoRoot, root);
    if (!fs.existsSync(startDir)) continue;
    const stack = [startDir];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && entry.name.toLowerCase() === 'scout_mj.dpc') return full;
      }
    }
  }
  // Some checkouts keep the extracted units in the original FF archive only.
  const archives = ['original-data/units.ff', 'units.ff'];
  const extractor = path.join(repoRoot, 'tools', 'extract-ff-resources.mjs');
  for (const archive of archives) {
    const fullArchive = path.join(repoRoot, archive);
    if (!fs.existsSync(fullArchive) || !fs.existsSync(extractor)) continue;
    const destination = path.join(os.tmpdir(), 'outwars-scout-units-' + process.pid);
    try {
      runNode(extractor, [fullArchive, '--out', destination]);
      const extracted = path.join(destination, 'units', 'scout_mj.dpc');
      if (fs.existsSync(extracted)) return extracted;
    } catch (error) {
      console.error('Automatic units.ff extraction was not usable: ' + error.message);
    }
  }
  return null;
}
function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2) {
    throw new Error('Not a GLB 2.0 file: ' + file);
  }
  const jsonLength = b.readUInt32LE(12);
  const jsonType = b.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error('Missing GLB JSON chunk: ' + file);
  const gltf = JSON.parse(b.toString('utf8', 20, 20 + jsonLength).trim());
  const binHeader = 20 + jsonLength;
  const binLength = b.readUInt32LE(binHeader);
  if (b.readUInt32LE(binHeader + 4) !== 0x004e4942) throw new Error('Missing GLB BIN chunk: ' + file);
  const bin = b.subarray(binHeader + 8, binHeader + 8 + binLength);
  return { gltf, bin };
}
function accessorBytes(gltf, accessorIndex) {
  const a = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[a.bufferView];
  const componentBytes = ({5121:1, 5123:2, 5125:4, 5126:4})[a.componentType];
  const components = ({SCALAR:1,VEC2:2,VEC3:3,VEC4:4})[a.type];
  if (!componentBytes || !components) throw new Error('Unsupported accessor ' + accessorIndex);
  const stride = view.byteStride || componentBytes * components;
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  return { accessor: a, start, stride, componentBytes, components };
}
function readPositions(gltf, bin, index) {
  const info = accessorBytes(gltf, index);
  if (info.accessor.componentType !== 5126 || info.components !== 3) {
    throw new Error('Expected FLOAT VEC3 position accessor');
  }
  const values = new Float32Array(info.accessor.count * 3);
  for (let i=0;i<info.accessor.count;i++) {
    const p=info.start+i*info.stride;
    for(let k=0;k<3;k++) values[i*3+k]=bin.readFloatLE(p+k*4);
  }
  return values;
}
function readIndices(gltf, bin, index) {
  const info = accessorBytes(gltf, index);
  const values = new Array(info.accessor.count);
  for(let i=0;i<values.length;i++) {
    const p=info.start+i*info.stride;
    values[i]=info.accessor.componentType===5125?bin.readUInt32LE(p):
      info.accessor.componentType===5123?bin.readUInt16LE(p):
      info.accessor.componentType===5121?bin.readUInt8(p):null;
    if(values[i]===null) throw new Error('Unsupported index component type');
  }
  return values;
}
function boundsOf(values, translation=[0,0,0]) {
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<values.length;i+=3) for(let k=0;k<3;k++) {
    const v=values[i+k]+translation[k];
    min[k]=Math.min(min[k],v); max[k]=Math.max(max[k],v);
  }
  return {min,max,size:max.map((v,k)=>v-min[k]),centre:max.map((v,k)=>(v+min[k])/2)};
}
function unionBounds(rows, key) {
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  for(const row of rows) for(let k=0;k<3;k++) {
    min[k]=Math.min(min[k],row[key].min[k]);
    max[k]=Math.max(max[k],row[key].max[k]);
  }
  return {min,max,size:max.map((v,k)=>v-min[k]),centre:max.map((v,k)=>(v+min[k])/2)};
}
function roundBounds(b) {
  const r=a=>a.map(v=>Number(v.toFixed(2)));
  return {min:r(b.min),max:r(b.max),size:r(b.size),centre:r(b.centre)};
}

try {
  if (!fs.existsSync(exporter)) fail('Exporter not found: ' + exporter);
  const dpc = findScoutDpc();
  if (!dpc) fail('Could not locate scout_mj.dpc. Pass its path as the first argument. Expected the extracted file, normally original-data/units/scout_mj.dpc.');
  fs.mkdirSync(outputDir, {recursive:true});
  const rawGlb = path.join(outputDir,'scout-mj-raw.glb');
  const anchoredGlb = path.join(outputDir,'scout-mj-anchor-candidates.glb');
  runNode(exporter,[dpc,rawGlb]);
  runNode(exporter,[dpc,anchoredGlb,'--apply-anchor-candidates']);

  const raw=readGlb(rawGlb);
  const rows=[];
  const vertexWordSamples=[];
  const wordValues=new Map();
  const seenSourceVertices=new Set();
  const dpcBytes=fs.readFileSync(dpc);

  for(let i=0;i<raw.gltf.meshes.length;i++) {
    const mesh=raw.gltf.meshes[i];
    const primitive=mesh.primitives[0];
    const pos=readPositions(raw.gltf,raw.bin,primitive.attributes.POSITION);
    const indices=readIndices(raw.gltf,raw.bin,primitive.indices);
    const rawNode=raw.gltf.nodes.find(n=>n.mesh===i) || {};
    const anchor=rawNode.extras?.anchorVectorCandidate || [0,0,0];
    const localBounds=boundsOf(pos);
    const translatedBounds=boundsOf(pos,anchor);
    const extras=mesh.extras || {};
    const base=extras.vertexDataOffset;
    if(Number.isInteger(base)) {
      for(const vertexIndex of new Set(indices)) {
        // The exporter compacts each mesh's referenced shared-pool vertices.
        // Resolve the compact local index back to its original DPC pool index
        // before sampling the source record's trailing word.
        const sourceVertexIndex=extras.sourceVertexIndices?.[vertexIndex] ?? vertexIndex;
        const key=base+':'+sourceVertexIndex;
        if(seenSourceVertices.has(key)) continue;
        seenSourceVertices.add(key);
        const p=base+sourceVertexIndex*8;
        if(p+8>dpcBytes.length) continue;
        const word=dpcBytes.readUInt16LE(p+6);
        wordValues.set(word,(wordValues.get(word)||0)+1);
        if(vertexWordSamples.length<32) {
          vertexWordSamples.push({
            mesh:mesh.name,vertexIndex,sourceVertexIndex,
            xyz:[dpcBytes.readInt16LE(p),dpcBytes.readInt16LE(p+2),dpcBytes.readInt16LE(p+4)],
            trailingWord:word,hex:'0x'+word.toString(16).padStart(4,'0')
          });
        }
      }
    }
    rows.push({
      mesh:mesh.name,
      vertices:pos.length/3,
      triangles:indices.length/3,
      anchorCandidate:anchor,
      localBounds:roundBounds(localBounds),
      translatedBounds:roundBounds(translatedBounds)
    });
  }

  const wordEntries=[...wordValues.entries()].sort((a,b)=>a[0]-b[0]);
  const wordTotal=wordEntries.reduce((s,x)=>s+x[1],0);
  const frequencies=[...wordValues.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12)
    .map(([value,count])=>({value,hex:'0x'+value.toString(16).padStart(4,'0'),count}));
  const localUnion=unionBounds(rows,'localBounds');
  const translatedUnion=unionBounds(rows,'translatedBounds');

  const report={
    status:'COMPLETED',
    sourceDpc:path.relative(repoRoot,dpc),
    outputDirectory:outputDir,
    generatedFiles:[rawGlb,anchoredGlb],
    extraction:{
      meshCount:rows.length,
      totalVertices:rows.reduce((s,r)=>s+r.vertices,0),
      totalTriangles:rows.reduce((s,r)=>s+r.triangles,0)
    },
    assemblyTest:{
      localCombinedBounds:roundBounds(localUnion),
      translationCandidateCombinedBounds:roundBounds(translatedUnion),
      perPart:rows,
      note:'This applies candidate translations only. Rotations, parent hierarchy and runtime transform order are not decoded.'
    },
    trailingVertexWord:{
      description:'Unsigned 16-bit word read from bytes +6/+7 of each referenced 8-byte source vertex record. Values are reported, not assigned a semantic meaning.',
      sampledUniqueVertexRecords:wordTotal,
      distinctValues:wordEntries.length,
      min:wordEntries.length?wordEntries[0][0]:null,
      max:wordEntries.length?wordEntries.at(-1)[0]:null,
      zeroCount:wordValues.get(0)||0,
      mostFrequentValues:frequencies,
      firstRecords:vertexWordSamples
    }
  };
  const reportFile=path.join(outputDir,'scout-mj-diagnostic.json');
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  console.log('\nSaved report: ' + reportFile);
} catch(error) {
  fail(error instanceof Error?error.stack:String(error));
}
