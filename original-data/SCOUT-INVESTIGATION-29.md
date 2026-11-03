# Outwars Scout investigation 29

Date: 2026-11-03

## Uploaded next-stage bundle

The user supplied `scout-next-stage.zip`. The archive passed ZIP integrity checks. The executable SHA-256 matched the audited build:

`722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2`

All six audit streams completed successfully:

- Renderer probe: PASS
- Transform-slot audit: exit 0
- Archive extraction: exit 0
- Geometry branch: exit 0
- Materials branch: exit 0
- Animation branch: exit 0

The consolidated report recorded seven Scout DPC variants, 24 direct calls to `0x510790`, one direct call to `0x510A10`, and one direct call to `0x510B90`.

## Major result: the software polygon renderer is wired into main-scene traversal

This pass checked the main game frame loop and the mode dispatcher, not only isolated rasterizer functions.

### Renderer mode flag

- `0x4F0A24` returns DWORD `[0x1355BB4]`.
- `0x4E729C` converts that value to a Boolean.
- The renderer initialisation block at `0x4EE739` sets `0x1355BB4` to 1 only when the requested value at `[ESP+0x18]` equals 1 and the capability/state field `[EBP+0x50]` also equals 1. Otherwise it sets the flag to zero.
- `0x4EE938` only executes the additional hardware-specific setup call `0x4F05B8` when `0x1355BB4` is nonzero.

### Main scene dispatch

The main frame loop loads the scene root through global `0x5299C4` and calls `0x4F32EC` (for example at `0x47AAAF` and `0x47AAD2`).

At `0x4F32EC`:

- It calls `0x4E729C` to read the renderer-mode Boolean.
- When the flag is zero, it walks the scene's linked/list entries and calls `0x4F9FC4` on each object.
- When the flag is nonzero, it diverts to `0x4E7D20`, which selects the alternate hardware route.

The object wrapper at `0x4E7D54` makes the split explicit:

- Nonzero flag: calls hardware object routine `0x4F15B4`.
- Zero flag: prepares software render state with `0x4EEBCC`, calls `0x4F9FC4`, then cleans up with `0x4EEC98`.

This confirms that the CPU polygon renderer is an active scene-rendering branch in the executable, not merely an unused helper. The user's graphics menu currently has Direct3D unchecked, but the exact dataflow from menu global `0xF8D294` to mode flag `0x1355BB4` has not yet been proven. Therefore this note does not claim the checkbox has been conclusively mapped to the flag.

## Software polygon object layout

The software object renderer begins at `0x4F9FC4`. It checks the type byte at object offset `+7` using mask `0xFD` and supports at least two object type branches:

- `0xA0`
- `0xB0`

For the `0xA0` branch:

- BYTE `[object+6]` is the primitive/edge count consumed by the loop.
- The inline point data begins at `object+0x78`.
- The point records are 8 bytes each and contain two fixed-point coordinate words (X/Y); the edge builder reads two adjacent point records per edge.
- Edge descriptors are emitted into scratch storage at `0x13A1FC0), with 64-byte stride.
- The edge builder at `0x4FB8B4` computes edge direction/quadrant, slopes and scan-conversion values from the adjacent coordinate records.
- The scanline converter at `0x510790` consumes those 64-byte scratch records.
- The span collector/fill dispatcher is at `0x4FBDE4`; it routes spans to pixel writers `0x510A10` or `0x510B90`.
- The `0x510A10` pixel writer uses indexed texture bytes, skips the `0xFF` transparent index, looks up 16-bit palette entries and writes to the software surface.

The B0 branch begins at `0x4FA481` and uses the same broad coordinate/edge conversion pipeline, but its full field semantics have not yet been decoded. Do not merge A0 and B0 semantics without checking their distinct setup paths.

## Scout DPC variant comparison

All seven extracted Scout DPCs contain 15 structurally plausible class-specific opcode-5 records plus one separate class-0 record.

The class-specific slot word at `+0x34` is identical across every variant:

`[7, 6, 5, 12, 11, 10, 9, 2, 18, 17, 16, 15, 14, 13, 1]`

- Male `scout_ma`, `scout_md`, `scout_mj`: class 100.
- Female `scout_fa`, `scout_fd`, `scout_fj`: class 150.
- `scout_test`: class 150.
- Every class-specific set has missing slots `[3, 4, 8]`, no duplicate values and no out-of-range values.
- Each file has a separate class-0 record whose slot word is zero.

This confirms the same 15-channel registration pattern across male and female Scout variants. It does not make these channel indices direct mesh or bone identifiers.

## Remaining Scout-specific gap

The executable's scene traversal accepts software polygon objects with the layout above, but the DPC-to-runtime conversion that creates those objects has not yet been joined to Scout's nine exported geometry sections.

Still unproven:

1. Which DPC owner/mesh/face records supply the software polygon objects.
2. How the Scout vertex pool and face indices are transformed into the inline screen-space point records at object `+0x78`.
3. How the 64-byte software edge records relate to the Scout's nine mesh sections.
4. Exact menu setting `0xF8D294` to renderer mode flag `0x1355BB4` dataflow.
5. UV and texture/material binding for the seven decoded Scout TPC variants.
6. The exact mapping from 18 animation cursors / 19 MC frame entries to mesh hierarchy and sections.
7. The consumer of the eight-way tag written by `0x4E59C8`; the earlier candidate selector remains unlinked.

The nine-section geometry candidate remains one root plus eight submeshes, 390 referenced vertices and 230 triangles. The existing GLBs are structurally valid candidates only, not a runtime-exact or visually verified Scout.

## Next work

Continue from the newly confirmed software object contract. Trace the DPC/class callback and transform/attachment path into the runtime scene object construction, looking specifically for producers of A0/B0 records and their `+0x78` inline coordinate arrays. In parallel, map the texture/palette references used by the pixel writer back to Scout TPC/UV data. No new Pi run is required before this static analysis is exhausted.
