# Scout autonomous discovery runner

The new `tools/scout-autodiscovery.mjs` is the broad, single-run investigation harness for Scout DPC reconstruction. It replaces the need to invoke each narrow inspector manually.

## Run

From the repository root:

```sh
node tools/scout-autodiscovery.mjs \
  original-data/units/scout_mj.dpc \
  scout-autodiscovery \
  --exe /home/tapaccos/Outwars-extracted/outwars.exe
```

It requires Node.js with modern ES-module support (Node 18 or newer is recommended). The executable argument is optional, but including it also runs the existing executable-disassembly bridge. The runner now auto-extracts `scout_mj.dpc` from `original-data/units.ff` when the loose DPC path is missing, and it also accepts `original-data/units.ff` directly as its first argument.

For a wider payload sweep, use `--max-targets 1200`. To skip the raw-geometry control export, use `--no-baseline`.

## What one run tests

1. Validates the DCPMC header and scans the resource for callback-byte and aligned record-header candidates.
2. Finds structurally valid opcode-5 transform records and constructs their parent/child graph.
3. Follows opcode-5 child records into opcode-2 descriptor lists and descriptor pointers.
4. Follows opcode-4/class-0x090c child lists, recursively tests their entries under relocated, absolute-file-offset and signed-relative pointer interpretations, and expands any target that validates as opcode 2, 4 or 5.
5. Scans the entire file for aligned DWORD references to discovered records and payload targets.
6. Tests both matrix multiplication orders, matrix transpose choices and raw versus Q20.12 position scales. It ranks the resulting matrices for rigidity/orthogonality without treating that score as proof of the game's convention.
7. Tests candidate signed-16-bit and float coordinate layouts, several record strides, and candidate unsigned index streams around the discovered payload targets.
8. Runs the established raw geometry exporter as a control, and optionally runs the executable analysis bridge.

## Output

The output directory contains:

- `DISCOVERY-REPORT.md`: ranked findings and leading candidate interpretations.
- `discovery-report.json`: full callback graph, transform data, reverse references, pointer tests and all candidate evidence.
- `hypothesis-scoreboard.csv`: ranked hypothesis list.
- `opcode4-entry-candidates.csv`: every discovered opcode-4 child entry with each tested address interpretation.
- `payload-coordinate-candidates.csv`: highest-ranked coordinate-layout candidates.
- `payload-index-candidates.csv`: highest-ranked index-stream candidates.
- The raw geometry GLB and JSON control from the existing exporter, if that export succeeds.
- `executable-analysis/` when `--exe` is supplied and the bridge is available.

## Evidence boundary

This is an automated static investigation sweep, not a magical semantic oracle. It is designed to expose competing interpretations and rank them using structural tests. A value that happens to resolve inside the file, or a byte sequence that resembles coordinates or indices, is not by itself proof of its runtime role.

The script deliberately does not label the raw GLB as an assembled Scout. The remaining acceptance test is still a proven link from renderable payloads to their transform paths, followed by a recognisable GLB that can be visually checked against the game.


## Follow-up: strict callback-link validation

The runner now separates raw in-file address candidates from **exact callback-record matches**. An opcode-4 child entry counts as a validated callback link only when its relocated pointer lands exactly on an independently validated opcode-2, opcode-4, or opcode-5 record start.

This stricter report also records:
- the ten primary opcode-4 roots referenced by the transform-child descriptor lists;
- all recursively discovered opcode-4 records;
- every exact entry-index-to-record edge under the DPC relocation-base interpretation;
- how many opcode-4 records are reachable from those primary roots without using speculative absolute/relative pointer interpretations.

The broad coordinate/index tests are explicitly labelled heuristic. Their scores only measure byte-pattern properties such as uniqueness and spatial spread; they do not prove vertex or index arrays. Transform rigidity scores are likewise sanity checks, not a way to choose matrix order or translation scale.

See [SCOUT-AUTODISCOVERY-FINDINGS-01.md](./SCOUT-AUTODISCOVERY-FINDINGS-01.md) for the interpretation of the first uploaded run.


## Next stage: callback execution and geometry placement

The static discovery pass is now followed by `tools/scout-runtime-rebuild.mjs`. It processes the DPC top-level record-pointer table using the executable's callback dispatch table, follows the observed opcode child-list layouts, links executed record offsets to the established nine raw geometry sections, and exports 20 placement candidates.

Run:

```sh
node tools/scout-runtime-rebuild.mjs \
  original-data/units.ff \
  scout-runtime-rebuild \
  --exe /home/tapaccos/Outwars-extracted/outwars.exe
```

See [SCOUT-RUNTIME-REBUILD.md](./SCOUT-RUNTIME-REBUILD.md) for the current executable evidence, outputs, assumptions and remaining gaps. This second-stage runner supersedes the abandoned `scout-assembly-hunt.mjs` experiment, which incorrectly interpreted opcode-4 entries as face data.
