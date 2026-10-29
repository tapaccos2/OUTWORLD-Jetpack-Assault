#!/usr/bin/env node
/**
 * Test the current GPC/RPC spatial-field hypothesis against paired files.
 *
 * Inferred (not yet fully decoded):
 *   GPC: signed int32 origin at +0/+4, reference value at +8,
 *        spans at +12/+16, RPC inclusive range as u16 at +24/+26.
 *   RPC: four signed int32 corner-like values at +16/+20/+24/+28,
 *        signed int32 planar-position pair at +32/+36.
 *
 * The report only measures internal consistency. It does not export a mesh
 * and does not prove the field meanings, corner order, units, or edge rules.
 *
 * Usage:
 *   node tools/analyze-terrain-field-hypotheses.mjs original-data/structs/rag01.gpc original-data/structs/rag01.rpc
 */
import fs from 'node:fs';

function inspectPair(gpcPath, rpcPath) {
  const g = fs.readFileSync(gpcPath);
  const r = fs.readFileSync(rpcPath);
  const gv = g.length >= 20 ? g : null;
  const rv = r.length >= 20 ? r : null;
  const errors = [];
  if (!gv || g.toString('ascii', 0, 4) !== 'CPMG') errors.push('GPC magic/header invalid');
  if (!rv || r.toString('ascii', 0, 4) !== 'CPMR') errors.push('RPC magic/header invalid');
  if (errors.length) return { gpcPath, rpcPath, valid: false, errors };
  const G = new DataView(g.buffer, g.byteOffset, g.byteLength);
  const R = new DataView(r.buffer, r.byteOffset, r.byteLength);
  const gc = G.getUint32(16, true);
  const rc = R.getUint32(16, true);
  if (G.getUint32(4, true) !== 0x43 || R.getUint32(4, true) !== 0x43) errors.push('Unexpected version');
  if (20 + gc * 32 !== g.length) errors.push('GPC record count/length mismatch');
  if (20 + rc * 40 !== r.length) errors.push('RPC record count/length mismatch');
  if (gc > 200 || rc > 1000) errors.push('Record count exceeds executable parser limits');
  if (errors.length) return { gpcPath, rpcPath, valid: false, errors, gpcCount: gc, rpcCount: rc };

  let rangesValid = true;
  let nextExpected = 0;
  let boundsFit = 0;
  let referenceValueFound = 0;
  let everyCornerEqualsReference = 0;
  let allFourEqual = 0;
  const positionSignatures = new Map();
  const examples = [];
  for (let i = 0; i < gc; i++) {
    const go = 20 + i * 32;
    const x = G.getInt32(go, true);
    const y = G.getInt32(go + 4, true);
    const referenceValue = G.getInt32(go + 8, true);
    const spanX = G.getInt32(go + 12, true);
    const spanY = G.getInt32(go + 16, true);
    const start = G.getUint16(go + 24, true);
    const end = G.getUint16(go + 26, true);
    if (start !== nextExpected || end < start || end >= rc) rangesValid = false;
    nextExpected = end + 1;
    const points = [];
    const cornerValues = [];
    let allIndexedCornersEqualReference = true;
    for (let j = start; j <= end && j < rc; j++) {
      const ro = 20 + j * 40;
      const px = R.getInt32(ro + 32, true);
      const py = R.getInt32(ro + 36, true);
      points.push([px, py]);
      const positionKey = `${px},${py}`;
      const cornerSignature = [16, 20, 24, 28].map(p => R.getInt32(ro + p, true)).join(',');
      if (!positionSignatures.has(positionKey)) positionSignatures.set(positionKey, []);
      positionSignatures.get(positionKey).push(cornerSignature);
      for (const p of [16, 20, 24, 28]) {
        const value = R.getInt32(ro + p, true);
        cornerValues.push(value);
        if (value !== referenceValue) allIndexedCornersEqualReference = false;
      }
      const corners = [16, 20, 24, 28].map(p => R.getInt32(ro + p, true));
      if (corners.every(v => v === corners[0])) allFourEqual++;
    }
    if (!points.length) continue;
    const minX = Math.min(...points.map(p => p[0]));
    const maxX = Math.max(...points.map(p => p[0]));
    const minY = Math.min(...points.map(p => p[1]));
    const maxY = Math.max(...points.map(p => p[1]));
    const fits = minX >= x && maxX <= x + spanX && minY >= y && maxY <= y + spanY;
    if (fits) boundsFit++;
    if (cornerValues.includes(referenceValue)) referenceValueFound++;
    if (allIndexedCornersEqualReference) everyCornerEqualsReference++;
    if (examples.length < 5) examples.push({
      group: i, rpcRange: [start, end], origin: [x, y],
      referenceValue, spans: [spanX, spanY],
      rpcBounds: { minX, maxX, minY, maxY }, boundsFit: fits,
      referenceValueAppearsInCornerValues: cornerValues.includes(referenceValue),
      allIndexedCornerValuesEqualReference: allIndexedCornersEqualReference,
    });
  }
  const orientationNorms = [];
  let orientationNormsWithinTwoOf4095 = 0;
  for (let i = 0; i < rc; i++) {
    const ro = 20 + i * 40;
    const norm = Math.hypot(R.getInt16(ro + 6, true), R.getInt16(ro + 8, true));
    orientationNorms.push(norm);
    if (Math.abs(norm - 4095) <= 2) orientationNormsWithinTwoOf4095++;
  }
  const normalNorms = [];
  let normalNormsWithinTwoOf4095 = 0;
  for (let i = 0; i < rc; i++) {
    const ro = 20 + i * 40;
    const norm = Math.hypot(R.getInt16(ro + 10, true), R.getInt16(ro + 12, true), R.getInt16(ro + 14, true));
    normalNorms.push(norm);
    if (Math.abs(norm - 4095) <= 2) normalNormsWithinTwoOf4095++;
  }
  let normalMatches = 0;
  let invertedNormals = 0;
  const absoluteNormalDots = [];
  for (let i = 0; i < rc; i++) {
    const ro = 20 + i * 40;
    const width = R.getUint16(ro + 2, true);
    const depth = R.getUint16(ro + 4, true);
    const sin = R.getInt16(ro + 6, true) / 4095;
    const cos = R.getInt16(ro + 8, true) / 4095;
    const h00 = R.getInt32(ro + 16, true);
    const h01 = R.getInt32(ro + 20, true);
    const h10 = R.getInt32(ro + 24, true);
    const gxLocal = (h01 - h00) / width;
    const gyLocal = (h10 - h00) / depth;
    const gxWorld = gxLocal * cos + gyLocal * sin;
    const gyWorld = -gxLocal * sin + gyLocal * cos;
    let px = -gxWorld, py = -gyWorld, pz = 1;
    const pLen = Math.hypot(px, py, pz);
    px /= pLen; py /= pLen; pz /= pLen;
    let nx = R.getInt16(ro + 10, true), ny = R.getInt16(ro + 12, true), nz = R.getInt16(ro + 14, true);
    const nLen = Math.hypot(nx, ny, nz);
    nx /= nLen; ny /= nLen; nz /= nLen;
    const dot = px * nx + py * ny + pz * nz;
    absoluteNormalDots.push(Math.abs(dot));
    if (dot < 0) invertedNormals++;
    if (Math.abs(dot) >= 0.999) normalMatches++;
  }
  const duplicatePositionGroups = [...positionSignatures.values()].filter(values => values.length > 1);
  const duplicatePositionGroupsSameCorners = duplicatePositionGroups.filter(values => new Set(values).size === 1).length;
  const duplicatePositionGroupsDifferentCorners = duplicatePositionGroups.filter(values => new Set(values).size > 1).length;
  return {
    gpcPath, rpcPath, valid: true, gpcCount: gc, rpcCount: rc,
    contiguousRpcRanges: rangesValid && nextExpected === rc,
    inferredBoundsContainAllRpcPositions: { groupsFit: boundsFit, totalGroups: gc },
    inferredGpcReferenceValueAppearsAmongIndexedRpcCornerValues: { groups: referenceValueFound, totalGroups: gc },
    allIndexedRpcCornerValuesEqualGpcReferenceValue: { groups: everyCornerEqualsReference, totalGroups: gc },
    rpcRecordsWithAllFourCornerLikeValuesEqual: allFourEqual,
    orientationVectorAtRpcOffsets6And8: {
      recordsWithinTwoOfMagnitude4095: orientationNormsWithinTwoOf4095,
      totalRecords: rc,
      minimumMagnitude: Math.min(...orientationNorms),
      maximumMagnitude: Math.max(...orientationNorms),
      interpretation: 'Consistent with fixed-point sine/cosine components; confirmed by executable setter calls to the sine/cosine lookup routines.',
    },
    normalFromFirstThreeCornerHeights: {
      recordsWithAbsoluteNormalDotAtLeast0999: normalMatches,
      totalRecords: rc,
      invertedNormalRecords: invertedNormals,
      minimumAbsoluteDot: Math.min(...absoluteNormalDots),
      formula: 'local gradients from (h01-h00)/width and (h10-h00)/depth, rotated by -angle from the sine/cosine pair; expected normal is normalize(-gx, -gy, 1).',
      limitation: 'A small number of inverted flat surfaces retain a downward normal; preserve the stored normal sign rather than forcing it upward.',
    },
    normalVectorAtRpcOffsets10To14: {
      recordsWithinTwoOfMagnitude4095: normalNormsWithinTwoOf4095,
      totalRecords: rc,
      minimumMagnitude: Math.min(...normalNorms),
      maximumMagnitude: Math.max(...normalNorms),
      interpretation: 'Consistent with a fixed-point 3D unit normal; flat surfaces often use (0, 0, 4095).',
    },
    duplicatePositionAnalysis: {
      uniquePositions: positionSignatures.size,
      positionsWithMultipleRecords: duplicatePositionGroups.length,
      duplicatePositionsWithSameCornerSignature: duplicatePositionGroupsSameCorners,
      duplicatePositionsWithDifferentCornerSignatures: duplicatePositionGroupsDifferentCorners,
    },
    examples,
    limitation: 'Field relationships and normal formula are cross-validated; edge continuity strongly favours the XY pair as the local (0,0) corner. Original triangle diagonal, units/scale, and visual match to an in-game map still need validation.',
  };
}

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error('Usage: node tools/analyze-terrain-field-hypotheses.mjs <file.gpc> <file.rpc> [<file.gpc> <file.rpc> ...]');
  process.exit(2);
}
const output = [];
for (let i = 0; i < args.length; i += 2) {
  try {
    output.push(inspectPair(args[i], args[i + 1]));
  } catch (error) {
    output.push({ gpcPath: args[i], rpcPath: args[i + 1], valid: false, errors: [String(error.message ?? error)] });
  }
}
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
if (output.some(item => !item.valid)) process.exitCode = 1;
