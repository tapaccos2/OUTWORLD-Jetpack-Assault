# Original Outwars data — initial inspection

This note records observations from the original files currently present in this repository. It is not a complete format specification.

## Confirmed files and observations

- `original-data/misn/Anub01.mis` is 7,234 bytes.
  - Begins with the readable label `Mission Builder v1.9G`.
  - Mission briefing text: `Player must seek out surviving colonists at the ruins of Hobb's Colony.`
  - References `anub01.dpc`, `laborer.dpc`, `defenderWmortar.dpc`, `walkingBabyAssassin.dpc`, and `anub01m1.pcx`.
  - Contains named mission triggers/events including `NavsRemain`, `Nav1Hit`, `AllNavsHit`, `GameStart`, `Succeed`, and `OpenDoor`.

- `original-data/misn/Anub02.mis` is 8,992 bytes.
  - Begins with `Mission Builder v1.9`.
  - Mission title: `Anubis 2 Remix`.
  - References `anub02.dpc`, `Turret1.dpc`, `flyingAssassin.dpc`, `strikecraft.dpc`, `laborer.dpc`, `defenderWmortar.dpc`, `dropship.dpc`, and `anub02m1.pcx`.
  - Contains readable briefing text and event names such as `ScienceKilled`, `SilosKilled`, `ScienceAttacked`, and `AllSilosKilled`.

- `original-data/misn/oasis4.mis` is 5,296 bytes.
  - Begins with `Mission Builder v1.9`.
  - References `oasis05.dpc`, `Laborer.dpc`, `Dropship.dpc`, `hstrike.dpc`, `Hdrop.dpc`, `defenderSmall.dpc`, and `oasis4m1.pcx`.
  - Contains mission event names such as `Dropship has arrived`, `Dropcount`, `BodyCount`, `HitNav2`, and `DropshipLands`.

- `original-data/gry/Q.gry` is 87,615 bytes. Its first bytes are:
  `27 70 06 03 1c 00 04 00 04 00 04 00 ff 7f 00 00 01 00 00 00 ff 7f 00 00 3c 00 00 00 7f 00 00 00`
  This is a sound-effect audio container. The embedded records use MS ADPCM; see `GRY-STRUCTURE-INDEX.md` for verified framing.

## Implications for the rebuild

1. The `.MIS` files are structured binary mission-builder files, not plain text. Readable strings expose mission names, briefings, asset references, and event identifiers, but a proper parser must decode the surrounding binary fields.
2. The mission files refer to additional assets, especially `.DPC` and `.PCX` files. The `.MIS` files and loose resources alone may not contain everything required to reconstruct a level faithfully; `.GRY` files are sound-effect audio, not terrain.
3. Do not treat extracted strings as a complete map. The mission placement/object records still need to be decoded, and the actual terrain asset format must be identified and validated against the original game.
4. Preserve original filenames and case. The game references files with mixed-case names.

## New lead: map-named `.DPC` files

Static inspection of `outwars.exe` found a parser that checks for the four-byte `DCPM` identifier followed by `C`; the executable also contains separate group/ramp parsers for the `CPMG` and `CPMR` signatures. The loose `anub01.dpc` and `flag_blu.dpc` files begin with `DCPMC`, matching the database parser check. The DPC header stores a relocation base at offset 12 (for example, `0x80019c40`). The executable subtracts that value from each stored pointer to resolve a file offset: `0x8008ae00` in `anub01.dpc` resolves to offset 463,296, where a typed record begins. The record count at offset 32 and pointer table at offset 36 correctly yield 5 records in `anub01.dpc`, 6 in `rag01.dpc`, and 1 in `flag_blu.dpc`; their record bounds are in file range. `tools/inspect-dpc-headers.mjs` reports header pointers, and `tools/inspect-dpc-records.mjs` reports record boundaries and raw kind/flag/class fields. This is now a validated structural decode, but the record semantics and terrain geometry remain undecoded.

## Terrain-format lead from the executable

Static disassembly identifies two terrain-specific resource formats that are absent from the current repository inventory:

- `TERRAIN\\RED.GRP`: the executable checks the `CPMG` signature and a 32-bit version field equal to `0x43`, limits the entry count to 200, then copies a `0x1900`-byte payload after a 20-byte header.
- `TERRAIN\\RAG01.RMP`: the executable checks the `CPMR` signature and the same version value, limits the entry count to 1000, then copies a `0x9c40`-byte payload after a 20-byte header.

These are confirmed parser expectations from the executable, not a complete specification of the files' geometry semantics. Neither `.GRP` nor `.RMP` appears in the current local file inventory, so their payloads cannot yet be inspected or validated. The map-named `.DPC` record table is now structurally decoded, but no terrain mesh has been reconstructed from it.

## New structural result: group/ramp records are present under .GPC/.RPC names

