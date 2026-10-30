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

## Corrected Scout part-list audit (2026-10-30)

The nine class-105 list entries are now fully accounted for. The first eight are the visible mesh-owner candidates, each with a type-2 child at +24 and a paired type-2 child at +28. The ninth type-1 entry (file offset 20,436) is an aggregate node whose later pointer fields link back to the first eight owner records, to itself, and to the model root (offset 6,496); it is not a ninth mesh.

For each of the first eight owners, owner +8/+12/+16 equals the paired type-2 child +32/+36/+40. That validates stored-vector consistency but not runtime transform semantics. Since every mesh uses the shared coordinate pool at 0x28 with global face indices, the vertex positions may already share model space. A raw no-anchor GLB versus candidate-anchor GLB comparison is now the next decisive check; do not assume the candidate vectors should be added as translations.

## Scout transform hierarchy: wrapper links mapped (2026-10-30)

A new audit follows every type-16 wrapper +8 pointer to the exact embedded record field. The eight mesh/paired-node pairs form a stable alternating chain:

- mesh node 1 links to root node +24;
- paired node 1 links to mesh node 1 +24;
- mesh node 2 links to paired node 1 +56;
- paired node 2 links to mesh node 2 +24;
- the pattern repeats through pair 8.

The audit counts 1 root-to-first-mesh, 8 paired-to-own-mesh, and 7 mesh-to-previous-paired links (16 total). Wrapper first dwords are 10,000 on mesh-side links and 2,250,000 on paired-side links. The pointer targets are embedded type-0/class-0 descriptors, with pointers to vertex data, a shared external resource, and face data. Shared pool offset 40 is referenced on mesh-side links; paired-side records reference per-part offsets.

This is a structural hierarchy lead only; the semantic meaning of the wrapper constants and the transform multiplication order are still unknown. Six Euler-order tests with a 4096-unit full-turn assumption did not create a recognisable body; direct translation also worsens the assembly. The next decoding step is to identify the executable consumer and its reads from the type-16 and embedded type-0 descriptors.

## Per-mesh vertex-base candidate tested across all Scout variants (2026-10-30)

The optional exporter mode `--use-mesh-vertex-reference` reads the XYZ pool from each mesh type-2 +28 pointer and applies that as the base for its face indices. Across all seven variants, the test found every +28 offset is eight-byte aligned, every last referenced byte is inside the DPC file, and all eight meshes still decode 13 unique quads / 26 triangles. The offsets are 96 (submesh 1), 712 (submesh 2), and 744 (submeshes 3–8), corresponding to vertex starts 7, 84, and 88 relative to the shared pool at 40. The maximum effective index is 483.

This is a credible per-mesh vertex-base interpretation, but the alternate preview still shows overlapping plate-like surfaces and does not assemble the character. The default shared-base export is retained pending runtime-consumer evidence or another independent validation.
