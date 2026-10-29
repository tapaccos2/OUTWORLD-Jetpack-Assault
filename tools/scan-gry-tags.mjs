#!/usr/bin/env node
/**
 * Backwards-compatible alias. The former terrain-tag interpretation was
 * incorrect; use tools/inspect-gry-audio.mjs to inspect the audio records.
 */
console.warn('Deprecated terrain-tag scan: .GRY files are sound-effect audio. Delegating to inspect-gry-audio.mjs.');
await import('./inspect-gry-audio.mjs');
