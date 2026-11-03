# Outwars Scout investigation 30

Date: 2026-11-03

## Uploaded bundle validation

The supplied `scout-next-stage.zip` passed ZIP integrity checks. Its executable build matches the established SHA-256:

`722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2`

All six status streams passed:
- Renderer probe: PASS
- Transform-slot audit: 0
- Archive extraction: 0
- Geometry branch: 0
- Materials branch: 0
- Animation branch: 0

The bundle reports seven Scout DPC variants and the following software renderer xref counts: 24 direct calls to `0x510790`, one to `0x510A10`, and one to `0x510B90`.

## New upstream construction path for software polygon objects

The full disassembly provides a more specific upstream route than the isolated polygon converter:

1. The game frame loop at `0x47A8AD` passes scene root global `0x5299C4` in EAX to `0x4E427C`.
2. Inside `0x4E427C`, the software-mode branch calls `0x4D638C` at `0x4E47D4` and again at `0x4E592B`. The same sites call `0x4D7950` instead when renderer mode is nonzero.
3. In the surrounding setup, `0x4E427C` assigns the temporary projected-point list at `0x1291DE4` to global pointer `0x52D1B4`.
4. `0x4D638C` consumes the list via `[0x52D1B4]`: DWORD at list base is count, pointer entries follow at +4, and the entries supply coordinate values (notably floating-point fields at +0x14/+0x18).
5. Depending on the active flags and point count, `0x4D638C` emits renderer-facing records with type bytes including `0x40`, `0x90`, `0xA0`, and `0xB0`. The A0/B0 records are compatible with the polygon object formats recognized by `0x4F9FC4`.
6. `0x4F9FC4` is the software object renderer reached from the main scene traversal when renderer flag `0x1355BB4` is zero. It handles A0/B0 object types and passes their edge data to the scanline/pixel pipeline.

This is a strong connection between the scene-frame rendering path and the construction of software polygon records. It moves the analysis upstream from the rasterizer to a frame-driven projected-point producer.

## What this does and does not prove

Confirmed:
- The frame loop invokes `0x4E427C` with the scene root.
- That routine's software-mode branches call `0x4D638C`, while the nonzero-mode branches call `0x4D7950`.
- `0x4D638C` consumes a temporary point list and writes records tagged with A0/B0 types.
- The software renderer recognises those A0/B0 types.

Not yet proven:
- The precise origin of every point-list entry at `0x1291DE4`.
- Whether those input point entries were populated from Scout DPC vertices/face indices, another class of 3D object, particle/effect geometry, or a mix.
- Exact mapping of Scout's nine geometry sections (root plus eight submeshes) into runtime A0/B0 records.
- How local 3D mesh coordinates and composed Scout opcode-5 transforms become the point-list fields.
- Menu checkbox global `0xF8D294` to renderer mode flag `0x1355BB4` dataflow.
- UV/TPC/palette material binding to Scout faces.

The new route is therefore a **candidate bridge**, not yet a proven Scout DPC-to-renderer mapping. It must not be described as a completed mesh decoder.

## Next static investigation

Trace the population of `0x1291DE4` in `0x4E427C` and the functions it calls to populate pointer entries. Then identify the source object/record passed into this routine and cross-reference it against the DPC callback/object setup paths (`0x4DFCAC`, `0x4DFCE4`, `0x420B00`, class-specific setup). The highest-value goal is an exact join from one Scout DPC face/vertex source to one generated A0/B0 object.

No additional Pi run is required yet; the uploaded disassembly and prior extracted DPC reports are sufficient for this next static pass.
