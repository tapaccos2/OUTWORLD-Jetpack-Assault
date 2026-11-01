#!/usr/bin/env node
/**
 * OUTWARS SCOUT CLOSEOUT — integrated coordinate, ownership, transform and assembly audit.
 *
 * One run replaces the repeated Scout diagnostic sequence. It:
 *  1. runs the executable-guided callback/DPC discovery pipeline;
 *  2. exports independent coordinate-base and placement controls;
 *  3. classifies descriptor coordinate targets against typed records and actual
 *     geometry bases, including bounded stride/header-offset probes;
 *  4. correlates geometry face streams with descriptor/opcode-4 callback paths;
 *  5. evaluates every recorded opcode-5 matrix convention without selecting a
 *     convention from orthogonality alone;
 *  6. writes one evidence report and ZIP.
 *
 * It fails closed: no heuristic coordinate scan or plausible matrix score is
 * promoted to a verified runtime interpretation. A final assembled GLB is
 * emitted only if all nine geometry sections have exact callback ownership and
 * a single executable-supported transform convention. At present the source
 * evidence may not satisfy that gate; the report will identify the precise gap.
 *
 * Usage:
 *   node tools/scout-closeout.mjs original-data/units.ff scout-closeout --exe /path/to/outwars.exe
 *   node tools/scout-closeout.mjs extracted-ff/units/scout_mj.dpc scout-closeout --exe /path/to/outwars.exe
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const argv = process.argv.slice(2);
let input = null, outArg = null, exe = null, maxTargets = 1200;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--exe') { if (!argv[i + 1]) throw new Error('--exe requires outwars.exe'); exe = path.resolve(argv[++i]); }
  else if (a === '--max-targets') { maxTargets = Number(argv[++i]); if (!Number.isInteger(maxTargets) || maxTargets < 1) throw new Error('--max-targets must be positive'); }
  else if (a.startsWith('--')) throw new Error('Unknown option: ' + a);
  else if (input === null) input = a;
  else if (outArg === null) outArg = a;
  else throw new Error('Unexpected argument: ' + a);
}
if (!input || !exe) {
  console.error('Usage: node tools/scout-closeout.mjs <units.ff|scout_mj.dpc> <out-dir> --exe <outwars.exe> [--max-targets 1200]');
  process.exit(2);
}
input = path.resolve(input);
exe = path.resolve(exe);
if (!fs.existsSync(input)) throw new Error('Input not found: ' + input);
if (!fs.existsSync(exe)) throw new Error('Executable not found: ' + exe);
const out = path.resolve(outArg || 'scout-closeout');
const rel = path.relative(repo, out);
if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Output must be a dedicated folder inside the repository.');
if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error('Output folder is not empty; choose a new folder to preserve previous evidence.');
fs.mkdirSync(out, { recursive: true });
const analysisDir = path.join(out, 'analysis');
const geometryDir = path.join(out, 'geometry');
fs.mkdirSync(geometryDir, { recursive: true });

function run(label, command, args, options = {}) {
  console.log('[' + label + ']');
  const r = spawnSync(command, args, { cwd: options.cwd || repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(label + ' failed (exit ' + r.status + '): ' + (r.error?.message || r.stderr || ''));
  return r.stdout || '';
}
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const writeJson = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 2) + '\n');

// 1. Integrated executable-guided discovery. This includes the opcode-2,
// opcode-4, opcode-5, callback graph, pointer-convention and matrix sweeps.
const reconstruct = path.join(here, 'reconstruct-scout.mjs');
if (!fs.existsSync(reconstruct)) throw new Error('Missing tools/reconstruct-scout.mjs');
run('integrated executable-guided Scout discovery', process.execPath,
  [reconstruct, input, analysisDir, '--exe', exe, '--max-targets', String(maxTargets)]);
const discoveryPath = path.join(analysisDir, 'autodiscovery', 'discovery-report.json');
const manifestPath = path.join(analysisDir, 'reconstruction-manifest.json');
if (!fs.existsSync(discoveryPath) || !fs.existsSync(manifestPath)) throw new Error('Integrated discovery did not produce its expected reports.');
const discovery = readJson(discoveryPath);
const manifest = readJson(manifestPath);
const dpc = path.resolve(discovery.input);
if (!fs.existsSync(dpc)) throw new Error('The extracted Scout DPC is no longer available: ' + dpc);
const bytes = fs.readFileSync(dpc);
if (bytes.toString('ascii', 0, 4) !== 'DCPM' || bytes[4] !== 0x43) throw new Error('Expected DCPMC v0x43 source.');
const base = bytes.readUInt32LE(12);
const u16 = o => o >= 0 && o + 2 <= bytes.length ? bytes.readUInt16LE(o) : null;
const u32 = o => o >= 0 && o + 4 <= bytes.length ? bytes.readUInt32LE(o) : null;
const s16 = o => o >= 0 && o + 2 <= bytes.length ? bytes.readInt16LE(o) : null;
const ptr = field => { const v = u32(field); const t = v === null ? -1 : v - base; return v !== null && v >= base && t >= 0 && t + 4 <= bytes.length ? t : null; };
const header = o => o === null || o < 0 || o + 4 > bytes.length ? null : { offset: o, opcode: bytes[o], flags: bytes[o + 1], classWord: u16(o + 2) };

// 2. Export controls independently. The raw/shared-pool export is the geometry
// reference; the remaining modes are comparison candidates, never silently
// treated as runtime placements.
const exporter = path.join(here, 'export-dpc-armour-geometry.mjs');
if (!fs.existsSync(exporter)) throw new Error('Missing tools/export-dpc-armour-geometry.mjs');
const variants = [
  { key: 'sharedPool', file: 'scout-shared-pool.glb', flags: [] },
  { key: 'ownerTranslated', file: 'scout-owner-translated.glb', flags: ['--apply-owner-translations'] },
  { key: 'referencePointMapped', file: 'scout-reference-point-mapped.glb', flags: ['--apply-reference-point-mapping'] },
  { key: 'meshReferenceBase', file: 'scout-mesh-reference-base.glb', flags: ['--use-mesh-vertex-reference'] },
  { key: 'meshReferenceOwnerTranslated', file: 'scout-mesh-reference-owner-translated.glb', flags: ['--use-mesh-vertex-reference', '--apply-owner-translations'] }
];
const geometry = {};
for (const v of variants) {
  const file = path.join(geometryDir, v.file);
  run('export ' + v.key, process.execPath, [exporter, dpc, file, ...v.flags]);
  const sidecar = readJson(file.replace(/\.glb$/i, '.json'));
  const glb = fs.readFileSync(file);
  if (glb.length < 28 || glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(4) !== 2)
    throw new Error('Exporter produced an invalid GLB: ' + file);
  geometry[v.key] = {
    file: path.relative(out, file), sha256: sha256(file), bytes: glb.length,
    meshCount: sidecar.meshCount, vertices: sidecar.totalVertices, triangles: sidecar.totalTriangles,
    meshes: sidecar.meshes, sidecar: path.relative(out, file.replace(/\.glb$/i, '.json'))
  };
}
if (geometry.sharedPool.meshCount !== 9) throw new Error('Expected nine geometry sections; found ' + geometry.sharedPool.meshCount);

// 3. Classify descriptor coordinate pointers. A target is "confirmed geometry
// base" only when it exactly matches a base independently consumed by the
// existing mesh exporter. Nearby scans remain candidates, not conclusions.
const attachments = discovery.callbackLayouts?.opcode2?.attachments || [];
const coordinateRows = [];
for (const attachment of attachments) for (const slot of attachment.slots || []) {
  if (!Number.isInteger(slot.coordinateTarget)) continue;
  const target = slot.coordinateTarget, h = header(target);
  const exactMatches = geometry.sharedPool.meshes.flatMap(m => {
    const matches = [];
    if (m.sharedVertexDataOffset === target || m.vertexDataOffset === target) matches.push('shared-pool-base');
    if (m.meshVertexReferenceTarget === target) matches.push('mesh-reference-base');
    return matches.length ? [{ mesh: m.name, matches }] : [];
  });
  const probes = [];
  for (const delta of [-16, -8, -4, 0, 4, 8, 12, 16, 24, 32, 48, 64]) {
    const start = target + delta;
    for (const stride of [6, 8, 12, 16]) {
      const count = 12;
      if (start < 0 || start + (count - 1) * stride + 6 > bytes.length) continue;
      const points = [];
      let valid = true;
      for (let i = 0; i < count; i++) {
        const p = start + i * stride;
        const v = [s16(p), s16(p + 2), s16(p + 4)];
        if (v.some(x => x === null)) { valid = false; break; }
        points.push(v);
      }
      if (!valid) continue;
      const unique = new Set(points.map(p => p.join(','))).size;
      const min = [0, 1, 2].map(k => Math.min(...points.map(p => p[k])));
      const max = [0, 1, 2].map(k => Math.max(...points.map(p => p[k])));
      const spread = max.map((v, k) => v - min[k]);
      probes.push({ start, delta, stride, sampleCount: count, uniqueCount: unique, extents: spread,
        score: Math.round((unique / count) * 60 + spread.filter(x => x > 0).length * 10 + (stride === 8 ? 10 : 0)) });
    }
  }
  probes.sort((a, b) => b.score - a.score);
  coordinateRows.push({
    transformOffset: attachment.context?.transform ?? null,
    attachmentOffset: attachment.offset, slot: slot.slot, descriptorOffset: slot.descriptor,
    coordinateTarget: target, targetHeader: h, exactGeometryMatches: exactMatches,
    classification: exactMatches.length ? 'exact-exporter-base-match' : 'unresolved-typed-or-payload-target',
    boundedLayoutProbes: probes.slice(0, 8)
  });
}

// Validate the coordinate bases actually consumed by the exporter. For each
// mesh, every referenced source index must address a complete 8-byte XYZ record;
// decoded bounds must agree with the exporter sidecar. This is a direct check of
// the coordinate records used to build the nine source geometry sections.
const coordinateBaseValidation = geometry.sharedPool.meshes.map(mesh => {
  const baseOffset = mesh.sharedVertexDataOffset ?? mesh.vertexDataOffset;
  const indices = mesh.sourceVertexIndices || [];
  const maxIndex = indices.length ? Math.max(...indices) : -1;
  const requiredEnd = baseOffset + (maxIndex + 1) * 8;
  const inBounds = Number.isInteger(baseOffset) && baseOffset >= 0 && requiredEnd <= bytes.length;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  if (inBounds) for (const index of indices) {
    const p = baseOffset + index * 8;
    const v = [s16(p), s16(p + 2), s16(p + 4)];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
  }
  const boundsMatch = inBounds && mesh.bounds &&
    min.every((v, k) => v === mesh.bounds[0][k]) &&
    max.every((v, k) => v === mesh.bounds[1][k]);
  return {
    mesh: mesh.name, baseOffset, stride: 8, referencedVertexCount: indices.length,
    maxReferencedIndex: maxIndex, requiredEnd, inBounds, decodedBounds: { min, max },
    exporterBounds: mesh.bounds, boundsMatch, passed: !!boundsMatch
  };
});
const allCoordinateBasesValidated = coordinateBaseValidation.length === 9 &&
  coordinateBaseValidation.every(x => x.passed);

// 4. Link each geometry face stream to descriptor payloads and recursively
// discovered opcode-4 child pointers. Only exact byte offsets count as links.
const op4Nodes = discovery.graph?.deepCallbackGraph?.nodes?.filter(n => n.kind === 'opcode4-child-list') || [];
const transformRecords = discovery.callbackLayouts?.opcode5?.records || [];
const parentMap = new Map(transformRecords.map(t => [t.offset, t.parentOffsets || []]));
function ancestry(offset) {
  const out = [], seen = new Set();
  function walk(n) {
    if (!Number.isInteger(n) || seen.has(n)) return;
    seen.add(n); out.push(n);
    for (const p of parentMap.get(n) || []) walk(p);
  }
  walk(offset); return out;
}
// An opcode-4 node is owned by the opcode-5 transform whose opcode-2
// descriptor points to it. Keep that direct owner separate from its ancestors.
const op4OwnerTransforms = new Map();
for (const a of attachments) for (const s of a.slots || []) {
  const owner = a.context?.transform;
  if (Number.isInteger(s.payloadTarget) && Number.isInteger(owner)) {
    if (!op4OwnerTransforms.has(s.payloadTarget)) op4OwnerTransforms.set(s.payloadTarget, []);
    op4OwnerTransforms.get(s.payloadTarget).push(owner);
  }
}
const ownership = geometry.sharedPool.meshes.map(mesh => {
  const face = mesh.faceDataOffset;
  const directDescriptor = [];
  for (const a of attachments) for (const s of a.slots || [])
    if (s.payloadTarget === face) directDescriptor.push({ attachment: a.offset, slot: s.slot, transform: a.context?.transform ?? null });
  const opcode4Matches = [];
  for (const node of op4Nodes) for (const entry of node.parsed?.entries || []) {
    const target = entry.resolutions?.['relocated-base']?.target;
    if (target === face) opcode4Matches.push({
      opcode4: node.offset, entry: entry.index,
      directTransformOwners: [...new Set(op4OwnerTransforms.get(node.offset) || [])]
    });
  }
  const directTransformOwners = [...new Set([
    ...directDescriptor.map(x => x.transform).filter(Number.isInteger),
    ...opcode4Matches.flatMap(x => x.directTransformOwners)
  ])];
  const linkedTransforms = [...new Set(directTransformOwners.flatMap(ancestry))];
  return {
    mesh: mesh.name, faceDataOffset: face, descriptorExactMatches: directDescriptor,
    opcode4ExactChildMatches: opcode4Matches, directTransformOwners,
    candidateTransformOwners: linkedTransforms,
    status: directTransformOwners.length ? 'exact-pointer-link-candidate' : 'no-exact-callback-owner-link'
  };
});

// 5. Preserve matrix convention comparisons. Rigidity is only a sanity check;
// it cannot distinguish row/column order, transpose or translation units.
const matrixHypotheses = (discovery.transformMathTests || []).map(h => ({
  root: h.root, order: h.order, transpose: h.transpose, translationScale: h.translationScale,
  nodes: h.nodeCount, averageOrthonormalityScore: h.averageOrthonormalityScore,
  determinantRange: h.determinantRange,
  positions: h.positions, matrices: h.matrices
}));
// Test each candidate matrix convention against the independent mesh reference
// point stored at meshNode+28 and its target at meshNode+56/+60/+64. This is a
// stronger discriminator than matrix orthogonality: a convention must map all
// eight submesh reference points to their recorded targets within two game units.
function apply3(m, v) {
  return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
}
const matrixValidation = matrixHypotheses.map(h => {
  const matrices = new Map((h.matrices || []).map(x => [x.offset, x.matrix]));
  const positions = new Map((h.positions || []).map(x => [x.offset, x.position]));
  const meshTests = ownership.map((owner, i) => {
    const mesh = geometry.sharedPool.meshes[i];
    if (!mesh.meshNodeOffset || !Number.isInteger(mesh.meshVertexReferenceTarget) || !owner.directTransformOwners.length)
      return { mesh: mesh.name, matched: false, reason: 'no exact transform owner or reference point' };
    const ref = mesh.meshVertexReferenceTarget;
    const point = [s16(ref), s16(ref + 2), s16(ref + 4)];
    const targetOffset = mesh.meshNodeOffset + 56;
    if (targetOffset + 12 > bytes.length || point.some(x => x === null))
      return { mesh: mesh.name, matched: false, reason: 'reference point/target outside DPC' };
    const target = [bytes.readInt32LE(targetOffset), bytes.readInt32LE(targetOffset + 4), bytes.readInt32LE(targetOffset + 8)];
    const candidates = owner.directTransformOwners.map(offset => {
      const m = matrices.get(offset), p = positions.get(offset);
      if (!m || !p) return null;
      const transformed = apply3(m, point).map((x, k) => x + p[k]);
      const error = Math.hypot(...transformed.map((x, k) => x - target[k]));
      return { transformOffset: offset, transformed, target, error };
    }).filter(Boolean).sort((a, b) => a.error - b.error);
    const best = candidates[0] || null;
    return { mesh: mesh.name, matched: !!best && best.error <= 2, best, candidates };
  });
  const matched = meshTests.filter(x => x.matched).length;
  const errors = meshTests.map(x => x.best?.error).filter(Number.isFinite);
  return {
    root: h.root, order: h.order, transpose: h.transpose, translationScale: h.translationScale,
    matchedMeshes: matched, testedMeshes: meshTests.filter(x => x.best).length,
    maxReferenceError: errors.length ? Math.max(...errors) : null,
    rmsReferenceError: errors.length ? Math.sqrt(errors.reduce((s, x) => s + x*x, 0) / errors.length) : null,
    meshTests, matrices: h.matrices, positions: h.positions
  };
});
const passingMatrixTests = matrixValidation.filter(x => x.matchedMeshes === 8 && x.testedMeshes === 8 && x.maxReferenceError <= 2);
const passingSignatures = [...new Set(passingMatrixTests.map(x => [x.order, x.transpose, x.translationScale].join('|')))];
const selectedMatrix = passingSignatures.length === 1
  ? passingMatrixTests.sort((a, b) => a.rmsReferenceError - b.rmsReferenceError)[0]
  : null;
const submeshOwnershipComplete = ownership.slice(1).length === 8 &&
  ownership.slice(1).every(x => x.directTransformOwners.length > 0);
function bakeRuntimePlacement(sourceFile, outputFile, selected) {
  const inputGlb = fs.readFileSync(sourceFile);
  const jsonLength = inputGlb.readUInt32LE(12);
  const jsonEnd = 20 + jsonLength;
  const gltf = JSON.parse(inputGlb.toString('utf8', 20, jsonEnd).trim());
  const binHeader = jsonEnd;
  const binLength = inputGlb.readUInt32LE(binHeader);
  const binStart = binHeader + 8;
  const bin = Buffer.from(inputGlb.subarray(binStart, binStart + binLength));
  const matrices = new Map((selected.matrices || []).map(x => [x.offset, x.matrix]));
  const positions = new Map((selected.positions || []).map(x => [x.offset, x.position]));
  const tests = new Map((selected.meshTests || []).map(x => [x.mesh, x]));
  const applied = [];
  for (let i = 1; i < (gltf.meshes || []).length; i++) {
    const mesh = geometry.sharedPool.meshes[i];
    const test = tests.get(mesh.name);
    if (!test?.matched || !test.best) throw new Error('Missing passing transform for ' + mesh.name);
    const m = matrices.get(test.best.transformOffset), t = positions.get(test.best.transformOffset);
    if (!m || !t) throw new Error('Missing composed matrix/position for ' + mesh.name);
    const primitive = gltf.meshes[i].primitives?.[0];
    if (!primitive) throw new Error('Missing primitive for ' + mesh.name);
    const posAccessor = gltf.accessors[primitive.attributes.POSITION];
    const posView = gltf.bufferViews[posAccessor.bufferView];
    if (posAccessor.componentType !== 5126 || posAccessor.type !== 'VEC3') throw new Error('Unsupported POSITION accessor in ' + mesh.name);
    const stride = posView.byteStride || 12;
    const start = (posView.byteOffset || 0) + (posAccessor.byteOffset || 0);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < posAccessor.count; v++) {
      const p = start + v * stride;
      const point = [bin.readFloatLE(p), bin.readFloatLE(p + 4), bin.readFloatLE(p + 8)];
      const q = apply3(m, point).map((x, k) => x + t[k]);
      if (q.some(x => !Number.isFinite(x))) throw new Error('Non-finite transformed position in ' + mesh.name);
      for (let k = 0; k < 3; k++) { bin.writeFloatLE(q[k], p + k * 4); min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); }
    }
    posAccessor.min = min; posAccessor.max = max;
    if (primitive.attributes.NORMAL !== undefined) {
      const normalAccessor = gltf.accessors[primitive.attributes.NORMAL];
      const normalView = gltf.bufferViews[normalAccessor.bufferView];
      const normalStride = normalView.byteStride || 12;
      const normalStart = (normalView.byteOffset || 0) + (normalAccessor.byteOffset || 0);
      for (let v = 0; v < normalAccessor.count; v++) {
        const p = normalStart + v * normalStride;
        const n = [bin.readFloatLE(p), bin.readFloatLE(p + 4), bin.readFloatLE(p + 8)];
        const q = apply3(m, n), length = Math.hypot(...q) || 1;
        q.forEach((x, k) => bin.writeFloatLE(x / length, p + k * 4));
      }
    }
    applied.push({ mesh: mesh.name, transformOffset: test.best.transformOffset, referenceError: test.best.error, matrix: m, translation: t });
  }
  let json = Buffer.from(JSON.stringify(gltf));
  const jsonPad = (4 - json.length % 4) % 4;
  if (jsonPad) json = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - bin.length % 4) % 4;
  const paddedBin = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;
  const total = 12 + 8 + json.length + 8 + paddedBin.length;
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(paddedBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(outputFile, Buffer.concat([header, jh, json, bh, paddedBin]));
  const check = fs.readFileSync(outputFile);
  if (check.readUInt32LE(0) !== 0x46546c67 || check.readUInt32LE(4) !== 2 || check.readUInt32LE(8) !== check.length)
    throw new Error('Baked GLB failed container validation.');
  return { file: path.relative(out, outputFile), sha256: sha256(outputFile), bytes: check.length, transformedSubmeshes: applied };
}
let assembledArtifact = null;
if (selectedMatrix && submeshOwnershipComplete && allCoordinateBasesValidated) {
  assembledArtifact = bakeRuntimePlacement(
    path.join(geometryDir, 'scout-shared-pool.glb'),
    path.join(geometryDir, 'scout-runtime-assembled.glb'),
    selectedMatrix
  );
}
const linkedMeshCount = ownership.slice(1).filter(x => x.directTransformOwners.length > 0).length;
const exactCoordinateCount = coordinateRows.filter(x => x.classification === 'exact-exporter-base-match').length;
const allNineLinked = submeshOwnershipComplete;
const hasUniqueExecutableConvention = !!selectedMatrix;
const gates = {
  coordinateRecords: {
    status: allCoordinateBasesValidated ? 'ALL_NINE_COORDINATE_BASES_VALIDATED' : 'INCOMPLETE',
    validatedGeometryBases: coordinateBaseValidation.filter(x => x.passed).length,
    expectedGeometryBases: 9,
    descriptorCoordinateTargets: coordinateRows.length, exactExporterBaseMatches: exactCoordinateCount,
    descriptorTargetsRemainSeparatelyClassified: true,
    rule: 'All referenced XYZ records must fit the DPC and reproduce the exporter bounds. Nearby probes remain candidates, not proof.'
  },
  transformOwnership: {
    status: allNineLinked ? 'ALL_EIGHT_SUBMESHES_HAVE_EXACT_POINTER_LINKS' : 'INCOMPLETE',
    meshesWithExactCallbackOwnerLinks: linkedMeshCount, expectedMeshes: 8,
    rootMeshTransformExempt: true,
    ownership
  },
  placement: {
    status: hasUniqueExecutableConvention ? 'REFERENCE_POINT_INVARIANT_PASSED' : 'UNRESOLVED',
    matrixHypothesisCount: matrixHypotheses.length,
    passingConventions: passingSignatures,
    selected: selectedMatrix ? { root: selectedMatrix.root, order: selectedMatrix.order, transpose: selectedMatrix.transpose, translationScale: selectedMatrix.translationScale, maxReferenceError: selectedMatrix.maxReferenceError, rmsReferenceError: selectedMatrix.rmsReferenceError } : null,
    reason: 'A convention passes only when one order/orientation/translation-scale signature maps all eight mesh reference points to their exact DPC target coordinates within two game units. Matrix rigidity alone is not used.'
  },
  assembly: {
    status: assembledArtifact ? 'RUNTIME_GLB_ASSEMBLED_AND_REFERENCE_VALIDATED' : 'CANDIDATES_EXPORTED_NOT_RUNTIME_ASSEMBLED',
    candidateCount: variants.length,
    expectedMeshes: 9,
    assembledArtifact,
    reason: assembledArtifact
      ? 'All nine coordinate bases validate, all eight submeshes have exact callback ownership, and one transform convention passes all eight independent reference-point checks.'
      : 'A runtime GLB is emitted only when all nine coordinate bases validate, all eight submeshes have exact callback ownership, and one transform convention passes all eight independent reference-point checks.'
  }
};

// 6. Keep the exact source bytes and checksums beside the reports.
const sourceDir = path.join(out, 'source-binaries');
fs.mkdirSync(sourceDir, { recursive: true });
const dpcCopy = path.join(sourceDir, 'scout_mj.dpc');
fs.copyFileSync(dpc, dpcCopy);
const exeCopyMeta = { name: path.basename(exe), bytes: fs.statSync(exe).size, sha256: sha256(exe) };
const report = {
  title: 'OUTWARS SCOUT CLOSEOUT',
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  input, executable: exeCopyMeta,
  sourceDpc: { file: 'source-binaries/scout_mj.dpc', bytes: fs.statSync(dpcCopy).size, sha256: sha256(dpcCopy), relocationBase: '0x' + base.toString(16) },
  discoveryManifest: path.relative(out, manifestPath),
  autodiscoveryReport: path.relative(out, discoveryPath),
  geometry, coordinateBaseValidation, coordinateClassification: coordinateRows, ownership,
  matrixHypotheses, matrixValidation, assembledArtifact,
  gates,
  finalStatus: assembledArtifact ? 'RUNTIME_ASSEMBLY_GATE_PASSED' : 'EVIDENCE_BUNDLE_COMPLETE_RUNTIME_ASSEMBLY_NOT_PROVEN',
  interpretation: 'This tool completes the evidence collection and exact-link tests in one run. It deliberately does not fabricate missing runtime semantics. A visually plausible GLB is not considered solved until all three gates pass.'
};
writeJson(path.join(out, 'SCOUT-CLOSEOUT.json'), report);
const lines = [
  '# Outwars Scout closeout report', '',
  '- Status: **' + report.finalStatus + '**',
  '- DPC SHA-256: ' + report.sourceDpc.sha256,
  '- Executable SHA-256: ' + exeCopyMeta.sha256,
  '', '## Three remaining gates', '',
  '| Gate | Result | Evidence |', '|---|---|---|',
  '| Coordinate records | ' + gates.coordinateRecords.status + ' | ' + coordinateBaseValidation.filter(x => x.passed).length + ' / 9 geometry bases; ' + exactCoordinateCount + ' descriptor-base links |',
  '| Transform ownership | ' + gates.transformOwnership.status + ' | ' + linkedMeshCount + ' / 8 submeshes linked (root mesh is untransformed) |',
  '| Placement and assembly | ' + gates.placement.status + ' | ' + matrixHypotheses.length + ' matrix hypotheses tested against eight reference points |',
  '', '## Geometry candidates', '',
  '| Variant | Meshes | Vertices | Triangles |', '|---|---:|---:|---:|',
  ...Object.entries(geometry).map(([name, x]) => '| ' + name + ' | ' + x.meshCount + ' | ' + x.vertices + ' | ' + x.triangles + ' |'),
  '', '## Per-mesh callback ownership', '',
  '| Mesh | Face offset | Exact callback link | Candidate transforms |', '|---|---:|---|---|',
  ...ownership.map(x => '| ' + x.mesh + ' | 0x' + Number(x.faceDataOffset).toString(16) + ' | ' +
    (x.status === 'exact-pointer-link-candidate' ? 'yes' : 'no') + ' | ' + x.candidateTransformOwners.map(n => '0x' + n.toString(16)).join(', ') + ' |'),
  '', '## Coordinate target classifications', '',
  '| Transform | Descriptor slot | Target | Header | Classification |', '|---:|---:|---:|---|---|',
  ...coordinateRows.map(x => '| ' + (x.transformOffset === null ? 'unknown' : '0x' + x.transformOffset.toString(16)) +
    ' | ' + x.slot + ' | 0x' + x.coordinateTarget.toString(16) + ' | ' +
    (x.targetHeader ? x.targetHeader.opcode + '/0x' + x.targetHeader.classWord.toString(16) : 'none') +
    ' | ' + x.classification + ' |'),
  '', '## Interpretation boundary', '',
  'Coordinate stride probes are not proof of a vertex layout. A descriptor-to-face match is not by itself proof of runtime matrix ownership. Matrix orthogonality cannot distinguish multiplication order or translation scale. The executable path must link callback-produced entries to the runtime matrix consumer before a final placement can be selected.',
  '', '## Files', '',
  '- SCOUT-CLOSEOUT.json: full machine-readable evidence.',
  '- coordinateBaseValidation: per-mesh 8-byte XYZ record bounds checks and exporter-bound agreement.',
  '- analysis/: integrated callback, transform, descriptor, opcode-4 and executable disassembly reports.',
  '- geometry/: five independent GLB candidates and JSON sidecars.',
  '- source-binaries/scout_mj.dpc: exact source DPC used.',
  '- geometry/scout-runtime-assembled.glb: emitted only when the unique reference-point transform gate passes.',
  '- scout-closeout.zip: one uploadable evidence bundle.'
];
fs.writeFileSync(path.join(out, 'SCOUT-CLOSEOUT.md'), lines.join('\n') + '\n');

// Package a single uploadable bundle.
const archive = out + '.zip';
const zip = spawnSync('zip', ['-qr', archive, '.'], { cwd: out, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (zip.status !== 0) throw new Error('ZIP packaging failed: ' + (zip.stderr || zip.stdout || ''));
console.log('\nSCOUT CLOSEOUT COMPLETE');
console.log('Coordinate bases validated: ' + coordinateBaseValidation.filter(x => x.passed).length + '/9 | descriptor-base matches: ' + exactCoordinateCount);
console.log('Submeshes with exact callback-owner links: ' + linkedMeshCount + '/8');
console.log('Matrix conventions passing reference-point test: ' + passingSignatures.length);
console.log('Geometry variants: ' + variants.length);
console.log('Runtime assembly gate: ' + report.finalStatus);
if (assembledArtifact) console.log('Assembled GLB: ' + path.join(geometryDir, 'scout-runtime-assembled.glb'));
console.log('Report: ' + path.join(out, 'SCOUT-CLOSEOUT.md'));
console.log('Bundle: ' + archive);
