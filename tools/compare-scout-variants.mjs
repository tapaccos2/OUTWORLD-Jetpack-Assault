#!/usr/bin/env node
/**
 * Cross-variant Scout graph comparison.
 *
 * Usage:
 *   node tools/compare-scout-variants.mjs /path/to/extracted/units /tmp/scout-variants.json
 *
 * Runs the low-level graph audit on every scout_*.dpc file and compares:
 * - type-2 fields at +8/+12/+16 and +32/+36/+40;
 * - mesh-node +28 references and face-data pointers;
 * - referenced geometry bounds and index coverage;
 * - list/root class variants.
 *
 * The output labels all unproven fields as candidates, not semantic facts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const inputDir = path.resolve(process.argv[2] || 'units');
const outputFile = path.resolve(process.argv[3] || 'scout-variant-comparison.json');
const root = process.cwd();
const inspector = path.join(root, 'tools', 'inspect-scout-part-graph.mjs');

function fail(message) {
  console.error(JSON.stringify({ status: 'FAILED', error: message }, null, 2));
  process.exit(1);
}
function signedFromHex(hex) {
  if (!hex) return null;
  const n = Number.parseInt(hex, 16) >>> 0;
  return n > 0x7fffffff ? n - 0x100000000 : n;
}
function vecKey(v) {
  return Array.isArray(v) ? v.join(',') : 'missing';
}
function stableCounts(values) {
  const counts = new Map();
  for (const value of values) {
    const key = vecKey(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value: value === 'missing' ? null : value.split(',').map(Number), count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}
function audit(file, tempFile) {
  const result = spawnSync(process.execPath, [inspector, file, tempFile], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0 || !fs.existsSync(tempFile)) {
    throw new Error(path.basename(file) + ': graph audit failed\n' + (result.stderr || result.stdout || 'No report produced'));
  }
  return JSON.parse(fs.readFileSync(tempFile, 'utf8'));
}
function wrapperVector(wrapper) {
  const words = wrapper?.rawFirst32?.words32;
  if (!Array.isArray(words)) return null;
  return [20, 24, 28].map(offset => words.find(word => word.offset === offset)?.s32 ?? null);
}
function wrapperConstants(wrapper) {
  const words = wrapper?.rawFirst32?.words32;
  if (!Array.isArray(words)) return null;
  return {
    firstDword: words.find(word => word.offset === 0)?.u32 ?? null,
    secondDword: words.find(word => word.offset === 4)?.u32 ?? null,
    vectorAt20: wrapperVector(wrapper)
  };
}
function planarDirectionDeltaDeg(meshVector, pairedVector) {
  if (!Array.isArray(meshVector) || !Array.isArray(pairedVector) ||
      meshVector.length < 2 || pairedVector.length < 2) return null;
  const cross = pairedVector[0] * meshVector[1] - pairedVector[1] * meshVector[0];
  const dot = pairedVector[0] * meshVector[0] + pairedVector[1] * meshVector[1];
  return Number((Math.atan2(cross, dot) * 180 / Math.PI).toFixed(3));
}
function compactPart(entry, bytes) {
  const d = entry.detail;
  const mesh = d?.child24Detail;
  const paired = d?.child28Detail;
  const meshVector = mesh?.fields?.signedVectorAt8Candidate ?? null;
  const pairedVector = paired?.fields?.signedVectorAt8Candidate ?? null;
  const meshReferenceOffset = mesh?.fields?.plus28?.targetOffset ?? null;
  const meshReferencePointCandidate = Number.isInteger(meshReferenceOffset) &&
    meshReferenceOffset >= 0 && meshReferenceOffset + 8 <= bytes.length
    ? [bytes.readInt16LE(meshReferenceOffset), bytes.readInt16LE(meshReferenceOffset + 2), bytes.readInt16LE(meshReferenceOffset + 4)]
    : null;
  return {
    partListIndex: entry.index,
    ownerOffset: d?.offset ?? null,
    ownerVectorCandidate: d?.ownerVectorCandidate ?? null,
    meshNodeOffset: mesh?.offset ?? null,
    meshType2VectorAt8Candidate: meshVector,
    pairedType2VectorAt8Candidate: pairedVector,
    meshVectorVsPairedVectorPlanarDeltaDegCandidate: planarDirectionDeltaDeg(meshVector, pairedVector),
    meshReferencePointXYZCandidate: meshReferencePointCandidate,
    meshType2VectorAt32Candidate: mesh?.fields?.signedVectorAt32Candidate ?? null,
    meshType2VectorAt56Candidate: mesh?.fields ? [
      mesh.fields.plus56?.s32 ?? null,
      signedFromHex(mesh.fields.plus60?.rawHex)
    ] : null,
    meshType16WrapperFields: wrapperConstants(mesh?.wrapper),
    meshNodePlus28ReferenceOffset: mesh?.fields?.plus28?.targetOffset ?? null,
    faceDataOffsetCandidate: mesh?.fields?.plus36?.targetOffset ?? null,
    pairedType2Offset: paired?.offset ?? null,
    pairedType2VectorAt32Candidate: paired?.fields?.signedVectorAt32Candidate ?? null,
    pairedType16WrapperFields: wrapperConstants(paired?.wrapper),
    pairedNodePointerTargets: paired?.alignedPointerCandidates?.map(p => ({
      fieldOffset: p.fieldOffset,
      targetOffset: p.targetOffset,
      targetType: p.targetHeader?.type
    })) ?? [],
    ownerVectorMatchesPaired32: d?.pairChecks?.vectorsMatch ?? false,
    geometrySharedBase: d?.geometry ? {
      vertexBaseOffset: d.geometry.vertexBaseOffset,
      referencedVertexCount: d.geometry.referencedVertexCount,
      triangles: d.geometry.triangles,
      indexMin: d.geometry.indexMin,
      indexMax: d.geometry.indexMax,
      indexRanges: d.geometry.indexRanges,
      bounds: d.geometry.bounds,
      centroid: d.geometry.centroid
    } : null,
    geometryMeshReferenceBase: d?.meshReferenceGeometry ? {
      vertexBaseOffset: d.meshReferenceGeometry.vertexBaseOffset,
      referencedVertexCount: d.meshReferenceGeometry.referencedVertexCount,
      triangles: d.meshReferenceGeometry.triangles,
      indexMin: d.meshReferenceGeometry.indexMin,
      indexMax: d.meshReferenceGeometry.indexMax,
      indexRanges: d.meshReferenceGeometry.indexRanges,
      bounds: d.meshReferenceGeometry.bounds,
      centroid: d.meshReferenceGeometry.centroid
    } : null,
    vertexSliceCandidate: d?.vertexSliceCandidate ?? null
  };
}
try {
  if (!fs.existsSync(inspector)) fail('Missing graph inspector: ' + inspector);
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) fail('Input must be an extracted units directory: ' + inputDir);
  const files = fs.readdirSync(inputDir)
    .filter(name => /^scout_.*\.dpc$/i.test(name))
    .sort()
    .map(name => path.join(inputDir, name));
  if (files.length === 0) fail('No scout_*.dpc variants found in ' + inputDir);
  const tempDir = path.join(path.dirname(outputFile), '.scout-variant-audit');
  fs.mkdirSync(tempDir, { recursive: true });
  const variants = files.map(file => {
    const reportFile = path.join(tempDir, path.basename(file) + '.json');
    const report = audit(file, reportFile);
    return {
      name: path.basename(file, '.dpc'),
      rootClass: report.rootClass,
      partClass: report.partClass,
      summary: report.summary,
      wrapperFieldLinkPattern: report.graph.linkPatternSummary ?? null,
      wrapperFieldLinks: (report.graph.wrapperFieldLinks ?? []).map(link => ({
        sourceRole: link.sourceRole,
        sourceNodeOffset: link.sourceNodeOffset,
        wrapperValue: link.wrapperValue,
        targetOffset: link.targetOffset,
        targetField: link.matchedRecordFields?.[0] ?? null,
        targetFieldValue: link.targetFieldValue ?? null,
        targetFieldBytesHex: link.targetFieldBytesHex ?? null
      })),
      rootGeometry: report.graph.rootGeometry ? {
        referencedVertexCount: report.graph.rootGeometry.referencedVertexCount,
        triangles: report.graph.rootGeometry.triangles,
        bounds: report.graph.rootGeometry.bounds
      } : null,
      parts: report.graph.entries.slice(0, 8).map(entry => compactPart(entry, fs.readFileSync(file)))
    };
  });

  const partsByIndex = Array.from({ length: 8 }, (_, i) => variants.flatMap(v =>
    v.parts[i] ? [{
      variant: v.name,
      meshVectorAt8: v.parts[i].meshType2VectorAt8Candidate,
      meshVectorVsPairedVectorPlanarDeltaDegCandidate: v.parts[i].meshVectorVsPairedVectorPlanarDeltaDegCandidate,
      meshReferencePointXYZCandidate: v.parts[i].meshReferencePointXYZCandidate,
      meshVectorAt56: v.parts[i].meshType2VectorAt56Candidate,
      meshWrapperFields: v.parts[i].meshType16WrapperFields,
      pairedVectorAt8: v.parts[i].pairedType2VectorAt8Candidate,
      pairedWrapperFields: v.parts[i].pairedType16WrapperFields,
      pairedVectorAt32: v.parts[i].pairedType2VectorAt32Candidate,
      ownerVector: v.parts[i].ownerVectorCandidate,
      meshPlus28: v.parts[i].meshNodePlus28ReferenceOffset,
      faceOffset: v.parts[i].faceDataOffsetCandidate,
      indexRangesSharedBase: v.parts[i].geometrySharedBase?.indexRanges ?? null,
      boundsSharedBase: v.parts[i].geometrySharedBase?.bounds ?? null,
      indexRangesMeshReferenceBase: v.parts[i].geometryMeshReferenceBase?.indexRanges ?? null,
      boundsMeshReferenceBase: v.parts[i].geometryMeshReferenceBase?.bounds ?? null,
      vertexSliceCandidate: v.parts[i].vertexSliceCandidate
    }] : []
  ));
  const summary = {
    variantCount: variants.length,
    variantNames: variants.map(v => v.name),
    rootPartClassPairs: [...new Set(variants.map(v => v.rootClass + '/' + v.partClass))],
    allVariantsHaveEightPartOwnerSlots: variants.every(v => v.parts.length === 8),
    allEightOwnerVectorsMatchPaired32: variants.every(v => v.parts.every(p => p.ownerVectorMatchesPaired32)),
    allMeshPlus56Plus60MatchPairedPlus8Plus12: variants.every(v => v.parts.every(p =>
      p.meshType2VectorAt56Candidate?.[0] === p.pairedType2VectorAt8Candidate?.[0] &&
      p.meshType2VectorAt56Candidate?.[1] === p.pairedType2VectorAt8Candidate?.[1])),
    allMeshWrapperVectorsMatchMeshType2Plus8: variants.every(v => v.parts.every(p =>
      Array.isArray(p.meshType16WrapperFields?.vectorAt20) &&
      p.meshType16WrapperFields.vectorAt20.every((value, k) => value === p.meshType2VectorAt8Candidate?.[k]))),
    allPairedWrapperVectorsMatchPairedType2Plus8: variants.every(v => v.parts.every(p =>
      Array.isArray(p.pairedType16WrapperFields?.vectorAt20) &&
      p.pairedType16WrapperFields.vectorAt20.every((value, k) => value === p.pairedType2VectorAt8Candidate?.[k]))),
    meshWrapperConstantsByPart: Array.from({length:8},(_,i)=>({
      part:i+1,
      values:stableCounts(variants.map(v=>[
        v.parts[i]?.meshType16WrapperFields?.firstDword ?? null,
        v.parts[i]?.meshType16WrapperFields?.secondDword ?? null
      ]))
    })),
    pairedWrapperConstantsByPart: Array.from({length:8},(_,i)=>({
      part:i+1,
      values:stableCounts(variants.map(v=>[
        v.parts[i]?.pairedType16WrapperFields?.firstDword ?? null,
        v.parts[i]?.pairedType16WrapperFields?.secondDword ?? null
      ]))
    })),
    allVariantsShareWrapperFieldPattern: variants.every(v =>
      JSON.stringify(v.wrapperFieldLinkPattern) === JSON.stringify(variants[0].wrapperFieldLinkPattern)),
    wrapperFieldLinkPattern: variants[0].wrapperFieldLinkPattern,
    allMeshReferenceOffsetsEightByteAligned: variants.every(v =>
      v.parts.every(p => p.vertexSliceCandidate?.eightByteAligned === true)),
    allMeshReferenceRangesWithinFile: variants.every(v =>
      v.parts.every(p => p.vertexSliceCandidate?.withinFileBounds === true)),
    allMeshReferenceSlicesHaveGeometry: variants.every(v =>
      v.parts.every(p => (p.geometryMeshReferenceBase?.triangles ?? 0) > 0)),
    meshReferenceBaseOffsetsPerPart: Array.from({length:8},(_,i)=>({
      part:i+1,
      offsets:stableCounts(variants.map(v=>v.parts[i]?.vertexSliceCandidate?.meshVertexReference == null
        ? null : [v.parts[i].vertexSliceCandidate.meshVertexReference])),
      startVertexIndices:stableCounts(variants.map(v=>v.parts[i]?.vertexSliceCandidate?.startVertexIndexCandidate == null
        ? null : [v.parts[i].vertexSliceCandidate.startVertexIndexCandidate])),
      effectiveMaxVertexIndices:stableCounts(variants.map(v=>v.parts[i]?.vertexSliceCandidate?.effectiveMaxVertexIndexCandidate == null
        ? null : [v.parts[i].vertexSliceCandidate.effectiveMaxVertexIndexCandidate]))
    })),
    commonFieldPatternsByPart: partsByIndex.map((rows, i) => ({
      part: i + 1,
      meshType2VectorAt8Counts: stableCounts(rows.map(r => r.meshVectorAt8)),
      meshReferencePointXYZCounts: stableCounts(rows.map(r => r.meshReferencePointXYZCandidate)),
      planarDirectionDeltaDegCandidateCounts: stableCounts(rows.map(r =>
        r.meshVectorVsPairedVectorPlanarDeltaDegCandidate == null
          ? null : [r.meshVectorVsPairedVectorPlanarDeltaDegCandidate])),
      pairedType2VectorAt8Counts: stableCounts(rows.map(r => r.pairedVectorAt8)),
      pairedType2VectorAt32Counts: stableCounts(rows.map(r => r.pairedVectorAt32)),
      ownerVectorCounts: stableCounts(rows.map(r => r.ownerVector))
    }))
  };
  const output = {
    status: 'COMPLETED',
    purpose: 'Cross-variant structural comparison; no unverified field is assigned a semantic name.',
    inputDirectory: inputDir,
    summary,
    variants,
    perPartAcrossVariants: partsByIndex,
    interpretationLimits: [
      'A repeated 3-component value is only a numeric field pattern, not proof of position, Euler rotation, normal, scale or bone data.',
      'A 4096-unit full turn is a preview hypothesis only; it must not be treated as decoded without executable evidence.',
      'Geometry is still a raw extraction. This audit does not apply transforms or construct a skeleton.'
    ]
  };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ status: output.status, summary, output: outputFile }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.stack : String(error));
}
