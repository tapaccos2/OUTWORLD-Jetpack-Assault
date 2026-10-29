# GRY terrain structure index

This index summarizes byte-level observations from the ten `.GRY` files whose binary bodies could be read. The 2,603,540-byte `oc.gry` is present in the repository, but the available GitHub binary-fetch path returned no body for it; its format is not inferred here.

| File | Bytes | Header U16 values (offsets 4, 6, 8, 10) | First marker offset | Marker count | Bytes between header and marker | Candidate 20-byte units | Candidate 14-byte units | `fact` candidates | Marker → `fact` pairs |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| `Q.gry` | 87,615 | 28, 4, 4, 4 | 92 | 2 | 80 | 4 | 0 | 4 | 2 |
| `a2.gry` | 49,142 | 11, 2, 2, 2 | 52 | 1 | 40 | 2 | 0 | 2 | 1 |
| `d4.gry` | 411,857 | 24, 12, 14, 13 | 280 | 6 | 268 | 12 | 2 | 13 | 6 |
| `j1.gry` | 4,082 | 25, 1, 1, 1 | 32 | 1 | 20 | 0 | 1 | 1 | 1 |
| `o2.gry` | 71,108 | 4, 4, 4, 4 | 92 | 2 | 80 | 4 | 0 | 4 | 2 |
| `o5.gry` | 142,611 | 7, 1, 1, 1 | 32 | 1 | 20 | 1 | 0 | 0 | 0 |
| `o7.gry` | 148,294 | 9, 3, 4, 4 | 86 | 1 | 74 | 3 | 1 | 4 | 1 |
| `r1.gry` | 77,150 | 15, 1, 1, 1 | 32 | 1 | 20 | 0 | 1 | 1 | 1 |
| `r2.gry` | 28,329 | 16, 3, 3, 3 | 72 | 1 | 60 | 3 | 0 | 3 | 1 |
| `r6.gry` | 36,962 | 20, 2, 2, 2 | 52 | 1 | 40 | 0 | 2 | 1 | 1 |

## Confirmed relationships

- All ten readable files begin with `27 70 06 03`.
- In all ten files, the bytes before the first marker fit the exact formula: `(header value 2 × 20) + ((header value 3 − header value 2) × 14)`.
- Sixteen marker occurrences across nine files are exactly 59 bytes before a `fact` tag followed by the length `04 00 00 00`. `o5.gry` is the exception: it has a marker but no matching `fact` candidate and has a different marker-adjacent signature.
- Nine files share the same 64-byte sequence starting at the first marker; `o5.gry` diverges at relative byte 7.
- The `fact` tag appears 34 times across the ten files, always with a candidate length of 4 in the current scan.

## Interpretation limits

The 20-byte and 14-byte units are candidate fixed-width records inferred from exact byte counts, not semantically decoded records. The marker, `fact` payload, and remaining terrain data have not yet been mapped to vertices, heights, faces, materials, or coordinates. Do not use this index as a geometry decoder.

## Tools

Run both inspectors from the repository root:

```sh
node tools/inspect-gry-structure.mjs original-data/gry/*.gry
node tools/scan-gry-tags.mjs original-data/gry/*.gry
```

Detailed evidence and the evolving hypotheses are maintained in `FORMAT-NOTES.md`.
