#!/usr/bin/env node
/**
 * Inspect the shared CPMG/.GPC and CPMR/.RPC record layouts.
 *
 * The executable's allocation limits correspond to 200 x 32-byte group
 * records (0x1900 bytes) and 1000 x 40-byte ramp records (0x9c40 bytes).
 * Sample files such as rag01.gpc and rag01.rpc validate the 20-byte header +
 * count * record-size equation exactly. This tool validates structure and
 * prints raw record words; it does not claim semantic decoding or a mesh.
 *
 * Usage:
 *   node tools/inspect-grp-rmp.mjs original-data/structs/rag01.gpc original-data/structs/rag01.rpc
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/inspect-grp-rmp.mjs <file.gpc|file.rpc> [...]');
  process.exit(2);
}

function inspect(file) {
  const b = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const expectedMagic = ext === '.gpc' ? 'CPMG' : ext === '.rpc' ? 'CPMR' : null;
  const recordSize = ext === '.gpc' ? 32 : ext === '.rpc' ? 40 : null;
  const maxCount = ext === '.gpc' ? 200 : ext === '.rpc' ? 1000 : null;
  const errors = [];
  if (!expectedMagic) errors.push('Extension must be .gpc or .rpc');
  if (b.length < 20) errors.push('File shorter than 20-byte header');
  const magic = b.toString('ascii', 0, Math.min(4, b.length));
  if (expectedMagic && magic !== expectedMagic) errors.push(`Expected ${expectedMagic}, found ${magic}`);
  const version = b.length >= 8 ? b.readUInt32LE(4) : null;
  const headerWord8 = b.length >= 12 ? b.readUInt32LE(8) : null;
  const headerWord12 = b.length >= 16 ? b.readUInt32LE(12) : null;
  const count = b.length >= 20 ? b.readUInt32LE(16) : null;
  if (version !== null && version !== 0x43) errors.push(`Expected version 0x43, found 0x${version.toString(16)}`);
  if (count !== null && count > maxCount) errors.push(`Count ${count} exceeds executable limit ${maxCount}`);
  if (count !== null && recordSize !== null && 20 + count * recordSize !== b.length) {
    errors.push(`Expected length ${20 + count * recordSize} from 20-byte header + ${count} x ${recordSize}, found ${b.length}`);
  }
  const records = [];
  if (!errors.length) {
    for (let i = 0; i < count; i++) {
      const offset = 20 + i * recordSize;
      const words = [];
      const u16le = [];
      const i16le = [];
      for (let p = 0; p < recordSize; p += 4) words.push(b.readUInt32LE(offset + p));
      for (let p = 0; p < recordSize; p += 2) {
        const value = b.readUInt16LE(offset + p);
        u16le.push(value);
        i16le.push(value >= 0x8000 ? value - 0x10000 : value);
      }
      records.push({
        index: i,
        offset,
        hex: b.subarray(offset, offset + recordSize).toString('hex').match(/.{1,8}/g).join(' '),
        u32le: words,
        u16le,
        i16le,
      });
    }
  }
  return {
    file,
    bytes: b.length,
    magic,
    version,
    headerWord8,
    headerWord12,
    count,
    recordSize,
    maxCount,
    structurallyValid: errors.length === 0,
    errors,
    records,
    limitation: 'Record boundaries are validated; field meanings, coordinates, and terrain mesh topology remain undecoded.',
  };
}

const output = files.map(file => {
  try {
    return inspect(file);
  } catch (error) {
    return { file, structurallyValid: false, errors: [String(error.message ?? error)] };
  }
});
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
if (output.some(x => !x.structurallyValid)) process.exitCode = 1;
