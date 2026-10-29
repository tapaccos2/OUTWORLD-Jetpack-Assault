#!/usr/bin/env node
/**
 * Summarise DPC graph inventories across campaign scene resources.
 *
 * This script invokes inspect-dpc-graph.mjs for each input, validates the JSON
 * emitted by the graph walker, and compares class/type counts without inventing
 * semantic labels. Requires Node.js 18+.
 *
 * Usage:
 *   node tools/inspect-dpc-graph-compare.mjs original-data/structs/rag01.dpc original-data/structs/rag02.dpc
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const files = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
if (!files.length) {
  console.error('Usage: node tools/inspect-dpc-graph-compare.mjs <file.dpc> [file.dpc ...]');
  process.exit(2);
}
const walker = path.join(path.dirname(new URL(import.meta.url).pathname), 'inspect-dpc-graph.mjs');
const results = [];
let errors = 0;
for (const file of files) {
  const child = spawnSync(process.execPath, [walker, file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (child.status !== 0) {
    results.push({ file, error: child.stderr || child.stdout || 'graph walker failed', exitCode: child.status });
    errors++;
    continue;
  }
  try {
    const graph = JSON.parse(child.stdout);
    results.push({
      file,
      bytes: graph.bytes,
      topLevelCount: graph.topLevelCount,
      walkedNodeCount: graph.walkedNodeCount,
      edgeCount: graph.edgeCount,
      byTypeClass: graph.byTypeClass,
      byRoot: graph.byRoot,
      errorCount: graph.errors.length,
      truncated: graph.truncated,
    });
    if (graph.errors.length || graph.truncated) errors++;
  } catch (e) {
    results.push({ file, error: 'Could not parse graph-walker JSON: ' + e.message, sample: child.stdout.slice(0, 500) });
    errors++;
  }
}
process.stdout.write(JSON.stringify({ files: results, note: 'Type/class labels are numeric and intentionally semantic-neutral.' }, null, 2) + '\n');
if (errors) process.exitCode = 1;
