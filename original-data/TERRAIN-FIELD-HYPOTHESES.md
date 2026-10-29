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
