# Outwars Scout investigation 28

Date: 2026-11-03

## New executable finding: CPU software textured-polygon pipeline

The exact executable build already audited (SHA-256 `722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2`) contains a CPU software textured-polygon / scanline rendering pipeline. This is stronger evidence than the earlier DirectDraw-import observation.

The relevant path is:

1. `0x4F9FC4` handles a polygon-like object record. It checks object byte +7 against `0xA0`.
2. `0x4FA0A0` iterates the primitive count at byte +6 through 64-byte records beginning at `0x13A1FC0`.
3. `0x4FB8B4` builds fixed-point polygon edge / scan-conversion data from vertex coordinate inputs.
4. `0x510790` converts the edge data into scanline coverage.
5. `0x4FBF38` collects visible spans and dispatches to `0x510A10` or `0x510B90`.
6. `0x510A10` uses MMX, reads indexed texture bytes, treats `0xFF` as a transparent index, performs 16-bit palette lookup and writes pixels to a software surface whose base is held at `0x1329B14`.

The new consolidated tester captures all these code windows and direct callsites. The path is a real CPU texture-mapped polygon/scanline renderer.

## Critical limitation

This does **not** yet prove that the CPU path is selected for every scene or is the active path in the user's Direct3D-disabled configuration. The graphics menu global `0xF8D294` and renderer/device flag `0x1355BB4` are both captured; exact dataflow from the menu setting to the flag, and from that flag to the Scout draw path, still needs to be demonstrated.

Most importantly, no direct pointer/vertex/index/transform flow has yet joined the nine exported Scout geometry sections to the 64-byte software-raster primitive records. The new test is intended to expose that missing bridge.

## Correction: callback tag reader remains unknown

The helper at `0x4E59C8` writes an eight-way tag into bits 13–15 of DWORD `[child+0x14]`. The earlier candidate at `0x514D15` extracts bits from `[record+0x20]` and uses them to select a bit from `[record+0x24]`. That is not an exact field match. It is **not** accepted as the tag consumer. The next-stage report explicitly marks this link unproven.

## New single-run tester committed

- `tools/scout-next-stage.sh`
- `tools/scout-next-stage-analysis.py`

The tester combines the previous parallel geometry, renderer, materials and animation audits with:
- the software textured-polygon pipeline disassembly and callsite report;
- renderer mode/global reference checks;
- all Scout DPC variants scanned for class-100 male and class-150 female opcode-5 slot values;
- corrected motion catalogue extraction of `summary.entriesPerFrame`;
- explicit reporting of the remaining Scout geometry-to-raster and tag-reader gaps.

All persistent output is placed under `scout-logs/`. The one uploadable archive is `scout-logs/scout-next-stage.zip`.

## Current reconstruction status

The software polygon renderer is a major discovery, but Scout reconstruction is still unfinished. No final GLB is accepted until the software-raster input is tied to Scout's geometry sections, mesh transforms are proven, and UV/material mapping is resolved.
