# Structure-resource format observations (work in progress)

## Inventory

The repository contains 142 files under `original-data/structs/`:

- 37 `.DPC`
- 34 `.GPC`
- 34 `.RPC`
- 37 `.TPC`

The repository also contains `original-data/units.ff` (9,468,892 bytes), `original-data/motion.ff` (935,386 bytes), and 20 `.FF` files under `original-data/shelldb/`.

## Binary signatures and common header bytes

Byte-level inspection of representative resources confirms these four-byte type signatures:

| Extension | Example | First four bytes (hex) | ASCII view |
|---|---|---|---|
| `.DPC` | `anub01.dpc` | `44 43 50 4d` | `DCPM` |
| `.GPC` | `anub01.gpc` | `43 50 4d 47` | `CPMG` |
| `.RPC` | `anub01.rpc` | `43 50 4d 52` | `CPMR` |
| `.TPC` | `cyball1.tpc` | `54 43 50 4d` | `TCPM` |

The `anub01.dpc`, `anub01.gpc`, and `anub01.rpc` examples share the next eight bytes:

`43 00 00 00 BA 30 03 35`

The four-byte field at offset 12 differs by type: the sampled DPC begins `40 9C 01 80`, while the sampled GPC and RPC have `05 00 00 00`. These are raw observations only; the fields have not been assigned semantic meanings. The sampled `anub02.gpc` has a different value at offset 8, so that field is not a universal constant.

The GPC/RPC record layouts are now decoded far enough to reconstruct candidate terrain surfaces; see [TERRAIN-FIELD-HYPOTHESES.md](TERRAIN-FIELD-HYPOTHESES.md). The larger DPC/TPC payloads have not yet been decoded into models or textures.

## FF archive directory table — new confirmed finding

Four binary archives were inspected from their actual bytes: `motion.ff`, `shelldb/library.ff`, `shelldb/graphics.ff`, and `shelldb/briefing.ff`. All four share this directory layout:

1. Offset `0`: a 32-bit little-endian entry count.
2. Offset `4`: entries of 44 bytes each.
3. Each entry contains a 32-bit little-endian payload offset followed by a 40-byte NUL-padded filename.
4. The final entry has an empty filename and an offset equal to the exact file length. It is a sentinel/end boundary, not a named resource.
5. The first payload offset equals `4 + entryCount * 44`, exactly the end of the directory table. Offsets are monotonic in all four samples.
6. A named resource's stored size can therefore be derived as its offset to the next entry's offset. This gives archive boundaries without decoding the payload itself.

| Archive | File bytes | Header entry count | Directory end / first payload | Named resources | Sentinel offset |
|---|---:|---:|---:|---:|---:|
| `motion.ff` | 935,386 | 61 | 2,688 | 60 | 935,386 |
| `shelldb/library.ff` | 598,388 | 20 | 884 | 19 | 598,388 |
| `shelldb/graphics.ff` | 702,401 | 30 | 1,324 | 29 | 702,401 |
| `shelldb/briefing.ff` | 832,984 | 30 | 1,324 | 29 | 832,984 |

Examples of filenames extracted from `motion.ff` include `fdeath1.mc`, `fglide1.mc`, `frun1.mc`, `fstand1.mc`, `mdeath1.mc`, `mrun1.mc`, `mstand1.mc`, and `mwalk4.mc`. These are motion/animation resources. The archive index proves their names and byte ranges; it does not yet decode the animation payloads.

**Important:** `units.ff` and the other FF archives have not all been validated against this layout. Run the local inspector on them; it reports any mismatch instead of silently assuming the format.

## Tools and next checks

Run from the repository root:

```sh
node tools/inspect-ff-archives.mjs original-data/motion.ff original-data/units.ff original-data/shelldb/*.ff
node tools/cross-reference-resources.mjs original-data > original-data-resource-references.json
```

Next:
1. Validate the FF directory-table hypothesis against `units.ff` and more shell archives.
2. Use the extracted FF filenames and offsets to compare archive contents with loose files and mission references.
3. Compare multiple `.DPC/.GPC/.RPC/.TPC` files by type and campaign to identify header fields and internal record layouts.
4. Continue linking these assets to `.MIS` placements and identify the separate terrain asset format; `.GRY` files are sound-effect audio.

A candidate GPC/RPC terrain-surface decoder, OBJ exporter, and interactive preview now exist, though the mesh still needs visual validation against an original in-game map. DPC/TPC model and texture payloads, animation, and mission logic remain undecoded. The `.GRY` files are sound-effect audio containers, not terrain geometry. These notes distinguish confirmed byte layout from fields whose meanings remain unknown.

## Executable format-signature lead

Static inspection of `outwars.exe` found checks for `DCPM` followed by `C` in the database parser, and `CPMG` / `CPMR` followed by `C` in separate group and ramp parsers. The corresponding loose files begin with `DCPMC`, `CPMGC`, and `CPMRC`. The map-named `.DPC` files are therefore the next assets to inspect for scene data. The header stores a relocation base at offset 12 (e.g. `0x80019c40`); stored pointers resolve as `file offset = pointer - relocation base`. Static inspection of the executable confirms that the record count is at offset 32 and the pointer table begins at offset 36. `tools/inspect-dpc-records.mjs` lists the resulting record boundaries and raw kind/flag/class fields. This structure is validated across several map and prop DPC files, but it is not yet a geometry decoder.

This is a file-format lead, not a terrain decoder. The actual terrain role of the map-named `.DPC` files still needs validation, and the `.GRY` files are sound-effect audio.

## Validation update: `units.ff`

Validated locally with `tools/inspect-ff-archives.mjs` on 2026-10-29. The reported archive is 9,468,892 bytes and passes every current directory-table check:

- Header entry count: 121 (120 named resources plus the final empty-name EOF sentinel).
- Directory end / first payload offset: 5,328.
- Last sentinel offset: 9,468,892, exactly EOF.
- Monotonic payload offsets; no validation errors.

The index contains paired model/texture resources, including `laborer.dpc/.tpc`, `defenderWmortar.dpc/.tpc`, `flyingAssassin.dpc/.tpc`, `dropship.dpc/.tpc`, `strikecraft.dpc/.tpc`, `turret1.dpc/.tpc`, and `walkingBabyAssassin.dpc/.tpc`. These names directly explain several resources that were absent from the loose `structs/` directory: they are packaged inside `units.ff`. The archive also contains other vehicle/unit pairs and two text resources, `Brad.txt` and `Kirk.txt`.

This validates the archive directory/index, not the internal DPC/TPC decoding. Next, extract the 120 payloads with `tools/extract-ff-resources.mjs`, then compare extracted files against loose `structs/` and mission references before inspecting model/texture payload layouts.
