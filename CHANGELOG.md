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

### Executable Transform Bridge v1.1.0 — 2026-10-31
- Added direct disassembly capture for callback opcode 5 and the fixed-point matrix helpers.
- Extended runtime transform consumer capture through the full routine instead of stopping at 0x4E3460.
- Added object-link registration/finalization ranges around 0x422332 and 0x422554.
- Follow-up scope is driven by the v1.0.0 report: parser callback linkage is visible, but the full DPC-to-runtime transform correlation still needs the omitted routine ranges.
