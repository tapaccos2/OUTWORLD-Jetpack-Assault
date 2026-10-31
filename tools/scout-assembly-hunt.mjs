#!/usr/bin/env node
/**
 * DEPRECATED — do not use.
 *
 * This early experiment incorrectly assumed opcode-4 payload DWORDs formed
 * inline face/index data. Executable disassembly disproved that interpretation.
 * The supported follow-on is tools/scout-runtime-rebuild.mjs, which follows
 * the callback work-stack layouts and exports comparative geometry candidates.
 *
 * See original-data/SCOUT-RUNTIME-REBUILD.md.
 */
console.error('DEPRECATED: this experiment used an incorrect opcode-4 payload assumption.');
console.error('Run: node tools/scout-runtime-rebuild.mjs original-data/units.ff scout-runtime-rebuild --exe /path/to/outwars.exe');
process.exit(2);
