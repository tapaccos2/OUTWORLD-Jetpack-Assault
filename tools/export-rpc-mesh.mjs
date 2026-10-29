#!/usr/bin/env node
/**
 * Export a candidate OBJ mesh from a paired Outwars GPC/RPC resource set.
 *
 * Validated RPC layout:
 *   +0  u16 type/flags (not fully decoded)
 *   +2  u16 width
 *   +4  u16 depth
 *   +6  i16 sine component, fixed point scale ~4095
 *   +8  i16 cosine component, fixed point scale ~4095
 *   +10 i16 normal X
 *   +12 i16 normal Y
 *   +14 i16 normal Z
 *   +16/+20/+24/+28 i32 row-major corner heights
 *   +32/+36 i32 planar position pair
 *
 * Position-anchor semantics are not yet confirmed. The default assumes the
 * XY pair is the local (0,0) corner; --anchor=center exports the alternative
 * where it is the quad centre. The 1-2 diagonal is the default because the
 * stored normal agrees with corners 0,1,2. --diagonal=0-3 selects the other.
 *
 * Usage:
 *   node tools/export-rpc-mesh.mjs map.gpc map.rpc output.obj
 *   node tools/export-rpc-mesh.mjs map.gpc map.rpc output.obj --anchor=corner
 *   node tools/export-rpc-mesh.mjs map.gpc map.rpc output.obj --diagonal=0-3
 */
import fs from 'node:fs';

function fail(message) {
  console.error(message);
  process.exit(2);
}

function readPair(gpcPath, rpcPath) {
  const gpc = fs.readFileSync(gpcPath);
  const rpc = fs.readFileSync(rpcPath);
  if (gpc.length < 20 || gpc.toString('ascii', 0, 4) !== 'CPMG') fail('Invalid GPC magic/header');
  if (rpc.length < 20 || rpc.toString('ascii', 0, 4) !== 'CPMR') fail('Invalid RPC magic/header');
  const G = new DataView(gpc.buffer, gpc.byteOffset, gpc.byteLength);
  const R = new DataView(rpc.buffer, rpc.byteOffset, rpc.byteLength);
  const gpcCount = G.getUint32(16, true);
  const rpcCount = R.getUint32(16, true);
  if (G.getUint32(4, true) !== 0x43 || R.getUint32(4, true) !== 0x43) fail('Unexpected resource version');
  if (gpc.length !== 20 + gpcCount * 32) fail('GPC count/length mismatch');
  if (rpc.length !== 20 + rpcCount * 40) fail('RPC count/length mismatch');
  if (gpcCount > 200 || rpcCount > 1000) fail('Record count exceeds original parser limits');
  return { G, R, gpcCount, rpcCount };
}

function record(R, index) {
  const o = 20 + index * 40;
  const width = R.getUint16(o + 2, true);
  const depth = R.getUint16(o + 4, true);
  const sin = R.getInt16(o + 6, true) / 4095;
  const cos = R.getInt16(o + 8, true) / 4095;
  const normal = [
    R.getInt16(o + 10, true),
    R.getInt16(o + 12, true),
    R.getInt16(o + 14, true),
  ];
  const heights = [16, 20, 24, 28].map(p => R.getInt32(o + p, true));
  const x = R.getInt32(o + 32, true);
  const y = R.getInt32(o + 36, true);
  if (!width || !depth) fail(`RPC record ${index} has zero width/depth`);
  const normalLength = Math.hypot(...normal) || 1;
  return {
    index, width, depth, sin, cos, x, y, heights,
    normal: normal.map(v => v / normalLength),
  };
}

