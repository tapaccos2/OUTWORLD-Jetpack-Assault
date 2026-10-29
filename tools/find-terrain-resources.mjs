#!/usr/bin/env node
/**
 * Search loose assets and known-format FF archives for terrain resources.
 *
 * Finds filenames ending in .GRP/.RMP and checks resource payload headers for
 * CPMG/CPMR signatures. FF parsing is deliberately limited to the observed
 * count + 44-byte directory format; archives that fail validation are reported
 * as unparsed rather than guessed.
 *
 * Usage:
 *   node tools/find-terrain-resources.mjs original-data
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? 'original-data';
if (!fs.existsSync(root)) {
  console.error(`Path does not exist: ${root}`);
  process.exit(2);
}

const hits = [];
const unparsedArchives = [];
const looseFiles = [];

function inspectBytes(label, bytes, source) {
  const sigs = [];
  for (const [magic, format] of [['CPMG', 'GRP'], ['CPMR', 'RMP']]) {
    let from = 0;
    while (from <= bytes.length - 4) {
      const offset = bytes.indexOf(magic, from, 'ascii');
      if (offset < 0) break;
      sigs.push({ magic, format, offset });
      from = offset + 1;
    }
  }
  if (/\.(grp|rmp)$/i.test(label) || sigs.length) {
    hits.push({
      name: label,
      source,
      bytes: bytes.length,
      extension: path.extname(label).toUpperCase(),
      signatures: sigs.slice(0, 50),
      signatureCount: sigs.length,
    });
  }
}

function parseFF(file, data) {
  if (data.length < 4) throw new Error('short header');
  const count = data.readUInt32LE(0);
  if (count < 1 || count > 100000) throw new Error(`implausible count ${count}`);
  const tableEnd = 4 + count * 44;
  if (tableEnd > data.length) throw new Error('directory table extends beyond EOF');
  const entries = [];
  for (let i = 0; i < count; i++) {
    const p = 4 + i * 44;
    const offset = data.readUInt32LE(p);
    const rawName = data.subarray(p + 4, p + 44);
    const nul = rawName.indexOf(0);
    const name = rawName.subarray(0, nul < 0 ? rawName.length : nul).toString('latin1');
    if (offset > data.length) throw new Error(`entry ${i} offset beyond EOF`);
    entries.push({ offset, name });
  }
  if (entries[0].offset !== tableEnd) throw new Error('first payload does not follow directory');
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].offset < entries[i - 1].offset) throw new Error('offsets are not monotonic');
  }
  if (entries.at(-1).name !== '' || entries.at(-1).offset !== data.length) {
    throw new Error('missing empty-name EOF sentinel');
  }
  for (let i = 0; i < entries.length - 1; i++) {
    const e = entries[i];
    if (!e.name || e.name === '.' || e.name === '..' || /[\\/]/.test(e.name)) {
      throw new Error(`unexpected/unsafe resource name at entry ${i}`);
    }
    const end = entries[i + 1].offset;
    inspectBytes(e.name, data.subarray(e.offset, end), `${file} :: ${e.name}`);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    const data = fs.readFileSync(full);
    looseFiles.push({ file: full, bytes: data.length });
    if (/\.ff$/i.test(full)) {
      try {
        parseFF(full, data);
      } catch (error) {
        unparsedArchives.push({ file: full, bytes: data.length, reason: String(error.message ?? error) });
      }
    }
    inspectBytes(path.basename(full), data, full);
  }
}

walk(root);
const unique = new Map();
for (const hit of hits) {
  const key = `${hit.source}\0${hit.name}`;
  if (!unique.has(key)) unique.set(key, hit);
}
const report = {
  root,
  filesScanned: looseFiles.length,
  ffArchivesUnparsed: unparsedArchives.length,
  hits: [...unique.values()],
  unparsedArchives,
  notes: [
    'A filename/signature hit is a candidate, not proof that terrain semantics are decoded.',
    'Archives with an unfamiliar layout are reported, not parsed using guessed offsets.',
    'Signature scanning may find incidental byte sequences inside unrelated binary payloads.',
  ],
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
