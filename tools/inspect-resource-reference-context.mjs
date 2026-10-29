#!/usr/bin/env node
/**
 * Inspect byte context around unresolved resource-name candidates from
 * cross-reference-resources.mjs. This is diagnostic only; it does not infer
 * that a candidate is a real resource reference.
 *
 * Usage:
 *   node tools/inspect-resource-reference-context.mjs original-data resource-audit.json
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'original-data');
const auditPath = path.resolve(process.argv[3] ?? 'resource-audit.json');
const radius = Number(process.argv[4] ?? 32);
if (!Number.isInteger(radius) || radius < 8 || radius > 256) {
  throw new Error('Context radius must be an integer from 8 to 256 bytes.');
}
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const missing = audit.unresolved ?? audit.missing;
if (!Array.isArray(missing)) throw new Error('Audit JSON must contain an unresolved or missing array.');

function printable(buf) {
  return [...buf].map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join('');
}
function hex(buf) {
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join(' ');
}
const results = [];
for (const item of missing) {
  const examples = item.examples ?? [];
  for (const example of examples) {
    const sourcePath = path.resolve(root, example.source);
    if (!sourcePath.startsWith(root + path.sep) || !fs.existsSync(sourcePath)) {
      results.push({candidate:item.name, source:example.source, offset:example.offset, error:'source file not found under root'});
      continue;
    }
    const data = fs.readFileSync(sourcePath);
    const offset = Number(example.offset);
    if (!Number.isInteger(offset) || offset < 0 || offset >= data.length) {
      results.push({candidate:item.name, source:example.source, offset, error:'offset outside source file'});
      continue;
    }
    const start = Math.max(0, offset - radius);
    const end = Math.min(data.length, offset + String(item.name).length + radius);
    const window = data.subarray(start, end);
    const relativeStart = offset - start;
    results.push({
      candidate:item.name,
      source:example.source,
      fileSize:data.length,
      offset,
      candidateBytes: data.subarray(offset, Math.min(data.length, offset + String(item.name).length)).toString('latin1'),
      candidateHex:hex(data.subarray(offset, Math.min(data.length, offset + String(item.name).length))),
      windowStart:start,
      candidateStartInWindow:relativeStart,
      windowHex:hex(window),
      windowAscii:printable(window),
      note:'Compare candidate bytes and surrounding context; binary-looking surroundings can indicate a false positive.'
    });
  }
}
process.stdout.write(JSON.stringify({root,auditPath,radius,resultCount:results.length,results},null,2)+'\n');
