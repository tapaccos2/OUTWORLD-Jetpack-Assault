# Terrain record field hypotheses

This document records a new, testable interpretation of the GPC/RPC record fields. It is a hypothesis from byte-level cross-file comparison, not a complete terrain decoder.

## New lead: RPC corner-value quartet and XY pair

In the 40-byte RPC record, the four 32-bit little-endian fields at record-relative offsets 16, 20, 24 and 28 each contain a signed integer whose observed magnitude fits a plausible terrain scalar. In the same record, the 32-bit signed integers at offsets 32 and 36 form a pair of spatial-looking coordinates. The quartet varies independently in many records and often repeats one value in all four positions.

That pattern is consistent with a four-corner surface/ramp record: four corner elevations (or another per-corner scalar) plus an XY position. The meaning and units are not yet proven. In particular, these must not yet be described in application code as confirmed vertex heights.

Selected observed ranges from current RPC files:

| File | Records | Offset 16 | Offset 20 | Offset 24 | Offset 28 | All four equal |
|---|---:|---:|---:|---:|---:|---:|
| anub01.rpc | 203 | 13,284–18,048 | 13,440–18,048 | 13,284–18,048 | 13,284–18,048 | 186 |
| anub02.rpc | 273 | 33,056–44,242 | 33,068–44,220 | 33,056–44,283 | 33,068–44,242 | 155 |
| rag01.rpc | 767 | -1,918–7,232 | -1,918–7,232 | -1,918–7,232 | -1,918–7,232 | 221 |
| rag02.rpc | 988 | 24,800–41,600 | 24,800–41,600 | 24,800–41,600 | 24,800–41,600 | 631 |
| oasis01.rpc | 305 | 480–16,160 | 480–16,160 | 160–16,160 | 480–16,160 | 103 |
| mik01.rpc | 543 | 0–5,728 | 0–5,728 | -1,987–11,200 | 0–11,200 | 79 |

The coordinate pair at offsets 32 and 36 varies over a wider signed range and frequently repeats between neighbouring records. The paired GPC record has two leading signed 32-bit fields that also look spatial. This is compatible with group records organizing collections of ramp/surface records, but exact geometric relationships need more testing.

## What has been validated separately

- The RPC and GPC file headers and record lengths match the executable's 20-byte-header / 40-byte-ramp-record and 20-byte-header / 32-byte-group-record expectations.
- In five paired campaigns, the two 16-bit fields at GPC record offsets 24 and 26 partition the paired RPC table into contiguous, non-overlapping inclusive ranges covering every RPC record.
- This gives a reliable parent-group-to-ramp-record link, but it does not by itself prove the semantic meaning of the fields.

## Next tests needed before implementing a mesh

1. Determine whether the four RPC corner values correspond to four ordered corners, and establish their order and vertical scale.
2. Determine whether offsets 32 and 36 are XY coordinates, an anchor point, or another spatial pair; test against GPC fields without assuming group centers.
3. Check whether the leading RPC fields encode ramp type, dimensions, material, flags, or topology.
4. Render a diagnostic plot of the inferred surfaces for at least two maps and compare the outline and elevations against available in-game screenshots/map references.
5. Only after those tests pass, implement a mesh exporter and document any remaining assumptions.

## Important limitation

No original terrain mesh has yet been reconstructed or visually validated. These field interpretations are deliberately marked as hypotheses so a provisional pattern is not mistaken for a confirmed format specification.

## Stronger cross-file validation: group bounds contain ramp coordinates

A follow-up test compared each GPC record's first five signed 32-bit fields with the RPC coordinates in its indexed range. Interpreting GPC offsets 0 and 4 as a 2D origin, offsets 12 and 16 as positive X/Y spans, and RPC offsets 32 and 36 as 2D positions, every RPC coordinate in a group falls inside the corresponding GPC rectangle for:

| Pair | GPC groups | Groups whose full RPC coordinate bounds fit |
|---|---:|---:|
| anub01 | 28 | 28 |
| anub02 | 22 | 22 |
| rag01 | 50 | 45 |
| rag02 | 106 | 96 |
| oasis01 | 11 | 11 |
| oasis02 | 8 | 8 |
| mik01 | 29 | 27 |

The handful of failures are close to the rectangle edge in most checked cases, which may reflect edge conventions, field interpretation, or a few special records; they are not silently treated as fits. This is strong evidence that the RPC pair at offsets 32/36 represents planar coordinates and that GPC offsets 0/4/12/16 describe a containing region or dimensions. It is still an inference from internal consistency rather than a comparison against a decoded mesh.

A second consistency check found that the signed 32-bit value at GPC offset 8 appears at least once among the four RPC corner values in every group across all seven pairs above (266 groups total). In many groups, every corner value equals this GPC value. This supports interpreting GPC offset 8 as a reference/base elevation and RPC offsets 16/20/24/28 as four corner elevations, though their precise corner ordering and vertical scale remain unknown.

The combined evidence is materially stronger than the earlier value-distribution observation: GPC records appear to describe a spatial region and reference elevation, while each indexed RPC record appears to describe a positioned surface with four corner values. The next step is to establish corner order, edge conventions, and scale, then compare a generated diagnostic mesh with an original map reference before calling this a decoder.

