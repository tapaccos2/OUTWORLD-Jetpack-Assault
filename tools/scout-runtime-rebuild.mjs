#!/usr/bin/env node
/**
 * Compatibility entry point for the retired Scout runtime rebuild.
 *
 * The previous revision treated the 0x04 0x01 0x0C 0x09 pattern as a
 * four-index face stream. Executable analysis established that these are
 * opcode-4 callback records with position contributions and child DWORDs.
 * Therefore its 24 GLB placement candidates are not valid render geometry.
 *
 * Forward to the corrected evidence pipeline. This wrapper intentionally
 * emits no GLB and never labels the old signature-derived triangles as meshes.
 *
 * Usage:
 *   node tools/scout-runtime-rebuild.mjs original-data/units.ff scout-reconstruction --exe outwars.exe
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const pipeline=path.join(here,'reconstruct-scout.mjs');
const args=process.argv.slice(2);
if(args.some(x=>x==='--initial-scale'||x==='--max-work')){
  console.error('The retired runner-specific options --initial-scale and --max-work are not used by the corrected opcode-4 payload pipeline.');
  process.exit(2);
}
const result=spawnSync(process.execPath,[pipeline,...args],{stdio:'inherit'});
if(result.error){
  console.error(result.error.stack||String(result.error));
  process.exit(1);
}
process.exit(result.status??1);
