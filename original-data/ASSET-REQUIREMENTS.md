# Original-data completeness check

## Repository inventory after the latest asset upload

The repository now contains 828 files under `original-data/`, including:

- 11 terrain `.GRY` files
- 38 mission `.MIS` files across `misn/` and `netmisn/`
- 320 `.PCX` images
- 266 `.TXT` files
- 142 files under `structs/`: 37 `.DPC`, 34 `.GPC`, 34 `.RPC`, and 37 `.TPC`
- 22 packed `.FF` files, including `units.ff` and `motion.ff`
- 21 `.SPT` files and one `.FNT` file

The new assets materially improve coverage: mission-level structure resources and their companion graphics/resource tables are now present for multiple campaigns, along with packed game resources and the shell database assets.

## Still to verify

- Whether the uploaded `structs/` collection contains every structure/unit resource referenced by the mission files. The folder has many campaign-specific sets, but the current inventory alone does not prove completeness.
- Whether `units.ff` and the other `.FF` archives contain additional unit, model, texture, sound, or other resources needed by the game.
- Whether the terrain `.GRY` format can be decoded into actual terrain geometry. The format remains under investigation.
- Whether the `.MIS` binary structures can be parsed into placements, parameters, triggers, and mission logic. The readable names alone do not recover those values.

## Next analysis steps

1. Compare every resource reference in both `misn/` and `netmisn/` against the filenames now present in the repository.
2. Inspect headers and internal references in representative `.DPC`, `.TPC`, `.GPC`, and `.RPC` files, plus `units.ff`.
3. Continue the `.GRY` and `.MIS` format investigation, validating findings across multiple files before using them to reconstruct a level.

This inventory describes what is currently present. It does not claim that the assets have been fully decoded or that a playable reconstruction is complete.
