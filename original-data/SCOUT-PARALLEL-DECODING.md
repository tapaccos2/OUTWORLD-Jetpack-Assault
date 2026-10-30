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

The corrected \`tools/export-dpc-armour-geometry.mjs\` has been run against \`scout_mj.dpc\`, \`scout_ma.dpc\`, and \`scout_md.dpc\`. Each produces a GLB with one root mesh and eight submeshes, 390 referenced position entries and 230 triangles. The shared coordinate-pool pointer for all nine sections resolves through type-2 +20 → type-16 +8 → descriptor +4 to file offset \`0x28\`.

The female/test DPCs are **not** compatible with the male class-102 root path. Their top-level root is type-1/class-150, and the linked type-12 record points into a different graph. A type-9/class-152 record and type-9/class-155 nine-entry list are present, so this appears to be a parallel graph family worth decoding, not malformed data. The male exporter correctly rejects these resources rather than producing a misleading output.

## Current major blocker

The geometry is extracted but still not assembled into a visually correct body. The attachment transform / rotation hierarchy is unresolved. Original UV assignment and TPC-to-mesh material links are also open. Skeleton names and motion-channel-to-bone mapping remain open. Do not replace the in-game soldier yet.

## Reproducible commands

\`\`\`sh
node tools/export-tpc-images.mjs units/scout_mj.tpc /tmp/scout-mj-textures
node tools/analyze-motion-channels.mjs motion /tmp/motion-profile.json
node tools/export-dpc-armour-geometry.mjs units/scout_mj.dpc /tmp/scout-mj-raw.glb
\`\`\`
