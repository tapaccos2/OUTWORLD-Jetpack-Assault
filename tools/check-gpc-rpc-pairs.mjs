#!/usr/bin/env node
/**
 * Cross-check paired .GPC/.RPC resources without assigning undocumented meanings
 * to other fields. In sampled campaign pairs, GPC record u16 fields at byte
 * offsets 24 and 26 form inclusive start/end ranges into the paired RPC table.
 *
 * Usage:
 *   node tools/check-gpc-rpc-pairs.mjs original-data/structs
 */
import fs from 'node:fs';
import path from 'node:path';

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('Usage: node tools/check-gpc-rpc-pairs.mjs <directory> [...]');
  process.exit(2);
}
const results = [];
let failures = 0;

for (const dir of dirs) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.gpc') continue;
    const gpcPath = path.join(dir, entry.name);
    const rpcPath = path.join(dir, path.basename(entry.name, path.extname(entry.name)) + '.rpc');
    if (!fs.existsSync(rpcPath)) {
      results.push({ gpc: gpcPath, error: 'matching .rpc file not found' });
      failures++;
      continue;
    }
    const g = fs.readFileSync(gpcPath);
    const r = fs.readFileSync(rpcPath);
    const errors = [];
    if (g.length < 20 || g.toString('ascii', 0, 4) !== 'CPMG' || g.readUInt32LE(4) !== 0x43) errors.push('invalid GPC header');
    if (r.length < 20 || r.toString('ascii', 0, 4) !== 'CPMR' || r.readUInt32LE(4) !== 0x43) errors.push('invalid RPC header');
    const gCount = g.length >= 20 ? g.readUInt32LE(16) : 0;
    const rCount = r.length >= 20 ? r.readUInt32LE(16) : 0;
    if (g.length !== 20 + gCount * 32) errors.push('GPC length/count mismatch');
    if (r.length !== 20 + rCount * 40) errors.push('RPC length/count mismatch');
    const ranges = [];
    if (!errors.length) {
      for (let i = 0; i < gCount; i++) {
        const o = 20 + i * 32;
        ranges.push([g.readUInt16LE(o + 24), g.readUInt16LE(o + 26)]);
      }
    }
    let boundsValid = true, monotonic = true, contiguous = true;
    let expectedStart = 0, maxEnd = -1;
    for (const [start, end] of ranges) {
      if (start > end || end >= rCount) boundsValid = false;
      if (start !== expectedStart) contiguous = false;
      if (start < maxEnd + 1) monotonic = false;
      expectedStart = end + 1;
      maxEnd = end;
    }
    const coversAllRpcRecords = ranges.length > 0 && ranges[0][0] === 0 && maxEnd === rCount - 1 && contiguous;
    const valid = errors.length === 0 && boundsValid && monotonic && coversAllRpcRecords;
    if (!valid) failures++;
    results.push({
      gpc: gpcPath,
      rpc: rpcPath,
      gpcRecords: gCount,
      rpcRecords: rCount,
      candidateRangeFields: { startU16ByteOffset: 24, inclusiveEndU16ByteOffset: 26 },
      firstRanges: ranges.slice(0, 8),
      lastRange: ranges.at(-1) ?? null,
      boundsValid,
      monotonic,
      contiguous,
      coversAllRpcRecords,
      validPair: valid,
      errors,
      note: 'This validates a repeated cross-file range pattern. It does not decode the geometric meaning of RPC records or other GPC fields.',
    });
  }
}
process.stdout.write(JSON.stringify(results, null, 2) + '\n');
if (failures) process.exitCode = 1;
