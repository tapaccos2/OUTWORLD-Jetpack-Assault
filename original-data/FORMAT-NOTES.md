# Binary format investigation notes (work in progress)

## Mission files (`.MIS`)

Observed across Anubis, Oasis, Dead, Juggernaut and Ragnarok mission files:

- The first byte is a length byte for the ASCII version string.
- The following bytes spell `Mission Builder v1.9` (20 bytes). In `Anub01.mis`, the next byte is `G`, indicating a variant/version suffix rather than a new title-length byte.
- Most files then have a one-byte length followed by a readable mission title, e.g. `Anubis 2 Remix`, `Anubis 3 Glider wing mission`, `Anubis-5 Alien Tunnels`, and `Dead 1 - Save the Phoenix!`.
- The mission title/briefing area is followed by null bytes and a repeated binary header region. Later sections contain resource names, object/unit definitions, positions/parameters, and event/trigger names.
- Resource names observed include mission-specific `.DPC` files and briefing/map `.PCX` files. Mission event names are also stored as readable strings, but the data around them is binary and must be parsed to recover their parameters and links.

This is enough to start a parser at the header, but not enough to safely decode object placement or mission logic. The parser must be validated against multiple missions and cross-referenced with in-game/asset data.

## Terrain files (`.GRY`)

The 11 terrain files in `original-data/gry/` have a shared four-byte prefix in the files that could be read completely:

`27 70 06 03`

The next eight bytes vary as four little-endian 16-bit values. Samples:

| File | Size (bytes) | First four 16-bit values after prefix |
|---|---:|---|
| `Q.gry` | 87,615 | 0x0006, 0x001c, 0x0004, 0x0004 |
| `a2.gry` | 49,142 | 0x000b, 0x0002, 0x0002, 0x0002 |
| `d4.gry` | 411,857 | 0x0018, 0x000c, 0x000e, 0x000d |
| `j1.gry` | 4,082 | 0x0019, 0x0001, 0x0001, 0x0001 |
| `o2.gry` | 71,108 | 0x0004, 0x0004, 0x0004, 0x0004 |
| `o5.gry` | 142,611 | 0x0007, 0x0001, 0x0001, 0x0001 |
| `o7.gry` | 148,294 | 0x0009, 0x0003, 0x0004, 0x0004 |
| `r1.gry` | 77,150 | 0x000f, 0x0001, 0x0001, 0x0001 |
| `r2.gry` | 28,329 | 0x0010, 0x0003, 0x0003, 0x0003 |
| `r6.gry` | 36,962 | 0x0014, 0x0002, 0x0002, 0x0002 |

The table records byte-level observations only; the four values have **not** been assigned semantic meanings yet. `oc.gry` is 2,603,540 bytes in the repository listing, but the current GitHub text-fetch path did not return its binary body, so its header remains unverified here.

## Supporting files

The mission directory also contains human-readable `.txt` briefings and `.PCX` map/briefing images. The briefing catalog in `MISSION-CATALOG.md` records the location and high-level objective from each available overview. Those descriptions help identify which mission is being examined, but do not substitute for actual coordinates and triggers.

## Current tools

Run:

```sh
node tools/inspect-original-data.mjs original-data > original-data-inventory.json
```

The script inventories readable strings and raw headers. It is deliberately described as an inventory tool, not a complete decoder.


## Follow-up: terrain section boundary probe

A byte scan across the readable `.GRY` files found the four-byte sequence `00 A0 B9 B7` at consistent early offsets in 8 of the 10 files whose binary body was returned by the GitHub file tool:

| File | Offset of sequence |
|---|---:|
| `Q.gry` | 92 |
| `a2.gry` | 52 |
| `d4.gry` | 280 |
| `j1.gry` | 32 |
| `o2.gry` | 92 |
| `o5.gry` | 32 |
| `r1.gry` | 32 |
| `r2.gry` | 72 |
| `r6.gry` | 52 |

No match was found in `o7.gry` within the scanned file body. `oc.gry` could not be read through that fetch path, so its contents are unknown here.

Several files have repeating 20-byte blocks between the 12-byte prefix/header and this marker. The blocks contain five little-endian 32-bit values; their meaning has not been established. `d4.gry` has an additional 8 bytes before the marker compared with a simple 20-byte-record count, so a single fixed-count interpretation would be premature.

A probe utility was added at `tools/inspect-gry-structure.mjs`. It reports the header words, marker offsets, candidate 20-byte blocks, and bytes following the marker. This is the next evidence-gathering step toward identifying the subsequent terrain data sections; it is not yet a terrain mesh decoder.
