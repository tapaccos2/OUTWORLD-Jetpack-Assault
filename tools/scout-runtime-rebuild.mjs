#!/usr/bin/env node
/**
 * Compatibility entry point for historical Scout rebuild commands.
 *
 * The old runtime runner is retired. This entry point now invokes the complete
 * one-run finalizer: callback/executable analysis, DPC extraction, geometry
 * candidate export and validation, report generation and evidence ZIP.
 *
 * Usage:
 *   node tools/scout-runtime-rebuild.mjs original-data/units.ff scout-final --exe /path/to/outwars.exe
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const pipeline=path.join(here,'scout-finalize.mjs');
const args=process.argv.slice(2);
const result=spawnSync(process.execPath,[pipeline,...args],{stdio:'inherit'});
if(result.error){
  console.error(result.error.stack||String(result.error));
  process.exit(1);
}
process.exit(result.status??1);