Across the same 254 groups, the GPC reference value matches at least one indexed RPC corner-like value in all 254 groups; all corner-like values in the entire indexed range equal that reference value in 81 groups. This is a stronger, reproducible distinction than counting individual RPC records with four equal values: it tests the GPC value against the whole group it indexes.

## Duplicate-position test supports four-corner values and a grid ordering

A useful test case is `oasis01.rpc`, where multiple records share the exact same final coordinate pair but have different four-value patterns. At position `(4608, 18432)`, the records include:

- `[800, 800, 800, 800]` — flat surface;
- `[800, 800, 480, 480]` — one pair of corners high and the other pair low;
- `[800, 480, 800, 480]` — the alternating pair pattern for the other axis.

The same pattern occurs at `(1024, 32768)`. These examples are consistent with four ordered grid corners stored in row-major order, with the two pairs representing opposite sides of a surface. This is stronger evidence for a per-corner elevation interpretation than value ranges alone. The axis direction and exact corner order are still provisional, because the record's leading 16 bytes likely carry surface/type/texture or orientation information that has not yet been decoded.

Duplicate-position statistics also show that repeated XY positions often have different corner values, especially in `oasis01` (79 of 80 duplicate positions) and `mik01` (140 of 153). This suggests the records at a position can describe distinct surface pieces or orientations rather than one unique point record. It is another reason not to build a mesh by blindly treating each RPC record as a unique vertex.

## Full inventory check across all 34 paired resource sets

The spatial-field consistency test was extended from the original seven samples to all 34 campaign/multiplayer GPC/RPC pairs present in the repository. All 34 pairs pass the contiguous, in-bounds GPC-to-RPC range partition check. Together they contain 749 GPC groups; the inferred origin/span rectangles contain every indexed RPC position in 717 groups (95.7%). The 32 non-fitting groups are concentrated in rag01 (5), rag02 (10), mik01 (2), anub03 (1), anub2m (2), anub3m (1), mik1m (2), and rag2m (9). The other 26 pairs have all groups fitting the inferred rectangles.

The GPC reference value also appears among the indexed RPC corner-like values in every group across all 34 pairs. This is a broad cross-file consistency result, not a proof of units or topology. It significantly strengthens the spatial interpretation because it holds across single-player and multiplayer resources, including tiny/mostly-flat maps, not just the initial Ragnarok and Anubis examples.

## Executable cross-check: a native record setter writes the corner fields

The local original executable (`outwars.exe`, PE32, image base `0x00400000`) provides a direct code-level cross-check. At virtual address `0x00477030`, a routine computes a 40-byte record stride (`index * 40`) and writes into that record:

- a 32-bit position from the input structure into RPC offsets `+32` and `+36`;
- one signed value into both 32-bit fields at RPC offsets `+16` and `+20`;
- another sign-extended value into both 32-bit fields at RPC offsets `+24` and `+28`.

The stores are visible in the disassembly at `0x0047706d`–`0x00477095`. This confirms that the four 32-bit fields are treated as two pairs of surface-height values, and that the final two 32-bit fields are position components. It also matches the repeated `[a,a,b,b]` patterns found in sloped surfaces. The setter alone does not establish the coordinate axis convention, vertical units, or the orientation represented by each pair.

The native file loader around `0x004EC990` validates the CPMG/CPMR magic, version `0x43`, and the 200/1000 record limits, then copies the fixed payload sizes (`0x1900` bytes for 200 × 32-byte GPC records and `0x9c40` bytes for 1000 × 40-byte RPC records). It does not interpret individual records in that routine. This separates the already-confirmed file-container parser from the record-field semantics inferred from other code paths.

The setter's pairwise stores plus the real data patterns also make a row-major corner order the leading candidate: `[corner00, corner01, corner10, corner11]`. Under that order, both observed patterns `[a,a,b,b]` and `[a,b,a,b]` represent the two straightforward axis-aligned slope directions. In `oasis01.rpc`, 104 records have the first pattern (excluding fully flat records), and 74 have the second; 103 are fully flat. This is a plausible corner order, not yet a confirmed rendering convention, because the native routine shown above writes only paired heights and does not reveal how the renderer maps them to world axes.

## Orientation vector confirmed by executable trigonometry

The first 16 bytes are not just an opaque block: the 16-bit signed values at RPC offsets `+6` and `+8` are a fixed-point orientation vector. In the native setter at `0x00477030`, the executable calls its sine lookup at `0x004C51C4` and cosine lookup at `0x004C5230`, then stores their 16-bit results at exactly `+6` and `+8`.

This code-level interpretation also matches every shipped RPC record checked: across all 34 RPC files and **8,005 records**, the magnitude `sqrt(sin² + cos²)` for the signed 16-bit pair at offsets `+6/+8` lies within 2 units of 4095. The observed minimum is 4094.34 and maximum is 4096.62. That near-constant magnitude is decisive confirmation that these fields are the fixed-point sine/cosine components of a direction/rotation, rather than arbitrary texture coordinates. The checker now reports this test automatically.

The angle itself, the meaning of fields at offsets `+0`, `+2`, `+4`, `+10`, `+12`, and `+14`, and how the orientation vector transforms the four corners are still unresolved. This is the next useful target for disassembly: follow the code that consumes the orientation pair to see how it derives the four surface positions.
