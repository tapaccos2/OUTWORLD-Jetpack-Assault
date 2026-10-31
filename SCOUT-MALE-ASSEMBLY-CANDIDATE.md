# Male Scout geometry and transform reconstruction

## Status: both previous assembled GLB candidates rejected

The screenshots supplied on 2026-10-31 show that neither `scout-mj-assembled-candidate.glb` nor `scout-mj-shared-pool-candidate.glb` is an assembled armour model. Both show fan-shaped overlapping geometry and detached pieces. They must not be treated as valid assembly candidates.

The shared-pool/local-reference experiments were insufficient because the exporter only walks the eight-part class-102/class-105 list and then applies owner translations. The executable evidence confirms a second, real callback hierarchy that applies accumulated transforms to child records.

## What the executable report establishes

The user's `scout-reconstruction-report.txt` confirms:

- DPC files are parsed from `0x422170`; the parser validates the `DCPM` magic and version `0x43`, relocates pointers, and dispatches each record by its opcode byte.
- The callback dispatch is at `0x4DFCE4`. Opcode 5 dispatches to `0x4E0130`.
- Opcode 5 reads a 3×3 fixed-point matrix at record `+4), adds the record position at `+0x28/+0x2c/+0x30) to the inherited position, composes the matrix through the executable's matrix helpers, and iterates the child pointers at `+0x38) using the count at `+0x36).
- Each child is enqueued with the accumulated matrix/position state. It is therefore incorrect to replace the hierarchy with the owner position alone.
- The male Scout has 16 structurally plausible opcode-5 records. Its main transform root `0x9300` points to `0x92b0`; `0x92b0` has children `0x8640`, `0x8b4c`, `0x9050`, and two opcode-2 nodes at `0x9188` and `0x9298`. Other transform branches also exist.
- The opcode-2 child records in the transform tree use attachment descriptor layouts that differ from the eight part-list geometry descriptor layouts. Matching descriptor offsets directly was the wrong test.

## New diagnostic inspector

A focused payload inspector has been added:

```bash
node tools/inspect-scout-transform-mesh-payloads.mjs \
  extracted-ff/units/scout_mj.dpc \
  scout-mj-transform-payloads.json
```

It follows every plausible opcode-5 node and inspects its direct opcode-2 children. For each attachment descriptor it reports:

- the descriptor's relocated +4 and +12 targets;
- whether +12 points to a class-0x090c face-stream record;
- face-index records and unique quads found near that face target;
- candidate vertex-base bounds using the shared coordinate pool at offset 40 and several offsets around the relocated +4 target;
- raw samples from those candidate coordinate blocks.

This script deliberately does not create a GLB or silently choose a vertex base. Its purpose is to establish which transform-child descriptors actually carry mesh payloads and which coordinate block their face indices address.

## Current geometry hypotheses

- The class-102/class-105 root has eight mesh/paired-node pairs, and those pairs share structurally meaningful coordinate/face descriptors.
- The class-100 opcode-5 hierarchy is a separate runtime traversal that composes transforms and dispatches child records.
- Some opcode-2 child descriptors in this hierarchy point through +12 to class-0x090c records. Their +4 pointers differ from the common coordinate pool pointer used by the eight part-list meshes. These may be distinct local vertex blocks, but that interpretation must be checked from the payload inspector output.
- The owner vectors match paired-node vector fields, but they are not a substitute for the accumulated opcode-5 transform.
- Axis convention, matrix storage order and parent-child concatenation order still require validation against the actual game code/runtime.

## Export policy

Do not use either previous assembled GLB as a base for more tweaks. Do not apply the eight owner vectors as the complete model transform. Export should resume only after the transform-child payloads and their vertex bases are identified and the opcode-5 matrix accumulation has been implemented.


## Follow-up to transform payload report (2026-10-31)

The first `scout-mj-transform-payloads.json` report confirms 11 opcode-2 attachment records under the transform hierarchy; 9 of the records' first descriptor slots led to candidate face streams. However, opcode-2 callback `0x4DFEF3` advances the source pointer by four bytes for each item and reads inline pointer fields at record `+0x14 + 4*i`. The count at `+0x10` is therefore a descriptor-slot count, not just metadata. Two records have count 2, so the first inspector revision omitted their second descriptors.

The inspector `tools/inspect-scout-transform-mesh-payloads.mjs` has been updated to enumerate all inline slots and provide bounded face-stream records plus raw coordinate/face samples. Its report is still diagnostic: coordinate pointers can target typed blocks whose vertex array may begin after a header, and face signature scanning is heuristic. No exporter change is justified until the complete descriptor slots are interpreted.


## Reinterpretation of opcode-4 / class-0x090c data (2026-10-31)

The v2 payload report exposed that the earlier signature scanner was mislabeling opcode-4 / class-0x090c records as face records. That interpretation is rejected.

The executable's opcode-4 callback begins at `0x004E006D`. Its disassembly shows:

- It reads DWORDs at record `+0x04`, `+0x08`, and `+0x0C` and adds them to the current accumulated position.
- It reads a BYTE count at `+0x12`.
- It loops that many times, reading DWORD entries from `+0x14 + 4*i`.
- Each entry is enqueued with the current transform context. The generic callback dispatcher subsequently interprets the entry.

Therefore the four WORDs at `+4/+6/+8/+10` are **not** a face's four vertex indices. The apparent quad counts from the signature scan are false positives or, at minimum, unverified interpretations. No triangle topology should be built from those values.

The coordinate pointers at descriptor `+4` still lead to plausible 8-byte coordinate records, but the actual topology/child-entry semantics must be decoded from the opcode-4 child sequence. A coordinate array by itself is not enough to create valid geometry.

## Next diagnostic

A read-only executable-guided inspector has been added:

```bash
node tools/inspect-scout-opcode4-payloads.mjs \
  extracted-ff/units/scout_mj.dpc \
  scout-mj-opcode4-payloads.json
```

It follows opcode-5 transform children to their opcode-2 attachment descriptors, resolves the descriptor's `+12` target, and for each opcode-4/class-0x090c record reports:

- translation DWORDs at `+4/+8/+12`;
- the actual byte count at `+0x12`;
- every DWORD child entry from `+0x14`;
- whether each entry resembles a relocated DPC pointer or an in-file offset, including its target header where possible.

These pointer classifications are mechanical only. The report will establish what the entries refer to before any of them are treated as vertices, faces, or nested records.

Do not use the old `faceScan.uniqueQuads` values from `scout-mj-transform-payloads-v2.json` to build geometry.
