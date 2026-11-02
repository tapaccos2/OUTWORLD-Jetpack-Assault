#!/usr/bin/env node
/**
 * Compatibility entry point for Scout finalization.
 *
 * The former finalizer emitted GLBs by treating 0x04010C09 callback records
 * as four-index quads. That topology assumption is not supported by the
 * executable evidence and has been retired.
 *
 * This entry point now runs the integrated forensic reconstruction only.
 * It emits the callback/transform/payload evidence bundle and deliberately
 * does not emit or select a Scout GLB.
 *
 * Usage:
 *   node tools/scout-finalize.mjs original-data/units.ff scout-final [--exe /path/to/outwars.exe]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node tools/scout-finalize.mjs <units.ff|scout_mj.dpc> [out-dir] [--exe outwars.exe]');
  process.exit(2);
}

const reconstruction = path.join(here, 'reconstruct-scout.mjs');
const result = spawnSync(process.execPath, [reconstruction, ...args], { stdio: 'inherit' });
if (result.error) {
  console.error(result.error.stack || String(result.error));
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

console.log('');
console.log('SCOUT FINALIZATION STATUS: FORENSIC_EVIDENCE_ONLY');
console.log('GLB export: BLOCKED — render topology and mesh ownership are not verified.');
console.log('No candidate is selected. No speculative model file has been created.');
