# Changelog

## Scout Inspector

### v1.1.0 — 2026-10-31
- Corrected transform-record scanning to inspect every byte offset rather than stepping only in four-byte increments.
- Removed the restrictive child-opcode filter so structurally valid transform records with generic child types are retained.
- Added a persistent visible version label to the inspector header.

### v1.0.0
- Initial browser-based Scout DPC hierarchy and local coordinate-sample inspector.

### Executable Transform Bridge v1.0.0 — 2026-10-31
- Added explicit source version metadata and versioned report banner.
- Captures parser-to-callback callsites, opcode dispatch, transform callback and runtime transform consumer disassembly.
