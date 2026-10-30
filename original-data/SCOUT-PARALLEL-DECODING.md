# Scout parallel asset decoding status

**Checked:** 2026-10-30  
**Scope:** original files extracted from the units and motion archives.

## Texture records: decoded and validated

The tool \`tools/export-tpc-images.mjs\` exports each TPCMC v0x43 image record as a PNG with its own palette and transparency table. Validation checks the inner image extent, the outer record extent, and exact consumption of the file.

All seven available Scout TPC files passed:

| Resource | Records | Decoded images |
|---|---:|---:|
| scout_mj.tpc | 6 | 6 |
| scout_ma.tpc | 6 | 6 |
| scout_md.tpc | 6 | 6 |
| scout_fa.tpc | 7 | 7 |
| scout_fd.tpc | 7 | 7 |
| scout_fj.tpc | 7 | 7 |
| scout_test.tpc | 7 | 7 |
| **Total** | **46** | **46** |

The decoded pixel payloads are 8-bit palette indices. Each record has a 256-entry little-endian RGB555 palette. A zero palette word is transparent. The stored width field is half the decoded width, matching the executable's width handling. The exporter writes a \`manifest.json\` beside each set of PNGs.

## Motion data: catalogue and channel profile

The 59 available \`.MC\` files contain 5,906 complete frames at 152 bytes per frame. The runtime code confirms 19 entries per frame, each 8 bytes (three signed 16-bit values plus a fourth 16-bit word). The fourth word is consistently \`0xBFF7\` across the catalogue.

A new profiler, \`tools/analyze-motion-channels.mjs\`, reports per-channel component ranges, value diversity, standard deviation and frame-to-frame activity. It identifies three invariant-zero components (slot 3 component 1; slot 5 component 0; slot 9 component 0). The profiler does not infer bone names or assign channels to a skeleton.

One source anomaly remains explicit: \`fstand2.mc\` declares 17 frames but has 18 complete 152-byte payload frames. It is reported as a mismatch and is not silently truncated.

## Geometry: male and female resource graphs differ

The corrected \`tools/export-dpc-armour-geometry.mjs\` has now been run against all seven Scout DPC resources: \`scout_mj\`, \`scout_ma\`, \`scout_md\`, \`scout_fa\`, \`scout_fd\`, \`scout_fj\`, and \`scout_test\`. Each produces a loadable GLB with one root mesh and eight submeshes, 390 referenced position entries and 230 triangles. Male resources use the type-9 class-102 root / class-9 class-105 part-list pair; female and test resources use class-152 / class-155. The shared coordinate-pool pointer for all nine sections resolves through type-2 +20 → type-16 +8 → descriptor +4 to file offset \`0x28\`.

The type-2 +28 pointer is a separate mesh-reference field and is **not** currently treated as the XYZ coordinate base: doing that caused systematically expanding bounds across later parts, while the face index values are consistent when resolved against the shared pool at 0x28. It is retained in the JSON export report for further reverse engineering. This corrects the earlier overconfident interpretation of +28 as a per-submesh vertex-slice start.

The GLBs are verified raw geometry extractions, not correctly assembled models. The 230 triangles remain broad overlapping/fan-like surfaces when rendered without the original attachment rotations and hierarchy. Do not treat this as a completed character or replace the in-game soldier with it.

## Current major blocker

The geometry is extracted but still not assembled into a visually correct body. The attachment transform / rotation hierarchy is unresolved. Original UV assignment and TPC-to-mesh material links are also open. Skeleton names and motion-channel-to-bone mapping remain open. Do not replace the in-game soldier yet.

## Reproducible commands

\`\`\`sh
node tools/export-tpc-images.mjs units/scout_mj.tpc /tmp/scout-mj-textures
node tools/analyze-motion-channels.mjs motion /tmp/motion-profile.json
node tools/export-dpc-armour-geometry.mjs units/scout_mj.dpc /tmp/scout-mj-raw.glb
\`\`\`
