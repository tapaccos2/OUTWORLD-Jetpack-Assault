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

## Next technical work

- Enumerate all files under `original-data/misn/` and `original-data/gry/`.
- Inspect the mission binary schema across several files, identify record boundaries, and export a first machine-readable JSON representation.
- Inspect/extract `.GRY` sound-effect audio; investigate pointer tables and record layouts in map-named `.DPC` files, while keeping the terrain interpretation provisional.
- Check which referenced `.DPC`, `.PCX`, and other resources are available before rendering a faithful level.
