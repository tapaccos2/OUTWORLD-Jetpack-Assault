#!/usr/bin/env node
/**
 * Retired probe: generic zlib/Deflate/gzip/Brotli tests were applied to MS ADPCM
 * audio payloads and were not meaningful. Use tools/inspect-gry-audio.mjs.
 */
console.error('Not running generic compression tests: Outwars .GRY payloads are audio (MS ADPCM, except PCM16LE in o5.gry).');
console.error('Inspect records: node tools/inspect-gry-audio.mjs original-data/gry/*.gry');
console.error('Extract records: node tools/inspect-gry-audio.mjs --extract extracted-gry-audio original-data/gry/*.gry');
process.exitCode = 2;
