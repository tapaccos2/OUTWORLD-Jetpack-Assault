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


## Follow-up: terrain signature and tagged-record analysis

A broader scan corrected the earlier interpretation of `00 A0 B9 B7` as a fixed four-byte marker. The invariant is the **three-byte suffix `A0 B9 B7`**, preceded by a variable byte. Treating the preceding byte as part of the signature gives a record-start pattern `?? A0 B9 B7`.

### Record-start and `fact` correlation

Across the ten readable terrain files, the scanner found 35 starts of the `?? A0 B9 B7` pattern. Thirty-four of those are followed exactly 59 bytes later by ASCII `fact`, then the four-byte little-endian length `04 00 00 00`, then a four-byte payload. The single exception is `o5.gry`: its pattern at offset 32 has no matching `fact` tag.

| File | Signature-start offsets | Signature count | `fact`/length-4 count | Paired records |
|---|---|---:|---:|---:|
| `Q.gry` | 92, 26108, 42154, 60528 | 4 | 4 | 4 |
| `a2.gry` | 52, 16484 | 2 | 2 | 2 |
| `d4.gry` | 280, 26032, 54088, 74537, 84101, 113985, 136517, 166997, 170977, 176203, 193175, 267511, 403297 | 13 | 13 | 13 |
| `j1.gry` | 32 | 1 | 1 | 1 |
| `o2.gry` | 92, 24362, 31475, 59201 | 4 | 4 | 4 |
| `o5.gry` | 32 | 1 | 0 | 0 |
| `o7.gry` | 86, 11502, 22232, 84932 | 4 | 4 | 4 |
| `r1.gry` | 32 | 1 | 1 | 1 |
| `r2.gry` | 72, 5298, 24900 | 3 | 3 | 3 |
| `r6.gry` | 52, 11477 | 2 | 2 | 2 |

All 34 `fact` candidates are paired with the variable-leading-byte signature at `factOffset - 59`. This is much stronger than the earlier exact-byte scan, which missed entries whose leading byte was not `00`.

### The indexed record fields

At each paired record start, the bytes after the variable-leading-byte signature include a two-byte sequence that increments from 0, followed by the constant bytes `00 02`. For example, the first four records in `Q.gry` show `00 00 00 02`, `00 01 00 02`, `00 02 00 02`, and `00 03 00 02` at relative offsets `+4..+7`. `d4.gry` increments through index 12. This suggests these are indexed records, although the index's exact byte order and the meaning of the constant `2` have not been proven.

Relative to each record start:

| Relative offset | Observed content | Interpretation status |
|---:|---|---|
| `+0` | Variable byte | Unknown field; do not treat as a fixed magic byte |
| `+1..+3` | `A0 B9 B7` | Stable three-byte signature suffix |
| `+4..+5` | Two bytes encoding a sequential-looking index | Likely record index; byte order unconfirmed |
| `+6..+7` | `00 02` | Constant in the paired records; meaning unknown |
| `+8..+58` | Repeated binary structure | Field boundaries and meanings unknown |
| `+59..+62` | ASCII `fact` | Repeated tag |
| `+63..+66` | `04 00 00 00` | Little-endian length value 4 |
| `+67..+70` | Four variable bytes | Payload meaning unknown |

The `fact` count matches the third header value in eight files, is one lower in `d4.gry`, and is zero in `o5.gry` despite that file's third header value being one. This is a useful correlation, not yet a complete rule; `d4.gry` and `o5.gry` appear to be variants or exceptions.

### Header region before the first signature

The first signature begins after a 12-byte header and a region whose byte count matches this formula in all ten readable files:

`bytes before signature after the 12-byte header = (header value 2 × 20) + ((header value 3 − header value 2) × 14)`

Seven files have equal second and third header values, so the 14-byte contribution is zero. `o7.gry` has values 3 and 4, giving `3 × 20 + 1 × 14 = 74` bytes. `d4.gry` has values 12 and 14, giving `12 × 20 + 2 × 14 = 268` bytes. The inspector now emits the candidate 20-byte and 14-byte blocks separately, both as raw bytes and as little-endian 16-bit/32-bit values. Their semantic fields remain unknown.

### Tools and limits

Run both scanners from the repository root:

```sh
node tools/inspect-gry-structure.mjs original-data/gry/*.gry
node tools/scan-gry-tags.mjs original-data/gry/*.gry
```

The per-file measurements are summarized in `original-data/GRY-STRUCTURE-INDEX.md`. The 2,603,540-byte `oc.gry` is present in the repository, but its binary body could not be retrieved through the current GitHub file-fetch path; no claims are made about its internal structure.

This is still format analysis, not a terrain decoder. No vertices, heights, triangles, materials, or coordinates have been reconstructed. The next step is to determine the meaning of the indexed record fields and validate the post-`fact` payloads against the remaining data.

### Compressed-block framing

The bytes after each paired `fact` record reveal a second, highly consistent structure:

- At record-relative offset `+71`: `2E 3E 9D 00`.
- At `+75..+77`: a three-byte little-endian compressed-payload length.
- At `+78`: the compressed payload begins.
- The four-byte value following `fact` behaves like an uncompressed-length field: across the 34 blocks it is consistently about 1.97 times the compressed payload length.
- For every non-final block, `recordStart + 78 + compressedLength` lands exactly on the next record start.
- The final five bytes of all ten readable `.GRY` files end in `22 75 28 03`, with a variable first trailer byte. The final compressed payload ends exactly five bytes before EOF.

Examples:

| File / record start | Candidate uncompressed length | Compressed length | Payload start | Payload end / next boundary | Ratio |
|---|---:|---:|---:|---:|---:|
| `Q.gry` / 92 | 51,264 | 25,938 | 170 | 26,108 | 1.9764 |
| `d4.gry` / 280 | 50,736 | 25,674 | 358 | 26,032 | 1.9762 |
| `d4.gry` / 403,297 (final) | 16,751 | 8,477 | 403,375 | 411,852, then 5-byte trailer | 1.9761 |

The boundaries and size relationships are now strong enough to treat the framing as established for these 34 records. The interpretation of the `fact` value as uncompressed length is still a hypothesis until a decompressor produces exactly that many bytes. The compression algorithm itself has not been identified.

The new `tools/inspect-gry-blocks.mjs` script reports record indices, candidate uncompressed lengths, compressed sizes, payload offsets, boundary validation, and trailer bytes:

```sh
node tools/inspect-gry-blocks.mjs original-data/gry/*.gry
```

`o5.gry` has the common five-byte file trailer and one signature start but no paired `fact`/compressed block, so it is a format variant or an unresolved special case.

Boundary validation against the ten available files confirms all **34 of 34** compressed-size fields end at the next record boundary, or exactly five bytes before EOF for the final record. All ten files share the final four-byte suffix `22 75 28 03` with a variable leading trailer byte. This validates the framing independently of the compression algorithm; it does not yet validate the `fact` value as an uncompressed length.
