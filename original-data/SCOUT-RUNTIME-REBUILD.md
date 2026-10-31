# Scout runtime rebuild candidate generator

Use **`tools/scout-runtime-rebuild.mjs`** for the next Scout assembly run. It replaces the earlier static discovery-only workflow and supersedes the abandoned `scout-assembly-hunt.mjs` experiment.

## Run once

From the repository root:

```sh
git pull

node tools/scout-runtime-rebuild.mjs \
  original-data/units.ff \
  scout-runtime-rebuild \
  --exe /home/tapaccos/Outwars-extracted/outwars.exe
```

Node.js 18+ is recommended. The runner validates and extracts `scout_mj.dpc` from `units.ff` automatically. It also accepts a loose `scout_mj.dpc` path.

Supplying `--exe` runs the disassembly bridge and captures the initial matrix plus the loader/caller code around the callback context helper. The caller-supplied initial scale/context is still not decoded automatically; the runner uses zero by default and records that assumption. Do not change it arbitrarily.

## What it does

1. Reads the DPC's top-level relocated record-pointer table and invokes the callback simulation for each table slot in order, preserving repeated pointers.
2. Uses the executable's 14-entry callback table at `0x4DFCAC` (byte zero is the opcode; WORD +2 is a separate class/state field).
3. Follows the visible child-list layouts:
   - opcode 1: BYTE count at +0x14, pointer list at +0x18;
   - opcode 2: DWORD count at +0x10, wrapper pointers at +0x14, wrapper +8 to descriptor;
   - opcode 3: BYTE count at +0x0B, child pointers at +0x20;
   - opcode 4: BYTE count at +0x12, inline child pointers at +0x14;
   - opcode 5: BYTE count at +0x36, child pointers at +0x38, with Q20.12 matrix and position fields;
   - opcode 9/13: BYTE count at +6, child pointers at +0x10;
   - opcode 10: two child pointers at +8 and +0x0C;
   - opcode 11: WORD scale at +4, WORD count at +6, child pointers at +8.
4. Recovers the existing nine raw geometry sections using the already-established shared coordinate pool and face-record structure: one root mesh and eight submeshes, 390 referenced vertices and 230 triangles.
5. Checks each submesh's owner translation against the paired transform-node translation. The vectors must match before the runner accepts that anchor.
6. Maps actual callback record offsets to mesh/transform-node offsets where they match.
7. Exports **20 GLB candidates**: two source-matrix orientations × two translation placements × five position sources (accumulated callback state, matrix-output position, owner anchor, and the two additive combinations).

## Output directory

The run writes:

- `RUNTIME-REBUILD.md`: concise summary, callback counts, mesh-to-callback links, unresolved records and candidate files.
- `runtime-rebuild.json`: full event trace, dispatch table, matrix frames, geometry links, helper calls and assumptions.
- `callback-work-stack.csv`: each simulated work-stack entry and its parent/child relationship.
- `geometry-callback-links.csv`: which geometry sections matched callback executions.
- `scout-runtime-*.glb`: 20 alternative placements for visual comparison.
- `executable-analysis/REPORT.txt`: disassembly bridge output, including the loader context helper and its call sites.

## Known limits — read before treating a GLB as final

This is a **static callback reconstruction candidate generator**, not a bit-exact execution of the Windows executable. Three important pieces remain explicitly exposed rather than guessed:

- opcode 0 calls helper `0x4E59C8`; its side effects are logged but not emulated;
- opcode 3 can call helper `0x4DF970` when record byte +0x12 is 1; that conditional helper is logged but not emulated;
- the shared callback tail at `0x4DFDF9` performs post-handler scale/state normalization; the whole routine is not yet emulated.

The initial callback scale/context is supplied in EDX by the loader. The current default is zero. The new executable bridge dump gives the exact loader/helper code needed to resolve this parameter, but the runner does not yet infer it.

The 20 GLBs are therefore **comparative assembly candidates**, not a declared finished Scout. The acceptance test is a recognisable humanoid Scout with all expected sections in plausible positions, followed by checking the selected transform convention against another Scout variant. The raw 9-section geometry counts are controls, not proof that the placement is correct.

## Why opcode 4 is inline

The disassembly at `0x4E006D` sets ECX to the opcode-4 record pointer, advances ECX by four for each iteration, and reads `[ECX+0x14]`. Therefore opcode-4 child pointers are inline at `record+0x14`. The previous context-derived address experiment was incorrect and has been removed from this runner.
