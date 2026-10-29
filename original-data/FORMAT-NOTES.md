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


## Follow-up: terrain byte-pattern comparison

A full base64 fetch and byte scan of the ten `.GRY` files whose bodies are accessible found the byte sequence `00 A0 B9 B7` in **all ten**. The first occurrence and total occurrence count differ by file:

| File | First occurrence | Total occurrences |
|---|---:|---:|
| `Q.gry` | 92 | 2 |
| `a2.gry` | 52 | 1 |
| `d4.gry` | 280 | 6 |
| `j1.gry` | 32 | 1 |
| `o2.gry` | 92 | 2 |
| `o5.gry` | 32 | 1 |
| `o7.gry` | 86 | 1 |
| `r1.gry` | 32 | 1 |
| `r2.gry` | 72 | 1 |
| `r6.gry` | 52 | 1 |

This corrects the earlier note that no match was found in `o7.gry`: that earlier scan missed the occurrence at offset 86. The large `oc.gry` file remains unavailable through the current binary-fetch path, so no conclusion is drawn about it.

### What the bytes establish—and what they do not

The bytes beginning at the first occurrence share a substantial identical prefix across the files, including the sequence `00 A0 B9 B7 00 00 00 02 00 02 00 01 00 22 56 00 00 AB 2B 00`. That repeatability is a stronger clue than the marker alone. However, the sequence also appears again later in `Q.gry`, `o2.gry`, and multiple times in `d4.gry`. Therefore, **it must not be treated as a proven one-time section boundary**. It may be a recurring structure or a pattern that occurs inside a data stream; its role is still unknown.

The bytes before the first occurrence vary in length. Some files contain repeated 20-byte candidate blocks in that region, but the `d4.gry` layout does not fit a simple fixed-count interpretation. Their fields remain uninterpreted.

The tool `tools/inspect-gry-structure.mjs` now reports every occurrence, the common header, candidate pre-marker blocks, and how many bytes match from the first occurrence across the supplied files. Run it with:

```sh
node tools/inspect-gry-structure.mjs original-data/gry/*.gry
```

This remains byte-level format investigation—not a terrain decoder. The next useful step is to identify the shared preamble and then validate any proposed fields against file lengths and the terrain/mission resources. No terrain geometry has yet been reconstructed.

### Cross-file signature result

Comparing bytes relative to each file's first `00 A0 B9 B7` occurrence shows that nine files (`Q.gry`, `a2.gry`, `d4.gry`, `j1.gry`, `o2.gry`, `o7.gry`, `r1.gry`, `r2.gry`, and `r6.gry`) have the same following 64-byte sequence. `o5.gry` shares the initial four-byte pattern but diverges at relative byte 7. In the nine-file sequence, the ASCII bytes `66 61 63 74` (`fact`) begin at relative offset 59. They are followed by `04 00 00 00`, which has the shape of a little-endian length value of 4, then a four-byte payload. This is consistent with a tagged field/chunk, but one example is not enough to claim the whole file uses a standard RIFF container.

This makes the first occurrence look more like a shared structured preamble/signature than a random isolated match, but it still does not identify the fields or prove that the marker begins a complete section. The updated inspector now groups files by their 64-byte signature at the first occurrence so the comparison can be repeated locally.


The `fact` tag observation narrows the next test: scan for other printable four-byte tags followed by plausible lengths and check whether their boundaries account for the remaining bytes. The `fact` tag's apparent length is grounded in its actual byte sequence; the overall chunk scheme remains unproven.
