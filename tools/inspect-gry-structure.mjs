#!/usr/bin/env node
/**
 * Backwards-compatible alias. .GRY files are sound-effect audio containers,
 * not terrain geometry. Use tools/inspect-gry-audio.mjs.
 */
console.warn('Deprecated terrain interpretation: .GRY files are sound-effect audio. Delegating to inspect-gry-audio.mjs.');
await import('./inspect-gry-audio.mjs');
