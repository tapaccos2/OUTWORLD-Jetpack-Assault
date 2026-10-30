#!/usr/bin/env node
// Extract original Outwars playable-armour meshes from a DCPMC resource.
// Output is raw indexed geometry; attachment transforms/UVs/skin weights remain unresolved.
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const applyAnchors = args.includes('--apply-anchor-candidates');
const useMeshVertexReference = args.includes('--use-mesh-vertex-reference');
const applyPlanarPivotCandidate = args.includes('--apply-planar-pivot-candidate');
const applyPivotOwnerCandidate = args.includes('--apply-pivot-owner-candidate');
const positional = args.filter(x =>
  x !== '--apply-anchor-candidates' &&
  x !== '--use-mesh-vertex-reference' &&
  x !== '--apply-planar-pivot-candidate' &&
  x !== '--apply-pivot-owner-candidate'
);
const input = positional[0], output = positional[1] || 'armour-raw-geometry.glb';
if (!input) throw new Error('Usage: node export-dpc-armour-geometry.mjs <file.dpc> [out.glb] [--apply-anchor-candidates] [--use-mesh-vertex-reference]');
const b = fs.readFileSync(input);
if (b.length < 40 || b.toString('ascii', 0, 4) !== 'DCPM' || b[4] !== 0x43) throw new Error('Expected DCPMC resource');
const base = b.readUInt32LE(12);
const u16 = o => b.readUInt16LE(o), u32 = o => b.readUInt32LE(o), s32 = o => b.readInt32LE(o);
function ptr(o) {
  if (o < 0 || o + 4 > b.length) throw new Error('Pointer field out of range: ' + o);
  const p = u32(o);
  if (p < base || p - base + 4 > b.length) throw new Error('Invalid relocated pointer at ' + o);
  return p - base;
}
function typed(o, type, cls) { return o >= 0 && o + 4 <= b.length && b[o] === type && u16(o + 2) === cls; }
let rootRecord = -1, rootNode = -1, rootClass = -1, partClass = -1;
for (const [candidateRoot, candidatePart] of [[102, 105], [152, 155]]) {
  for (let o = 0; o <= b.length - 4; o++) {
    if (!typed(o, 9, candidateRoot)) continue;
    try {
      const n = ptr(o + 16), list = ptr(o + 20);
      if (b[n] === 1 && typed(list, 9, candidatePart) && u16(list + 6) === 9) {
        rootRecord = o; rootNode = n; rootClass = candidateRoot; partClass = candidatePart; break;
      }
    } catch {}
  }
  if (rootNode >= 0) break;
}
if (rootNode < 0) throw new Error('Playable armour class-102/152 root not found');
const partList = ptr(rootRecord + 20);
const owners = [];
for (let i = 0; i < 8; i++) {
  const owner = ptr(partList + 16 + i * 4);
  if (b[owner] !== 1) throw new Error('Part ' + (i + 1) + ' is not type-1');
  owners.push(owner);
}
function readQuads(start, sourceCount, label) {
  const sig = Buffer.from([4, 1, 12, 9]);
  const source = [];
  let cursor = start;
  for (let i = 0; i < sourceCount; i++) {
    cursor = b.indexOf(sig, cursor);
    if (cursor < 0 || cursor + 12 > b.length) throw new Error(label + ': face records ' + i + '/' + sourceCount);
    source.push([u16(cursor + 4), u16(cursor + 6), u16(cursor + 8), u16(cursor + 10)]);
    cursor += 4;
  }
  const seen = new Set(), unique = [];
  for (const q of source) {
    if (new Set(q).size < 3) continue;
    const key = q.slice().sort((a, b) => a - b).join(',');
    if (!seen.has(key)) { seen.add(key); unique.push(q); }
  }
  return unique;
}
function planarAngleFromCandidateVectors(meshVector, pairedVector) {
  const cross = pairedVector[0] * meshVector[1] - pairedVector[1] * meshVector[0];
  const dot = pairedVector[0] * meshVector[0] + pairedVector[1] * meshVector[1];
  return Math.atan2(cross, dot);
}
function applyPlanarPivotTransform(mesh, pivot, angle, translation) {
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const offset = i * 3;
    const x = mesh.positions[offset] - pivot[0];
    const y = mesh.positions[offset + 1] - pivot[1];
    const z = mesh.positions[offset + 2] - pivot[2];
    mesh.positions[offset] = translation[0] + cosine * x - sine * y;
    mesh.positions[offset + 1] = translation[1] + sine * x + cosine * y;
    mesh.positions[offset + 2] = translation[2] + z;
    const nx = mesh.normals[offset], ny = mesh.normals[offset + 1];
    mesh.normals[offset] = cosine * nx - sine * ny;
    mesh.normals[offset + 1] = sine * nx + cosine * ny;
  }
  mesh.min = [Infinity, Infinity, Infinity];
  mesh.max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertexCount; i++) {
    for (let k = 0; k < 3; k++) {
      const value = mesh.positions[i * 3 + k];
      mesh.min[k] = Math.min(mesh.min[k], value);
      mesh.max[k] = Math.max(mesh.max[k], value);
    }
  }
}
function decodeMesh(name, owner, meshNode, transformNode, vertexOffset, faceOffset, sourceCount, anchor) {
  const quads = readQuads(faceOffset, sourceCount, name);
  if (!quads.length) throw new Error(name + ': no quads decoded');
  const vertexCount = Math.max(...quads.flat()) + 1;
  if (vertexOffset + vertexCount * 8 > b.length) throw new Error(name + ': truncated vertex block');
  const positions = new Float32Array(vertexCount * 3);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertexCount; i++) {
    const v = [b.readInt16LE(vertexOffset + i * 8), b.readInt16LE(vertexOffset + i * 8 + 2), b.readInt16LE(vertexOffset + i * 8 + 4)];
    positions.set(v, i * 3);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
  }
  const indices = [];
  for (const q of quads) indices.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  const sums = new Float64Array(vertexCount * 3);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
    const a = positions.slice(ia * 3, ia * 3 + 3), v1 = positions.slice(ib * 3, ib * 3 + 3), v2 = positions.slice(ic * 3, ic * 3 + 3);
    const u = v1.map((v, k) => v - a[k]), v = v2.map((x, k) => x - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const idx of [ia, ib, ic]) for (let k = 0; k < 3; k++) sums[idx * 3 + k] += n[k];
  }
  const normals = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const v = [sums[i * 3], sums[i * 3 + 1], sums[i * 3 + 2]], len = Math.hypot(...v);
    if (len > 1e-12) normals.set(v.map(x => x / len), i * 3);
  }
  return { name, owner, meshNode, transformNode, vertexOffset, faceOffset, sourceCount, quadCount: quads.length, vertexCount, triangleCount: indices.length / 3, positions, normals, indices: new Uint32Array(indices), min, max, anchor };
}
const meshes = [];
meshes.push(decodeMesh('root_mesh', rootNode, rootNode, null, ptr(rootNode + 28), ptr(rootNode + 36), 22, [0, 0, 0]));
for (let i = 0; i < owners.length; i++) {
  const owner = owners[i], meshNode = ptr(owner + 24), transformNode = ptr(owner + 28);
  if (b[meshNode] !== 2 || b[transformNode] !== 2) throw new Error('Part ' + (i + 1) + ': expected type-2 mesh and transform nodes');
  const anchor = [s32(transformNode + 32), s32(transformNode + 36), s32(transformNode + 40)];
  for (let k = 0; k < 3; k++) if (anchor[k] !== s32(owner + 8 + k * 4)) throw new Error('Part ' + (i + 1) + ': owner/wrapper vector mismatch');
  const meshDescriptor = ptr(ptr(meshNode + 20) + 8);
  const sharedVertexData = ptr(meshDescriptor + 4);
  const meshVertexReference = ptr(meshNode + 28);
  if (meshVertexReference < 0 || meshVertexReference + 4 > b.length) throw new Error('Part ' + (i + 1) + ': invalid mesh vertex reference');
  // Default mode preserves the shared-pool interpretation. The optional
  // --use-mesh-vertex-reference mode tests whether face indices are local to
  // the per-mesh start referenced by type-2 +28.
  const selectedVertexData = useMeshVertexReference ? meshVertexReference : sharedVertexData;
  const decoded = decodeMesh('submesh_' + (i + 1), owner, meshNode, transformNode, selectedVertexData, ptr(meshNode + 36), 26, anchor);
  decoded.meshVertexReferenceTarget = meshVertexReference;
  decoded.sharedVertexDataOffset = sharedVertexData;
  if (applyPlanarPivotCandidate || applyPivotOwnerCandidate) {
    const meshVector = [s32(meshNode + 8), s32(meshNode + 12)];
    const pairedVector = [s32(transformNode + 8), s32(transformNode + 12)];
    const pivot = [
      b.readInt16LE(meshVertexReference),
      b.readInt16LE(meshVertexReference + 2),
      b.readInt16LE(meshVertexReference + 4)
    ];
    const angle = planarAngleFromCandidateVectors(meshVector, pairedVector);
    const translation = [s32(owner + 8), s32(owner + 12), s32(owner + 16)];
    if (applyPivotOwnerCandidate) {
      applyPlanarPivotTransform(decoded, pivot, angle, translation);
    } else {
      applyPlanarPivotTransform(decoded, pivot, angle, pivot);
    }
    decoded.planarPivotCandidate = {
      pivot,
      meshVector,
      pairedVector,
      translation: applyPivotOwnerCandidate ? translation : pivot,
      angleRadians: angle,
      angleDegrees: angle * 180 / Math.PI,
      rotationAxis: 'Z',
      transformKind: applyPivotOwnerCandidate
        ? 'pivot-relative rotation plus owner-vector translation'
        : 'rotation around referenced pivot only',
      interpretation: 'XY direction difference used as a diagnostic rotation only'
    };
  }
  decoded.vertexBaseInterpretation = useMeshVertexReference ? 'meshNode+28 candidate local base' : 'shared pool descriptor base';
  meshes.push(decoded);
}
// Build a self-contained glTF 2.0 binary.
const binaryParts = [], bufferViews = [], accessors = [], gltfMeshes = [], nodes = [], materials = [];
let byteOffset = 0;
function addView(buffer, target) {
  const pad = (4 - byteOffset % 4) % 4;
  if (pad) { binaryParts.push(Buffer.alloc(pad)); byteOffset += pad; }
  const index = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
  binaryParts.push(buffer); byteOffset += buffer.length;
  return index;
}
const colors = [[.55,.62,.72,1],[.62,.68,.77,1],[.48,.56,.67,1],[.7,.73,.78,1],[.5,.61,.68,1],[.66,.63,.55,1],[.56,.64,.58,1],[.7,.6,.55,1],[.58,.58,.66,1]];
for (let i = 0; i < meshes.length; i++) {
  const m = meshes[i];
  const posView = addView(Buffer.from(m.positions.buffer), 34962);
  const normView = addView(Buffer.from(m.normals.buffer), 34962);
  const indexView = addView(Buffer.from(m.indices.buffer), 34963);
  const posAccessor = accessors.length;
  accessors.push({ bufferView: posView, componentType: 5126, count: m.vertexCount, type: 'VEC3', min: m.min, max: m.max });
  const normAccessor = accessors.length;
  accessors.push({ bufferView: normView, componentType: 5126, count: m.vertexCount, type: 'VEC3' });
  const indexAccessor = accessors.length;
  accessors.push({ bufferView: indexView, componentType: 5125, count: m.indices.length, type: 'SCALAR', min: [Math.min(...m.indices)], max: [Math.max(...m.indices)] });
  materials.push({ name: 'Diagnostic material ' + (i + 1), pbrMetallicRoughness: { baseColorFactor: colors[i], metallicFactor: 0, roughnessFactor: .82 }, doubleSided: true });
  gltfMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: posAccessor, NORMAL: normAccessor }, indices: indexAccessor, material: i, mode: 4 }], extras: { sourceOwnerNodeOffset: m.owner, sourceMeshNodeOffset: m.meshNode, sourceTransformNodeOffset: m.transformNode, vertexDataOffset: m.vertexOffset, meshVertexReferenceTarget: m.meshVertexReferenceTarget ?? null, sharedVertexDataOffset: m.sharedVertexDataOffset ?? m.vertexOffset, vertexBaseInterpretation: m.vertexBaseInterpretation ?? 'root/shared pool base', faceDataOffset: m.faceOffset, sourceFaceRecordCount: m.sourceCount, uniqueQuadCount: m.quadCount, anchorVectorCandidate: m.anchor, planarPivotCandidate: m.planarPivotCandidate ?? null } });
  const node = { name: m.name, mesh: i, extras: { anchorVectorCandidate: m.anchor, transformApplied: applyAnchors, planarPivotCandidate: m.planarPivotCandidate ?? null } };
  if (applyAnchors && m.transformNode !== null) node.translation = m.anchor;
  nodes.push(node);
}
const binary = Buffer.concat(binaryParts);
const gltf = { asset: { version: '2.0', generator: 'Outwars DPC armour geometry exporter' }, scene: 0, scenes: [{ name: 'Scout raw geometry', nodes: nodes.map((_, i) => i), extras: { sourceFile: path.basename(input), coordinateSystem: 'Original axes preserved; up-axis unknown', vertexBaseInterpretation: useMeshVertexReference ? 'meshNode+28 candidate local base' : 'shared pool descriptor base', planarPivotCandidateApplied: applyPlanarPivotCandidate, pivotOwnerCandidateApplied: applyPivotOwnerCandidate, note: 'Planar pivot and pivot-owner modes are unverified diagnostic hypotheses; no default transform has been changed.' } }], nodes, meshes: gltfMeshes, materials, accessors, bufferViews, buffers: [{ byteLength: binary.length }] };
let json = Buffer.from(JSON.stringify(gltf));
const jsonPad = (4 - json.length % 4) % 4;
if (jsonPad) json = Buffer.concat([json, Buffer.alloc(jsonPad, 32)]);
const binPad = (4 - binary.length % 4) % 4;
const bin = binPad ? Buffer.concat([binary, Buffer.alloc(binPad)]) : binary;
const total = 12 + 8 + json.length + 8 + bin.length;
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(output, Buffer.concat([header, jh, json, bh, bin]));
const report = { input, output, rootClass, partClass, rootRecordOffset: rootRecord, rootNodeOffset: rootNode, partListOffset: partList, anchorCandidatesApplied: applyAnchors, vertexBaseInterpretation: useMeshVertexReference ? 'meshNode+28 candidate local base' : 'shared pool descriptor base', planarPivotCandidateApplied: applyPlanarPivotCandidate, pivotOwnerCandidateApplied: applyPivotOwnerCandidate, meshCount: meshes.length, totalVertices: meshes.reduce((s, m) => s + m.vertexCount, 0), totalTriangles: meshes.reduce((s, m) => s + m.triangleCount, 0), meshes: meshes.map(m => ({ name: m.name, ownerNodeOffset: m.owner, meshNodeOffset: m.meshNode, transformNodeOffset: m.transformNode, vertexDataOffset: m.vertexOffset, sharedVertexDataOffset: m.sharedVertexDataOffset ?? m.vertexOffset, meshVertexReferenceTarget: m.meshVertexReferenceTarget ?? null, vertexBaseInterpretation: m.vertexBaseInterpretation ?? 'root/shared pool base', faceDataOffset: m.faceOffset, sourceFaceRecordCount: m.sourceCount, uniqueQuadCount: m.quadCount, triangles: m.triangleCount, vertices: m.vertexCount, bounds: [m.min, m.max], anchorVectorCandidate: m.anchor, planarPivotCandidate: m.planarPivotCandidate ?? null })), notes: ['XYZ coordinates are preserved as signed int16 values.', 'Four-index face records are deduplicated by unordered vertex set and triangulated as a fan.', 'Normals are generated from exported triangle winding.', 'Attachment transforms, UVs, original texture mapping, skin weights and animation are not included.', 'Wrapper translation candidates are metadata unless --apply-anchor-candidates is supplied.',
    'The --use-mesh-vertex-reference option treats meshNode+28 as the local vertex-array base for a diagnostic comparison; this interpretation is unverified.',
    'The --apply-planar-pivot-candidate option rotates each submesh around the XYZ point referenced by meshNode+28, using the XY angle between the mesh and paired type-2 candidate vectors. This is an unverified visual hypothesis, not a decoded runtime transform.',
    'The --apply-pivot-owner-candidate option tests qWorld = ownerVector + Rz(angle) * (qLocal - pivot), using the owner vector and meshNode+28 referenced point. This is an unverified diagnostic hypothesis; the default export remains unchanged.'] };
fs.writeFileSync(output.replace(/\.glb$/i, '') + '.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
