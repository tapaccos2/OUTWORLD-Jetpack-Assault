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