The terrain-resource scan found many existing `.GPC` files beginning with `CPMG` and `.RPC` files beginning with `CPMR`. Direct byte inspection of `rag01.gpc`, `rag01.rpc`, `anub01.gpc`, and `anub01.rpc` confirms the 20-byte header pattern: four-byte signature, version `0x43` at offset 4, and a record count at offset 16. The sample sizes match exactly:

- `rag01.gpc`: 1,620 bytes = 20-byte header + 50 × 32-byte records.
- `rag01.rpc`: 30,700 bytes = 20-byte header + 767 × 40-byte records.
- `anub01.gpc`: 916 bytes = 20-byte header + 28 × 32-byte records.
- `anub01.rpc`: 8,140 bytes = 20-byte header + 203 × 40-byte records.

The executable's group/ramp buffer limits also match these record widths: `0x1900 = 200 × 32` and `0x9c40 = 1000 × 40`. This strongly establishes that the loose `.GPC` and `.RPC` files share the structural formats expected by the `.GRP` and `.RMP` loaders, even though the specifically named `TERRAIN/RED.GRP` and `TERRAIN/RAG01.RMP` files are not present in the repository inventory. The actual record fields and their geometric meaning remain undecoded; no terrain mesh has yet been reconstructed. A raw structural inspector is available as `tools/inspect-grp-rmp.mjs`.

## Next technical work

- Enumerate all files under `original-data/misn/` and `original-data/gry/`.
- Inspect the mission binary schema across several files, identify record boundaries, and export a first machine-readable JSON representation.
- Inspect/extract `.GRY` sound-effect audio; investigate pointer tables and record layouts in map-named `.DPC` files, while keeping the terrain interpretation provisional.
- Check which referenced `.DPC`, `.PCX`, and other resources are available before rendering a faithful level.

## External release-manifest cross-check (2026-10-29)

The public SteamDB listing for Outwars content depot 1431941 lists the shipped resource files and includes the campaign-matched `structs/*.gpc` and `structs/*.rpc` files (for example, `structs/rag01.gpc`, `structs/rag01.rpc`, and corresponding Anubis/Ragnarok pairs). The same listing does not show a `TERRAIN/` directory or the specific `TERRAIN/RED.GRP` / `TERRAIN/RAG01.RMP` paths. This independently matches the repository inventory: the named files are not simply missing from the loose-file upload; they are also absent from the public depot's listed paths.

This does **not** prove that the terrain files were never created or that they cannot be generated/renamed by another installation step. It means the next investigation should not spend time repeatedly searching for those exact paths in this release. The concrete shipped equivalents worth comparing are the campaign-matched `.GPC/.RPC` pairs under `structs/`. Their header and record-size layouts match the executable's `CPMG`/`CPMR` parser expectations, but their field semantics and any conversion between these names and the old `TERRAIN` paths remain unproven.

