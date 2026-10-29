# GRY terrain structure index

This index summarizes byte-level observations from the ten `.GRY` files whose binary bodies could be read. The 2,603,540-byte `oc.gry` is present in the repository, but the available GitHub binary-fetch path returned no body for it; its format is not inferred here.

| File | Bytes | Header U16 values (offsets 4, 6, 8, 10) | First signature start | Signature count | Bytes between header and signature | Candidate 20-byte units | Candidate 14-byte units | `fact` candidates | Signature → `fact` pairs |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| `Q.gry` | 87,615 | 28, 4, 4, 4 | 92 | 4 | 80 | 4 | 0 | 4 | 4 |
| `a2.gry` | 49,142 | 11, 2, 2, 2 | 52 | 2 | 40 | 0 | 0 | 2 | 2 |
| `d4.gry` | 411,857 | 24, 12, 14, 13 | 280 | 13 | 268 | 12 | 2 | 13 | 13 |
| `j1.gry` | 4,082 | 25, 1, 1, 1 | 32 | 1 | 20 | 0 | 1 | 1 | 1 |
| `o2.gry` | 71,108 | 4, 4, 4, 4 | 92 | 4 | 80 | 0 | 0 | 4 | 4 |
| `o5.gry` | 142,611 | 7, 1, 1, 1 | 32 | 1 | 20 | 0 | 0 | 0 | 0 |
| `o7.gry` | 148,294 | 9, 3, 4, 4 | 86 | 4 | 74 | 3 | 1 | 4 | 4 |
| `r1.gry` | 77,150 | 15, 1, 1, 1 | 32 | 1 | 20 | 0 | 1 | 1 | 1 |
| `r2.gry` | 28,329 | 16, 3, 3, 3 | 72 | 3 | 60 | 0 | 0 | 3 | 3 |
| `r6.gry` | 36,962 | 20, 2, 2, 2 | 52 | 2 | 40 | 0 | 0 | 2 | 2 |

## Confirmed relationships

- All ten readable files begin with `27 70 06 03`.
- The recurring signature is not the fixed four-byte sequence `00 A0 B9 B7`. The invariant is the three-byte suffix `A0 B9 B7` with a variable leading byte: `?? A0 B9 B7`.
- There are 35 signature starts across the ten files. Thirty-four are exactly 59 bytes before a `fact` tag followed by the little-endian length `04 00 00 00`; `o5.gry` has one signature start with no matching `fact` candidate.
- The two bytes at signature-relative offsets `+4..+5` look like sequential indices in the paired records; `+6..+7` are consistently `00 02`. Their meanings and byte order are not yet confirmed.
- The first signature offset fits this exact byte-count formula in all ten files: `(header value 2 × 20) + ((header value 3 − header value 2) × 14)`, measured after the 12-byte header.

## Interpretation limits

The 20-byte and 14-byte units are candidate fixed-width blocks inferred from exact byte counts, not semantically decoded records. The `fact` payload and remaining terrain data have not yet been mapped to vertices, heights, faces, materials, or coordinates. Do not use this index as a geometry decoder.

## Tools

Run both inspectors from the repository root:

```sh
node tools/inspect-gry-structure.mjs original-data/gry/*.gry
node tools/scan-gry-tags.mjs original-data/gry/*.gry
```

Detailed evidence and limitations are maintained in `FORMAT-NOTES.md`.
