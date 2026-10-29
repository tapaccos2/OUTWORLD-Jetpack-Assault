# Original-data completeness check

The current repository tree contains 310 files under `original-data/`:
- 27 mission `.MIS` files
- 11 terrain `.GRY` files
- 97 `.PCX` images
- 170 `.TXT` files

The original mission files contain references to `.DPC` resources, including mission-level names (for example `anub02.dpc`) and unit resources (for example `laborer.dpc`, `defenderWmortar.dpc`, and `flyingAssassin.dpc`). Those `.DPC` files are not currently present under `original-data/`.

The original game distribution also has a `structs/` directory with paired `.DPC`, `.GPC`, `.RPC`, and `.TPC` files, as well as packed resource files such as `units.ff`. The SteamDB depot inventory lists these resource families alongside `gry/` and `misn/`: https://steamdb.info/depot/1431941/

## Why this matters

- `.MIS` data is mission logic and references; it is not itself the full 3D world.
- `.GRY` files are the terrain source candidates, but their binary layout is not decoded yet.
- `.PCX` files in the current repository can help identify mission briefing/map images.
- Missing `.DPC` and companion resources prevent a faithful reconstruction of original objects, structures, and units from the current upload alone.

This is a factual inventory of what is and is not present in the repository. It is not a request to re-upload files; the existing mission and terrain data is being analyzed first.
