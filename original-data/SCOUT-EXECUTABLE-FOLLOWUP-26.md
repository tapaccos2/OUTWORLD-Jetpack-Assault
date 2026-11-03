# Scout executable follow-up 26 — parallel audit results and animation-slot interpretation

Date: 2026-11-03

Executable SHA-256: `722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2`

Scout DPC SHA-256 (scout_mj): `05887eae665ec9eb7da64420d549e239d23c0a81e3b27eae4f77ac655df58758`

units.ff SHA-256: `43409802f6f4651cd122c2a493c4b41f8c1960fd20a5706d24f3422333f323d5`

motion.ff SHA-256: `c243139b2ba93ad8b19f26e564b2081977718209461834ec86b65d2872162aee`

## Executive result

The combined Pi audit completed all four investigation streams. It materially improves the animation evidence and inventories the original Scout textures, but it does **not** complete the Scout assembly.

The most important correction is that the class-indexed 18-slot table is part of an animation/keyframe sampling path. It must not be treated as a direct one-slot-per-mesh transform table.

## 1. Geometry and owner graph

The static extraction was repeated against the exact Scout DPC from the executable build above.

- Nine geometry sections: one root plus eight submeshes.
- 390 referenced vertices and 230 triangles.
- Five independent GLB geometry/placement candidates all pass structural validation.
- The owner/paired-node vector relationships are consistent across all seven Scout DPC variants.
- All seven variants contain the same eight-part owner layout and common wrapper-field patterns.
- The candidate transform/attachment audit still finds no exact attachment-descriptor-to-mesh-section joins.

Status: **static geometry validated; anatomical placement remains unverified**. The selected owner-translated GLB is still a diagnostic baseline, not the finished Scout.

## 2. Class-indexed opcode-5 records — corrected interpretation

The executable dispatcher at `0x420b00` sends class-100 records through `0x414c20` for the male Scout DPCs and class-150 records through the corresponding class-specific table for the female Scout DPCs.

The generic registration routine at `0x415540` checks that the record is opcode 5, reads WORD `[record+0x34]`, and stores the record pointer at:

```
classTableBase + (slotWord * 4) - 4
```

The selected table has 18 DWORD entries. In `scout_mj.dpc`, 15 class-100 records register unique in-range slot values:

`1, 2, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18`

Slots 3, 4 and 8 are not populated by those 15 class-100 records. There are no duplicate or out-of-range values in that primary audit.

The seven-variant raw opcode-5 scan finds 15 class-100 records in each male DPC and 15 class-150 records in each female DPC, plus one separate class-0 opcode-5 record. **The parallel bundle's cross-variant catalogue filtered for class 100 only**, so its zero counts for female variants are a reporting limitation, not evidence that the female variants lack transform records. Their `+0x34` slot values still need to be extracted explicitly.

### Why this is an animation path, not a mesh-slot map

The registered table is initialised into per-instance cursor records by `0x4157a4`. The routine at `0x415810` advances and processes an 18-entry array with a 0x14-byte stride; active rows call `0x415578`, which in turn calls `0x415134`.

The `0x415134` routine uses a sample count, data pointer, stride and frame index to select/interpolate 8-byte-strided keyframe samples. The observed call chain therefore establishes an **18-channel animation/keyframe update path** for the class-indexed opcode-5 records. It does not by itself tell us which named bone drives which mesh section.

This supersedes any earlier suggestion that the 18 slots correspond directly to eight mesh sections.

## 3. Motion archive

The validated `motion.ff` extraction contains 59 MC resources and 5,906 decoded frames.

Across the catalogue:

- Each frame has a 152-byte payload.
- The payload contains 19 entries of 8 bytes each.
- Each entry's first three words are signed 16-bit values.
- The fourth WORD is consistently `0xBFF7` in every entry across all 5,906 decoded frames.

One count mismatch remains: `fstand2.mc` declares 17 frames but contains 18 complete 152-byte frame payloads.

The 19-entry frame layout and 18-entry runtime animation table make a root-plus-18 interpretation plausible, but the bundle does not yet prove that index relationship. The slot-to-channel correlation JSON also has a small report-generation bug: it reads `entryCount` where the catalogue field is `entriesPerFrame`, so it outputs null for the count even though the catalogue correctly reports 19. Treat the catalogue as authoritative.

## 4. Textures and materials

Seven Scout-named TPC resources were found and decoded, yielding 46 indexed PNG image records across the seven variants.

Each record's framing, dimensions, indexed-pixel extent and RGB555 palette were validated. The 256x256 atlas records visibly contain Scout armour/body components; other records contain additional equipment/effect textures.

The decoded assets are now available for UV/material investigation. However:

- No printable texture filename references were found in the Scout DPC files.
- UV coordinates have not been connected to the extracted face/vertex sections.
- The game’s material-index-to-TPC-record mapping is not yet established.

Decoded texture images are not the same as a completed material assignment.

## 5. Renderer path

The executable imports `DirectDrawCreate` and `DirectDrawEnumerateA` from `DDRAW.dll`. Direct3D methods do not appear as normal static imports; the code uses DirectDraw/COM-style interface calls and a conditional Direct3D setup.

The Direct3D route contains the known eight-entry transform loop and a device-vtable call identified by the earlier audit as `SetTransform`. Because the user's graphics setting had Direct3D unchecked, that route cannot be assumed to be the one producing the user's in-game Scout.

The bundle captures the mode option handler, DirectDraw/Direct3D initialisation, renderer API consumers and known Direct3D calls. It still does **not** positively identify the actual vertex transformation and triangle drawing routine used when Direct3D is disabled. DirectDraw surface setup alone is not proof of a CPU software triangle rasteriser.

## 6. Parallel run status

The Pi bundle reported successful completion of:

- Renderer/backend capture.
- Primary transform-slot audit.
- Archive extraction.
- Geometry finalizer and cross-variant comparison.
- Scout TPC decoding.
- Motion catalogue, format and channel profiling.
- Slot/channel correlation report generation.

The correlation report's null entry-count field is a report bug described above; the underlying catalogue is intact.

## 7. Remaining work, now correctly separated

1. Trace the 19-entry MC reader into the 18-entry keyframe sampler and establish whether one channel is a root/global track.
2. Extract `+0x34` slot values for all 15 female class-150 records and compare them with the male class-100 slots.
3. Join the animation channels to the DPC hierarchy, then determine which hierarchy nodes influence each of the eight geometry sections.
4. Identify the active non-Direct3D vertex/triangle consumer.
5. Recover UVs, material indices and TPC-record assignments.
6. Apply the verified matrices/materials and validate a recognisable Scout before adding animation.

**Completion status:** geometry and texture assets are recovered and structurally validated; animation structure is better understood; transform-to-mesh ownership, active non-D3D draw path, UV/material mapping, and final assembly remain open.