function verticesFor(rec, anchor) {
  const u0 = anchor === 'center' ? -rec.width / 2 : 0;
  const u1 = anchor === 'center' ? rec.width / 2 : rec.width;
  const v0 = anchor === 'center' ? -rec.depth / 2 : 0;
  const v1 = anchor === 'center' ? rec.depth / 2 : rec.depth;
  const local = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];
  return local.map(([u, v], i) => ({
    x: rec.x + u * rec.cos + v * rec.sin,
    y: rec.y - u * rec.sin + v * rec.cos,
    z: rec.heights[i],
  }));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) fail('Usage: node tools/export-rpc-mesh.mjs <map.gpc> <map.rpc> <output.obj> [--anchor=center|corner] [--diagonal=1-2|0-3]');
  const [gpcPath, rpcPath, outputPath, ...options] = args;
  const anchorOption = options.find(x => x.startsWith('--anchor='))?.slice('--anchor='.length) ?? 'corner';
  const diagonalOption = options.find(x => x.startsWith('--diagonal='))?.slice('--diagonal='.length) ?? '1-2';
  if (!['center', 'corner'].includes(anchorOption)) fail('Anchor must be center or corner');
  if (!['1-2', '0-3'].includes(diagonalOption)) fail('Diagonal must be 1-2 or 0-3');

  const { G, R, gpcCount, rpcCount } = readPair(gpcPath, rpcPath);
  const groups = [];
  let nextExpected = 0;
  for (let i = 0; i < gpcCount; i++) {
    const o = 20 + i * 32;
    const start = G.getUint16(o + 24, true);
    const end = G.getUint16(o + 26, true);
    if (start !== nextExpected || end < start || end >= rpcCount) {
      fail(`GPC group ${i} has an invalid/non-contiguous RPC range ${start}..${end}`);
    }
    groups.push({ index: i, start, end });
    nextExpected = end + 1;
  }
  if (nextExpected !== rpcCount) fail('GPC ranges do not cover the complete RPC table');

  const lines = [
    '# Candidate mesh exported from Outwars GPC/RPC records',
    '# Horizontal axes: RPC X/Y; vertical axis: stored corner height (Z-up)',
    `# Position assumption: ${anchorOption}`,
    `# Quad diagonal: ${diagonalOption}`,
    '# Dimensions, direction, normals, and corner-height relationships were validated.',
    '# Corner anchoring is supported by cross-surface edge continuity; original triangulation remains an assumption.',
  ];
  let vertexBase = 1;
  let faceCount = 0;
  for (const group of groups) {
    lines.push(`g gpc_group_${group.index}`);
    for (let i = group.start; i <= group.end; i++) {
      const rec = record(R, i);
      const verts = verticesFor(rec, anchorOption);
      lines.push(`# rpc_record_${i} type=${R.getUint16(20 + i * 40, true)} width=${rec.width} depth=${rec.depth}`);
      for (const v of verts) lines.push(`v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`);
      const n = rec.normal;
      lines.push(`vn ${n[0].toFixed(7)} ${n[1].toFixed(7)} ${n[2].toFixed(7)}`);
      const reverseWinding = rec.normal[2] < 0;
      if (diagonalOption === '1-2') {
        const tris = reverseWinding ? [[0, 2, 1], [1, 2, 3]] : [[0, 1, 2], [1, 3, 2]];
        for (const tri of tris) lines.push(`f ${tri.map(k => `${vertexBase + k}//${i + 1}`).join(' ')}`);
      } else {
        const tris = reverseWinding ? [[0, 3, 1], [0, 2, 3]] : [[0, 1, 3], [0, 3, 2]];
        for (const tri of tris) lines.push(`f ${tri.map(k => `${vertexBase + k}//${i + 1}`).join(' ')}`);
      }
      vertexBase += 4;
      faceCount += 2;
    }
  }
  fs.writeFileSync(outputPath, lines.join('\n') + '\n');
  console.log(JSON.stringify({
    output: outputPath,
    gpcGroups: gpcCount,
    rpcSurfaces: rpcCount,
    vertices: rpcCount * 4,
    triangles: faceCount,
    anchor: anchorOption,
    diagonal: diagonalOption,
    note: 'Candidate geometry only; compare anchor and diagonal variants against an original map reference.',
  }, null, 2));
}

main();
