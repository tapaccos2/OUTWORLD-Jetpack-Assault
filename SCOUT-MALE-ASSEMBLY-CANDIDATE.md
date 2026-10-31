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
