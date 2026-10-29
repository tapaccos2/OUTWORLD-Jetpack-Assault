#!/usr/bin/env node
/**
 * Backwards-compatible alias. The former interpretation of .GRY as terrain
 * blocks and the three-byte size field was incorrect; these are audio records.
 * Use tools/inspect-gry-audio.mjs for current inspection/extraction.
 */
console.warn('Deprecated terrain-block interpretation: .GRY files are sound-effect audio. Delegating to inspect-gry-audio.mjs.');
await import('./inspect-gry-audio.mjs');