Source: [SteamDB Outwars Content depot 1431941](https://steamdb.info/depot/1431941/), public file listing accessed 2026-10-29. The depot listing is external corroboration of filenames and sizes only; it is not a terrain-format specification.

## New cross-file structure result: GPC records partition RPC records

A direct byte-level comparison of five campaign-matched pairs (`anub01`, `anub02`, `rag01`, `rag02`, and `oasis01`) found that 16-bit fields at byte offsets 24 and 26 in each 32-byte GPC record form inclusive start/end ranges into the paired RPC table. In all five samples, the ranges are in bounds, ordered, contiguous, begin at record 0, and cover the entire RPC table without gaps or overlap. Examples:

- `anub01`: 28 GPC records partition all 203 RPC records; ranges begin `[0,2]`, `[3,5]`, `[6,8]` and end `[191,202]`.
- `rag01`: 50 GPC records partition all 767 RPC records; ranges begin `[0,10]`, `[11,15]`, `[16,20]` and end `[678,766]`.
- `rag02`: 106 GPC records partition all 988 RPC records; ranges begin `[0,5]`, `[6,11]`, `[12,17]` and end `[983,987]`.

This is a validated cross-file index relationship and is the first evidence that the GPC/RPC pair is not just two files sharing related headers. The geometric meaning of the RPC records, the other GPC fields, and the actual mesh-generation rules are still unknown. A reusable validator is available at `tools/check-gpc-rpc-pairs.mjs`; run it across `original-data/structs/` to test every pair.

## RPC field-pattern comparison across campaigns (2026-10-29)

A direct comparison of the 40-byte RPC records in `anub01`, `anub02`, `rag01`, `rag02`, and `oasis01` shows a consistent pattern in the four 16-bit fields at record-relative byte offsets 16, 20, 24, and 28: many records repeat the same value across all four positions, while other records vary by position. Counts of records with all four values equal are 186/203 (`anub01`), 155/273 (`anub02`), 221/767 (`rag01`), 631/988 (`rag02`), and 103/305 (`oasis01`). This pattern is consistent across different campaign resources but is not sufficient to identify those fields as heights, vertices, texture values, or any other specific concept.

The fields at offsets 32 and 36 also contain signed-looking 16-bit values in many records, but their semantics are not established. The current defensible result is that GPC ranges partition the RPC table and RPC records contain repeated, position-dependent 16-bit patterns. A geometry decoder still needs a reliable interpretation of record types and coordinate/value fields, ideally checked against the original executable's read/use sites or a rendered comparison against the mission map image.

## Terrain spatial-field hypothesis: new cross-file validation (2026-10-29)

The latest test supports a more specific, still provisional interpretation of the GPC/RPC fields. In GPC records, treating signed 32-bit values at offsets 0 and 4 as an XY origin and offsets 12 and 16 as positive X/Y spans yields a rectangle that contains the RPC positions indexed by that group in 237 of 254 groups across seven pairs (`anub01`, `anub02`, `rag01`, `rag02`, `oasis01`, `oasis02`, `mik01`). The 17 exceptions are retained as failures rather than silently treated as matches; edge conventions or special records may explain some, but this remains to be tested.

A separate check found that the signed 32-bit value at GPC offset 8 appears among the four signed 32-bit values at RPC offsets 16, 20, 24 and 28 in every one of the 254 groups. In many groups all four RPC values equal that GPC value. The two signed 32-bit values at RPC offsets 32 and 36 behave as planar positions and fit the inferred group regions in most cases. Taken together, these checks support the hypothesis that a GPC record contains a region origin, reference/base elevation, spans, and an inclusive range into RPC records; each RPC record contains a position and four corner-like elevation values.

The old RPC field-pattern note above describes these offsets as 16-bit fields because the initial comparison inspected 16-bit words. The new comparison reads each aligned field as a signed 32-bit integer; the upper 16 bits are often zero, but not always. The 32-bit interpretation is the current working hypothesis and should be treated as such until validated against the executable or an independently rendered map.

A reproducible checker is now available at `tools/analyze-terrain-field-hypotheses.mjs`. It reports the inferred bounding-box fit and reference-value consistency for each paired file. The measured results and caveats are also recorded in `original-data/TERRAIN-FIELD-HYPOTHESES.md`.

This is not yet a terrain decoder: RPC corner ordering, coordinate/height units, spans' exact meaning, and the role of RPC's leading 16 bytes remain unknown. The next work is to resolve those fields and validate a diagnostic mesh against an original map reference before building terrain into the browser prototype.

### Expanded terrain-field check across all 34 resource pairs

The spatial-field consistency check has now been run against every one of the 34 paired GPC/RPC resource sets in `original-data/structs/`. All 34 pairs preserve the contiguous, in-bounds range partition from GPC groups to RPC records. Across 749 groups total, the inferred GPC origin/span rectangle contains all indexed RPC positions in 717 groups (95.7%); the 32 exceptions are concentrated in `rag01` (5), `rag02` (10), `mik01` (2), `anub03` (1), `anub2m` (2), `anub3m` (1), `mik1m` (2), and `rag2m` (9). The inferred GPC reference value appears among the indexed RPC corner-like values in every group across all 34 pairs.

This is now broad internal validation of the candidate spatial-field layout, not just a handful of examples. It still does not prove the coordinate axis convention, corner ordering, world scale, or the semantic role of the RPC record's leading 16 bytes. The reusable checker is `tools/analyze-terrain-field-hypotheses.mjs`; the current measurements and limits are in `original-data/TERRAIN-FIELD-HYPOTHESES.md`.

### Executable cross-check for RPC field semantics

Static disassembly of the local original `outwars.exe` now provides a direct use-site confirmation. At VA `0x00477030`, a native routine computes the RPC record stride as `index * 40`, copies a position pair into offsets `+32` and `+36`, writes one signed height value to both `+16` and `+20`, and writes another sign-extended height value to both `+24` and `+28` (stores at `0x0047706d`–`0x00477095`). This confirms the four fields are used as two pairs of surface-height values and the last pair as position components; it does not establish axis orientation or scale.

The loader at VA `0x004EC990` checks CPMG/CPMR magic, version `0x43`, and limits of 200 GPC and 1000 RPC records, then copies the fixed payload sizes (`0x1900` and `0x9c40` bytes). It does not decode individual records in that routine. Details and caveats are recorded in `original-data/TERRAIN-FIELD-HYPOTHESES.md`.

### RPC orientation vector confirmed across all records

The signed 16-bit values at RPC offsets `+6` and `+8` are confirmed fixed-point sine/cosine components. The native setter at VA `0x00477030` calls the executable's sine lookup at `0x004C51C4` and cosine lookup at `0x004C5230`, storing the results at exactly those offsets. Independently, every one of the 8,005 RPC records across all 34 files has `sqrt(sin² + cos²)` within 2 of 4095 (observed range 4094.34–4096.62). The terrain checker now measures this invariant automatically.

This identifies a real orientation field and gives us a concrete next disassembly target: locate the code that consumes this vector to derive the ramp's four corner positions. The remaining fields at RPC offsets `+0`, `+2`, `+4`, `+10`, `+12`, and `+14` are not yet decoded.
