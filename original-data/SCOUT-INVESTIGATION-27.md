# Outwars Scout investigation 27

Date: 2026-11-03

## Context and source status

This note continues the parallel audit documented in [SCOUT-EXECUTABLE-FOLLOWUP-26.md](SCOUT-EXECUTABLE-FOLLOWUP-26.md) and the prior closeout evidence. The latest uploaded `scout-parallel-audit.zip` was successfully processed in the preceding stage. The four parallel streams completed without execution failures.

This note records the additional interpretations made in the current investigation pass. It intentionally separates verified code-path observations from hypotheses that still need a direct data-flow join.

## Renderer-path distinction

- The executable has static imports for DirectDraw (`DirectDrawCreate`, `DirectDrawEnumerateA`).
- Direct3D device use is reached through dynamic function resolution / COM-style vtable calls rather than ordinary static imports.
- A known Direct3D-specific route around `0x4DBA5F` processes up to eight transforms and invokes a device vtable method at `[device+0x68]` (previously identified as a transform-setting call).
- This route is conditional; the user's Outwars graphics menu has **USE DIRECT3D unchecked**. Therefore this Direct3D path must not be assumed active in the user's current configuration.
- DirectDraw initialisation by itself does not prove the existence of a CPU software triangle rasterizer. The non-Direct3D 3D vertex/triangle draw consumer remains unproven.

## Eight-entry runtime object/update area

An additional disassembly pass identified a frame-loop call at `0x47A857` into an eight-entry update routine. It walks eight records and uses per-entry object pointers, three angle values to construct a fixed-point 3x3 rotation matrix, and position/orientation update fields. The same global area also contains counters and state used in record/update handling.

A separate callback/face-state path uses a round-robin counter with eight render-state tags. These are two observations in the same broad subsystem, but must **not** be conflated:
- the eight runtime-object rows have object pointers, angle deltas, movement deltas and lifetime/counter fields;
- the eight-way face/render-state tag is used by a later face-state selector.

The matching count of eight to Scout's eight submeshes is not proof that the runtime object rows are the Scout mesh transforms. No exact owner/mesh association has been established yet.

## Eighteen-channel animation path

The prior audit established a class-indexed 18-slot pointer table registered from opcode-5 records. The class-100 table corresponds to the male Scout DPC variants; class-150 records are used by female variants. The 18-entry table is consumed by an animation/keyframe update path, not a direct one-slot-per-mesh lookup.

Further investigation indicates the class-indexed table is supplied with opcode-5 transform records from a nested transform/attachment tree that also contains opcode-2 attachment nodes. This is a concrete candidate bridge between animation channels and model attachments, but the exact connection from the 18 animation channels to the eight geometry sections has not yet been proven.

The MC frame records contain 19 entries per frame (152 bytes), while the executable sampler iterates 18 channel rows. This is consistent with a possible extra/root entry plus 18 channels, but this alignment remains a hypothesis until an executable-supported record-to-channel mapping is found.

## Geometry and material status retained from prior audit

- Scout geometry: nine sections (root plus eight submeshes), 390 referenced vertices and 230 triangles.
- Five exported GLB candidates validate structurally; none is accepted as a visually verified runtime-exact Scout.
- Seven Scout DPC variants have structurally consistent wrapper/owner patterns.
- Seven Scout TPC files decode to 46 PNG image records in total; TPC framing and image payload extents validate.
- UV-to-texture/material assignment remains unresolved.
- There is no direct attachment descriptor-to-geometry-part match yet. Existing exact-match report has 16 geometry descriptors, 16 opcode-5 candidates and 11 attachment nodes, but no matched geometry parts.

## Current status

**Scout reconstruction is not complete.** There is still no accepted assembled GLB with proven:
1. mesh-section ownership,
2. composed runtime transform convention,
3. animation-channel/hierarchy mapping,
4. UV and texture/material binding,
5. rendering path validation for the user's Direct3D-disabled configuration.

## Next investigation

Continue static data-flow analysis from the nested opcode-5 / opcode-2 transform tree to the eight geometry face streams and the eight-entry runtime object update system. In parallel, identify the non-Direct3D 3D draw consumer and trace how the decoded TPC images are selected and mapped through UVs. Do not run another Pi diagnostic until the available static evidence has been exhausted.

## Evidence discipline

- Do not infer mesh/bone mapping from equal counts alone.
- Do not describe DirectDraw setup as proof of software 3D rendering.
- Do not call the eight-entry runtime object table an eight-bone skeleton without the missing data-flow link.
- Do not treat structurally valid GLB output as a visually or runtime-verified model.
