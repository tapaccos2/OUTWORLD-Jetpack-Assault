# Scout autodiscovery findings 01 — callback-entry relationships

**Source run:** 2026-10-31 16:11:23 UTC  
**Input:** `scout_mj.dpc`, extracted from `original-data/units.ff`  
**DPC size:** 37,792 bytes  
**Relocation base:** `0x80019C40`

This note interprets the uploaded `DISCOVERY-REPORT.md` and `discovery-report.json`. It separates findings supported by exact record references from exploratory byte-pattern scores.

## Confirmed structural inventory

- 16 structurally valid opcode-5 transform records.
- Four transform roots: `0x7838`, `0x8AC8`, `0x8FCC`, and `0x9300`.
- 12 opcode-5-to-opcode-5 edges.
- The `0x9300` root has an 11-transform connected hierarchy.
- 11 opcode-2 descriptor lists are direct transform children; four additional opcode-2 lists were found in the recursive callback traversal.
- Those 15 lists contain 21 descriptor slots.
- Ten distinct opcode-4 payload roots are referenced directly by the 11 transform-child descriptor lists.
- Recursive traversal identified 32 opcode-4/class-`0x090C` records in total.

The 11-transform subtree rooted at `0x9300` contains these transform records:

```
0x9300
└── 0x92B0
    ├── 0x8640
    │   ├── 0x78F8
    │   │   └── 0x78BC
    │   └── 0x8604
    │       └── 0x85C0
    │           └── 0x8330
    │               └── 0x81E0
    ├── 0x8B4C
    └── 0x9050
```

The `0x8B4C`, `0x9050`, and `0x92B0` nodes also carry opcode-2 attachment children. This is the largest coherent transform hierarchy found in the DPC; the other three roots form separate smaller branches.

## Strong new finding: opcode-4 entries contain real callback references

The broad scan tried four possible interpretations of opcode-4 child DWORDs. A stronger test is to require the target to land exactly on a record independently validated as opcode 2, opcode 4, or opcode 5.

That strict check found **86 exact callback-record references** under the DPC relocation-base interpretation:

| Target record kind | Exact references |
|---|---:|
| Opcode-2 descriptor lists | 21 |
| Opcode-4 child lists | 40 |
| Opcode-5 transforms | 25 |
| **Total** | **86** |

The alternative interpretations were much weaker:

| Address interpretation | Exact known-record references |
|---|---:|
| Relocated DPC base | **86** |
| Absolute file offset | 0 |
| Signed relative to field | 10 |
| Signed relative to next DWORD | 16 |

The relative interpretations do produce a small number of exact hits and should remain recorded as alternatives, but the relocated-base interpretation is the only one that links all three validated callback kinds and produces the largest coherent graph.

Using relocated-base links only, 24 of the 32 discovered opcode-4 records are reachable from the ten descriptor-rooted opcode-4 payloads. This shows that many opcode-4 entries are not arbitrary numeric data: specific entries are pointers to the same callback records already identified elsewhere in the DPC.

### Examples of exact links

- Opcode-4 record `0x91CC` points to transform records `0x8640`, `0x8B4C`, `0x9050`, `0x92B0`, and `0x9300), as well as opcode-2 lists `0x9188` and `0x9298`.
- Opcode-4 record `0x84AC` points to transforms `0x8330`, `0x85C0`, `0x78F8`, and `0x8604`; it also points to opcode-2 lists `0x8468` and `0x85A8), and opcode-4 record `0x86B4`.
- Opcode-4 record `0x899C` links the `0x8AC8` branch and its attachment records. Opcode-4 record `0x8EA0` has a corresponding link pattern for the `0x8FCC` branch.
- Opcode-4 records `0x91CC` and `0x914C` both contain pointer slots to the main `0x9300` transform branch, at different entry indices.

These repeated link patterns are more useful than interpreting every DWORD in each opcode-4 array as a pointer. The next investigation should preserve each entry's index and classify it by what it actually resolves to.

## What the coordinate and index scans did not prove

The run tested 189,224 candidate coordinate layouts and 44,335 candidate index streams. Those are broad byte-pattern tests, not format validation.

The coordinate score mainly rewards unique samples and non-zero spatial extents. That is why many unrelated offsets score 99/100. The top index candidates are mostly one-byte streams with high values and degenerate triples; they are not credible evidence of a triangle index buffer.

Do not use those high coordinate scores to select vertex starts or strides. The next pass must test candidate data against structural constraints: descriptor target identity, stable record boundaries, the known 8-byte coordinate entries in the legacy shared pool, valid index ranges, and coherent topology.

## Transform score limitation

The Q20.12 matrix interpretation is consistent with the stored values: the matrices are close to rigid rotations. However, the 99.6/100 rigidity score does **not** choose matrix order, transpose, or position scale. Those choices leave the rotation matrices orthonormal in these tests. The root `0x9300` also contains an axis-basis transform; it should be kept as a root-level matrix rather than discarded.

## Existing geometry control

The raw geometry exporter completed successfully:

- 9 mesh sections.
- 390 referenced vertices.
- 230 triangles.

This remains the source geometry control, not an assembled Scout.

## Next work — now evidence-led

1. Use the strict relocated-pointer callback graph as the authoritative callback-link graph. Keep non-relocated interpretations in a separate candidate list.
2. Decode the opcode-4 entry arrays as mixed records: retain entry positions, identify the 86 exact callback pointers, and characterize the remaining DWORD values by recurring byte patterns and executable use.
3. Trace the opcode-2 descriptor `+4` payload targets (including `0x1180`, `0x1200`, `0x1390`, `0x1410`, `0x1430`, `0x1580`, `0x1760`, `0x0CD8`, and `0x0D38`) against the actual DPC bytes and the eight legacy geometry sections.
4. Establish which of those descriptor payloads are renderable geometry and which are callback/control data.
5. Only then build the assembled GLB from the proven payload-to-transform mapping.

**Conclusion:** This run has moved the investigation forward. It has exposed a substantial callback relationship graph linking opcode-4 lists, opcode-2 attachments, and opcode-5 transforms. It has not yet identified the final renderable leaf payloads or produced a recognisable assembled Scout. The remaining work is now concentrated on the opcode-4 mixed-entry layout and the descriptor `+4` payloads, not on indiscriminately scanning more coordinates.
