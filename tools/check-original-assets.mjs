#!/usr/bin/env node
/**
 * Compare filenames referenced by original .MIS files against files present
 * under original-data. This is a dependency audit, not a format decoder.
 *
 * Usage:
 *   node tools/check-original-assets.mjs original-data
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'original-data');
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) files.push(full);
  }
}
walk(root);

const byLowerName = new Map();
for (const file of files) {
  const key = path.basename(file).toLowerCase();
  if (!byLowerName.has(key)) byLowerName.set(key, []);
  byLowerName.get(key).push(path.relative(root, file));
}

const missionFiles = files.filter(file => path.extname(file).toLowerCase() === '.mis');
const referenced = new Map();
for (const file of missionFiles) {
  const data = fs.readFileSync(file);
  const text = data.toString('latin1');
  const names = text.match(/[A-Za-z0-9_-]+\.(?:dpc|pcx|gry|wav|avi|ff|tpc|gpc|rpc)/gi) ?? [];
  for (const raw of names) {
    const name = raw.toLowerCase();
    if (!referenced.has(name)) referenced.set(name, new Set());
    referenced.get(name).add(path.relative(root, file));
  }
}

const rows = [...referenced.keys()].sort().map(name => ({
  asset: name,
  foundAt: byLowerName.get(name) ?? [],
  referencedBy: [...referenced.get(name)].sort(),
}));
const result = {
  root,
  missionFilesScanned: missionFiles.length,
  uniqueReferencedAssets: rows.length,
  present: rows.filter(row => row.foundAt.length > 0),
  missing: rows.filter(row => row.foundAt.length === 0),
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
