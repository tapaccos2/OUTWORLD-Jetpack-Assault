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
  This is binary terrain data; these bytes alone are not enough to assert the complete layout or height encoding.

## Implications for the rebuild

1. The `.MIS` files are structured binary mission-builder files, not plain text. Readable strings expose mission names, briefings, asset references, and event identifiers, but a proper parser must decode the surrounding binary fields.
2. The mission files refer to additional assets, especially `.DPC` and `.PCX` files. The `.MIS` and `.GRY` folders alone may not contain everything required to reconstruct a level faithfully.
3. Do not treat extracted strings as a complete map. The mission placement/object records and terrain format still need to be decoded and validated against the original game.
4. Preserve original filenames and case. The game references files with mixed-case names.

## Next technical work

- Enumerate all files under `original-data/misn/` and `original-data/gry/`.
- Inspect the mission binary schema across several files, identify record boundaries, and export a first machine-readable JSON representation.
- Decode the `.GRY` header and terrain payload separately.
- Check which referenced `.DPC`, `.PCX`, and other resources are available before rendering a faithful level.
