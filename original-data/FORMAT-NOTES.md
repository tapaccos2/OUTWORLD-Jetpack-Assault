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

### Candidate four-byte tags

A second scan searched for four alphabetic ASCII bytes followed by a little-endian 32-bit value that would fit as a payload length. It found only the candidate tag `fact` in the accessible terrain files:

| File | `fact` candidates |
|---|---:|
| `Q.gry` | 4 |
| `a2.gry` | 2 |
| `d4.gry` | 13 |
| `j1.gry` | 1 |
| `o2.gry` | 4 |
| `o5.gry` | 0 |
| `o7.gry` | 4 |
| `r1.gry` | 1 |
| `r2.gry` | 3 |
| `r6.gry` | 2 |

Every candidate has a length value of 4 and a four-byte payload that fits inside its file. The repeated tag and repeated length make a deliberate field/chunk interpretation plausible, but the scan only filters for candidate shapes; it does not prove the fields are chunks or explain why `o5.gry` differs. The scanner is available at `tools/scan-gry-tags.mjs`:

```sh
node tools/scan-gry-tags.mjs original-data/gry/*.gry
```

At this point the useful lead is not simply the `00 A0 B9 B7` sequence: it is the combination of a shared terrain preamble, repeated `fact`/length-4 candidates, and different patterns in `o5.gry`. The next validation should determine whether these candidate offsets form a consistent record sequence and whether the four-byte payload values correlate with the terrain header values or file lengths.

### Correlation between the marker and `fact`

A cross-offset check produced a stronger relationship: **every one of the 16 `00 A0 B9 B7` occurrences in nine terrain files is exactly 59 bytes before a `fact` tag whose following length value is 4**. The pairings are present in `Q.gry` (2), `a2.gry` (1), `d4.gry` (6), `j1.gry` (1), `o2.gry` (2), `o7.gry` (1), `r1.gry` (1), `r2.gry` (1), and `r6.gry` (1). `o5.gry` has one marker occurrence but no candidate `fact` tag and its 64-byte signature differs from the other files.

This is now a repeatable structural relationship, not just a shared byte sequence. It suggests the marker begins a 59-byte structure that ends at a `fact`/length-4 field. The exact meanings of those 59 bytes and the four-byte payload are still unknown, so the parser does not assign semantics yet. The tag scanner now reports marker offsets and matching marker-to-tag pairs explicitly.

### Provisional byte layout around the paired marker/tag

For the nine files with the common signature, the repeated region can be described by offsets relative to the `00 A0 B9 B7` marker:

| Relative offset | Observed bytes / value | Status |
|---:|---|---|
| `+0..+3` | `00 A0 B9 B7` | Repeated marker; meaning unknown |
| `+4..+7` | `00 00 00 02` | Constant in the nine-file variant; changes to `00 00 00 01` in `o5.gry` |
| `+8..+11` | `00 02 00 01` | Constant in the nine-file variant; differs in `o5.gry` |
| `+12..+58` | Shared binary values | Field boundaries and meanings unknown |
| `+59..+62` | ASCII `fact` | Repeated tag at the same relative position |
| `+63..+66` | `04 00 00 00` | Little-endian integer 4, consistent with a four-byte payload length |
| `+67..+70` | Four variable bytes | Payload meaning unknown |

This is an offset map, not a semantic schema. In particular, the four-byte payload is not yet established as a size, checksum, coordinate, or float. The next stage must explain how the post-payload bytes are organized and validate any candidate interpretation against multiple terrain files.

### Header count versus pre-marker records

In seven files, the second little-endian 16-bit header value multiplied by 20 exactly equals the number of bytes between the 12-byte header and the first marker. That is consistent with—but does not prove—a count of 20-byte records. Two files are exceptions: `o7.gry` has 14 additional bytes beyond that calculation, and `d4.gry` has 28 additional bytes. The relationship is:

| File | Second header value | Bytes before first marker (after byte 12) | Value × 20 | Difference |
|---|---:|---:|---:|---:|
| `Q.gry` | 4 | 80 | 80 | 0 |
| `a2.gry` | 2 | 40 | 40 | 0 |
| `d4.gry` | 12 | 268 | 240 | 28 |
| `j1.gry` | 1 | 20 | 20 | 0 |
| `o2.gry` | 4 | 80 | 80 | 0 |
| `o5.gry` | 1 | 20 | 20 | 0 |
| `o7.gry` | 3 | 74 | 60 | 14 |
| `r1.gry` | 1 | 20 | 20 | 0 |
| `r2.gry` | 3 | 60 | 60 | 0 |
| `r6.gry` | 2 | 40 | 40 | 0 |

The terrain inspector now prints this comparison alongside the raw candidate blocks. The mismatches in `d4.gry` and `o7.gry` are why the code deliberately avoids treating the header value as a confirmed record count.
