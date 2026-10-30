#!/usr/bin/env node
// Extract original Outwars playable-armour meshes from a DCPMC resource.
// Output is raw indexed geometry; attachment transforms/UVs/skin weights remain unresolved.
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const applyAnchors = args.includes('--apply-anchor-candidates');
const positional = args.filter(x => x !== '--apply-anchor-candidates');
const input = positional[0], output = positional[1] || 'armour-raw-geometry.glb';
if (!input) throw new Error('Usage: node export-dpc-armour-geometry.mjs <file.dpc> [out.glb] [--apply-anchor-candidates]');
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
let rootRecord = -1, rootNode = -1;
for (let o = 0; o <= b.length - 4; o++) {
  if (!typed(o, 9, 102)) continue;
  try { const n = ptr(o + 16); if (b[n] === 1) { rootRecord = o; rootNode = n; break; } } catch {}
}
if (rootNode < 0) throw new Error('Playable armour class-102 root not found');
const partList = ptr(rootRecord + 20);
if (!typed(partList, 9, 105) || u16(partList + 6) !== 9) throw new Error('Expected class-105 nine-entry part list');
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
  meshes.push(decodeMesh('submesh_' + (i + 1), owner, meshNode, transformNode, sharedVertexData, ptr(meshNode + 36), 26, anchor));
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
  gltfMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: posAccessor, NORMAL: normAccessor }, indices: indexAccessor, material: i, mode: 4 }], extras: { sourceOwnerNodeOffset: m.owner, sourceMeshNodeOffset: m.meshNode, sourceTransformNodeOffset: m.transformNode, vertexDataOffset: m.vertexOffset, faceDataOffset: m.faceOffset, sourceFaceRecordCount: m.sourceCount, uniqueQuadCount: m.quadCount, anchorVectorCandidate: m.anchor } });
  const node = { name: m.name, mesh: i, extras: { anchorVectorCandidate: m.anchor, transformApplied: applyAnchors } };
  if (applyAnchors && m.transformNode !== null) node.translation = m.anchor;
  nodes.push(node);
}
const binary = Buffer.concat(binaryParts);
const gltf = { asset: { version: '2.0', generator: 'Outwars DPC armour geometry exporter' }, scene: 0, scenes: [{ name: 'Scout raw geometry', nodes: nodes.map((_, i) => i), extras: { sourceFile: path.basename(input), coordinateSystem: 'Original axes preserved; up-axis unknown', note: 'Raw extraction; attachment rotations, UVs, textures and skinning are not decoded.' } }], nodes, meshes: gltfMeshes, materials, accessors, bufferViews, buffers: [{ byteLength: binary.length }] };
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
const report = { input, output, anchorCandidatesApplied: applyAnchors, meshCount: meshes.length, totalVertices: meshes.reduce((s, m) => s + m.vertexCount, 0), totalTriangles: meshes.reduce((s, m) => s + m.triangleCount, 0), meshes: meshes.map(m => ({ name: m.name, ownerNodeOffset: m.owner, meshNodeOffset: m.meshNode, transformNodeOffset: m.transformNode, vertexDataOffset: m.vertexOffset, faceDataOffset: m.faceOffset, sourceFaceRecordCount: m.sourceCount, uniqueQuadCount: m.quadCount, triangles: m.triangleCount, vertices: m.vertexCount, bounds: [m.min, m.max], anchorVectorCandidate: m.anchor })), notes: ['XYZ coordinates are preserved as signed int16 values.', 'Four-index face records are deduplicated by unordered vertex set and triangulated as a fan.', 'Normals are generated from exported triangle winding.', 'Attachment transforms, UVs, original texture mapping, skin weights and animation are not included.', 'Wrapper translation candidates are metadata unless --apply-anchor-candidates is supplied.'] };
fs.writeFileSync(output.replace(/\.glb$/i, '') + '.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
