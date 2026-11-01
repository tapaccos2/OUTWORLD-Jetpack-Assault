# Historical Scout runtime placement experiment

**SUPERSEDED — USE THE ONE-RUN FINALIZER.**

The old runtime runner traced callback records and emitted 24 placement experiments, but it did not apply a verified per-mesh opcode-5 hierarchy. Those GLBs are not accepted as a runtime-exact Scout model.

**Correction to the earlier topology warning:** the executable handler at 0x4E006D interprets an opcode-4/class-0x090c record as a callback child-list when that record is dispatched. That does not prove every occurrence of the same four-byte prefix inside the separate owner-part mesh stream is a callback work item. The owner-part stream now has a context-specific face-record candidate interpretation: 22/26 source records per section, 11/13 unique quads, and indices that fit the coordinate pools. See [SCOUT-GEOMETRY-EXPORT.md](SCOUT-GEOMETRY-EXPORT.md).

## Current one-command workflow

Run this once from the repository root:

```sh
node tools/scout-finalize.mjs \
  original-data/units.ff \
  scout-final \
  --exe /home/tapaccos/Outwars-extracted/outwars.exe
```

It performs the callback/transform/executable audits, extracts scout_mj.dpc, exports raw/owner-translated/reference-point geometry candidates, validates all nine GLB mesh sections, selects the owner-translated static candidate, writes FINAL-REPORT.md/JSON, and packages the entire output as scout-final.zip. The compatibility command `tools/scout-runtime-rebuild.mjs` now forwards to the same finalizer.

The output is a static geometry candidate, not a bit-exact runtime reconstruction. Mesh-to-opcode-5 ownership, composed runtime matrices, UVs, texture/material assignment, skinning and animation remain reported as unresolved; they are not guessed or silently omitted.

The material below is retained as historical notes about the retired callback-placement experiment. Do not use its old placement results as proof of a completed runtime model.

## What it does

1. Reads the DPC's top-level relocated record-pointer table and invokes the callback simulation for each table slot in order, preserving repeated pointers. It also seeds the playable-armour root and automatically discovers opcode-5 transform records by their flags, Q20.12 orthogonality, child counts and relocated child pointers; it seeds only opcode-5 forest roots.
2. Uses the executable's 14-entry callback table at `0x4DFCAC` (byte zero is the opcode; WORD +2 is a separate class/state field).
3. Follows the visible child-list layouts:
   - opcode 1: BYTE count at +0x14, pointer list at +0x18;
   - opcode 2: DWORD count at +0x10, wrapper pointers at +0x14, wrapper +8 to descriptor;
   - opcode 3: BYTE count at +0x0B, child pointers at +0x20;
   - opcode 4: BYTE count at +0x12, inline child pointers at +0x14;
   - opcode 5: BYTE count at +0x36, child pointers at +0x38, with Q20.12 matrix and position fields;
   - opcode 9: BYTE count at +6, child pointers at +0x10;
   - opcode 10: class reset (handler repeats `0x4E04A2`);
   - opcode 11: two child pointers at +8 and +0x0C;
   - opcode 12: WORD scale at +4, WORD count at +6, child pointers at +8;
   - opcode 13: class-word state callback (`0x4E023A`).
4. Recovers the existing nine raw geometry sections using the already-established shared coordinate pool and face-record structure: one root mesh and eight submeshes, 390 referenced vertices and 230 triangles.
5. Checks each submesh's owner translation against the paired transform-node translation. The vectors must match before the runner accepts that anchor.
6. Records descriptor leaves reached through opcode 2. For each it captures the +4 coordinate target, +8 shared target, +12 opcode-4 payload target and +0x10 payload count from the opcode-0 descriptor resolver. These references are compared with the legacy submesh reference points; exact matches are reported, not guessed.
7. Separates descriptor callback matches from actual matrix-bearing transform callbacks. For every descriptor whose payload pointer matches a mesh's exact face-data start, it traces the callback ancestry and reports every opcode-5 matrix on that path. This determines whether the transform forest actually reaches each geometry section.
8. Cross-checks owner-anchor candidates against paired-node vectors and adds a separate reference-point mapping candidate: the point referenced by meshNode+28 is mapped to the target point stored at meshNode+56/+60/+64. This remains a geometric hypothesis, not a proven renderer rule.
9. Exports **24 GLB candidates**: two source-matrix orientations × two translation placements × six position sources (accumulated callback state, matrix-output position, owner anchor, two additive combinations, and reference-point mapping).

## Output directory

The run writes:

- `RUNTIME-REBUILD.md`: concise summary, callback counts, mesh-to-callback links, unresolved records and candidate files.
- `runtime-rebuild.json`: full event trace, dispatch table, matrix frames, geometry links, helper calls and assumptions.
- `callback-work-stack.csv`: each simulated work-stack entry and its parent/child relationship.
- `geometry-callback-links.csv`: geometry nodes, reference points, descriptor-coordinate/payload matches, callback-node matches and matrix-bearing callback counts.
- `geometry-callback-ancestry.csv`: one row per exact face-payload descriptor match, including run/seed, parent-matrix ID, position, ancestry and opcode-5 transform path.
- `descriptor-payload-links.csv`: descriptor-to-coordinate/payload targets recovered by opcode-2 / opcode-0 traversal.
- `scout-runtime-*.glb`: 24 alternative placements for visual comparison.
- `executable-analysis/REPORT.txt`: disassembly bridge output, including the loader context helper and its call sites.

## Known limits — read before treating a GLB as final

This is a **static callback reconstruction candidate generator**, not a bit-exact execution of the Windows executable. Three important pieces remain explicitly exposed rather than guessed:

- opcode 0 calls helper `0x4E59C8`; descriptor coordinate/payload references and counts are decoded, but the helper's packed-property mutation across the payload records is not applied;
- opcode 3 can call helper `0x4DF970` when record byte +0x12 is 1; that conditional helper is logged but not emulated;
- the shared callback tail at `0x4DFDF9` performs post-handler scale/state normalization; the whole routine is not yet emulated.

The initial callback scale/context is supplied in EDX by the loader. The current default is zero. The new executable bridge dump gives the exact loader/helper code needed to resolve this parameter, but the runner does not yet infer it.

The dispatch entries 10–13 were cross-checked against the raw 14-DWORD table bytes: opcode 10 repeats `0x4E04A2`, opcode 11 points to `0x4E02E7`, opcode 12 to `0x4E0399`, and opcode 13 to `0x4E023A`. The first uploaded run used the wrong mapping for 10–13; the current tool corrects it.

The 24 GLBs are therefore **comparative placement candidates**, not a declared finished Scout. The decisive ancestry result is whether each face-payload descriptor has an opcode-5 ancestor; a descriptor match by itself is not a transform. A GLB can have owner-anchor placements without having any callback-derived geometry transform; the report now counts those separately. The acceptance test is a recognisable humanoid Scout with all expected sections in plausible positions, followed by checking the selected transform convention against another Scout variant. The raw 9-section geometry counts are controls, not proof that the placement is correct.

## Why opcode 4 is inline

The disassembly at `0x4E006D` sets ECX to the opcode-4 record pointer, advances ECX by four for each iteration, and reads `[ECX+0x14]`. Therefore opcode-4 child pointers are inline at `record+0x14`. The previous context-derived address experiment was incorrect and has been removed from this runner.
