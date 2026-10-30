# DPC scene-record graph comparison

**Checked:** 2026-10-29  
**Status:** structural relationships observed; record semantics still unresolved.

## Scope and method

The nested pointer-graph inspector was run over six campaign/map DPC resources: `rag01.dpc`, `rag02.dpc`, `rag04.dpc`, `anub01.dpc`, `dead01.dpc`, and `oasis01.dpc`.

The inspector validates the top-level `DCPMC` header, relocation base, record pointer table, and nested pointer targets. It follows the observed kind-1 pointer array layout. Kind-4 traversal remains tentative: the count candidate is read at record offset `+18` and pointers from `+20`. A traversal depth limit is used to avoid treating every binary field as a pointer. Numeric type/class IDs are preserved without guessing their names.

## Comparison results

| DPC resource | Top-level records | Distinct reachable nodes | Pointer edges | Invalid pointers | Truncated |
|---|---:|---:|---:|---:|---|
| `rag01.dpc` | 6 | 119 | 114 | 0 | No |
| `rag02.dpc` | 6 | 189 | 183 | 0 | No |
| `rag04.dpc` | 5 | 189 | 207 | 0 | No |
| `anub01.dpc` | 5 | 168 | 377 | 0 | No |
| `dead01.dpc` | 5 | 121 | 116 | 0 | No |
| `oasis01.dpc` | 7 | 154 | 147 | 0 | No |

The automated browser smoke-test workflow runs the graph walker and the six-file comparison. All six files completed without an out-of-bounds pointer or depth/node-limit failure. Edge counts include multiple distinct pointer fields that may point to the same target.

## Map-specific type-13 record classes

The following type-13 class IDs were reachable in the inspected maps:

| DPC resource | Type-13 classes observed (count) |
|---|---|
| `rag01.dpc` | 5709 (1) |
| `rag02.dpc` | 5703 (1), 5709 (8) |
| `rag04.dpc` | 5601 (1), 7011 (13), 7017 (1) |
| `anub01.dpc` | None reached by this traversal |
| `dead01.dpc` | 7011 (14) |
| `oasis01.dpc` | 5601 (1), 5700 (9), 5709 (3) |

In the maps where they occur, these records are linked beneath a type-1/class-6 record. This is a useful structural lead because the class IDs vary by map, while other type/class combinations recur across campaigns. **This does not yet prove that type-13 records are ground, ramps, or terrain meshes.** Their exact fields and runtime use still need verification against the executable.

The graph also repeatedly contains type-0 records with class IDs such as 2000, 2001, 2002, 2019, 2100, 2200, 2210, 2220, 3010–3015, 3030–3031, 3040, 3042, 3050, 3071, 3091, and 4020–4035. These are recorded as recurring numeric IDs only; their meanings have not been inferred.

## What this establishes—and what it does not

- The six map DPC files contain structured, traversable pointer relationships rather than only flat opaque byte blobs.
- Several maps include a type-1/class-6 node linked to map-specific type-13 records, making those type-13 classes a concrete target for further investigation.
- The output is a pointer-graph inventory, **not** a scene decoder. It does not recover transforms, mesh vertices, materials, texture references, mission placements, or broad ground.
- Kind-4 pointer traversal is provisional until confirmed by a matching executable read site.

## Next investigation

1. Inspect the type-13 class 5700/5703/5601/5709/7011/7017 payloads across maps and match their field access patterns to executable code.
2. Check whether those records refer to `.TPC` texture data or geometry data, without assigning meaning from class IDs alone.
3. Keep the GPC/RPC terrain-surface mesh separate from the DPC scene graph until their spatial relationship is established.


## New pointer-chain finding: type-13 to type-9/class-7012

A direct byte-level follow-up on the reachable type-13 records found a repeatable relocated pointer at record-relative offset `+8`:

- In `rag04.dpc`, the type-13/class-7011 records at offsets 882,856 through 884,344 (124-byte spacing) all contain `0x80097e64` at `+8`. Subtracting the DPC relocation base `0x80019c40` resolves to file offset 516,644, which begins a type-9/class-7012 record.
- In `dead01.dpc`, the type-13/class-7011 records at offsets 608,508 through 610,120 (124-byte spacing) all contain `0x80061aac` at `+8`. With the same relocation base, this resolves to file offset 294,508, also a type-9/class-7012 record.
- Both target records have the same observed header pattern: type 9, flags 5, class 7012, a 16-bit value of 7 at `+6`, and seven relocated pointers beginning at `+16`.
- All seven pointers in each sample resolve to type-1 records. The target offsets are distinct across the two DPC files but the seven-entry pattern is consistent.

This establishes a concrete chain in these two samples:

`type-13/class-7011 (+8 pointer) → type-9/class-7012 (7-entry list at +16) → seven type-1 records`

The graph inspector now follows this specific type-9/class-7012 layout as an observed candidate. It does **not** yet assign meaning to the seven child records, nor does it prove that all type-13 records or all maps use the same layout. The type-4 traversal remains a separate tentative hypothesis.

### Why this matters

The pointer chain is a much better executable-disassembly target than a bare class number. The next check is to find the code that reads type-13 `+8`, then determine how the type-9 count and child pointers are consumed. If those children resolve to geometry or surface data, their transforms and bounds may explain how the DPC scene connects to the GPC/RPC terrain patches.

Raw values and offsets above are from the committed `rag04.dpc` and `dead01.dpc` resources; no guessed semantic labels are applied.


## Candidate coordinate triples in class-7012 child records

A byte-level comparison of the seven type-1 children in the rag04 and dead01 class-7012 lists found a consistent payload pattern:

- Six children in each list contain the same signed 32-bit triple at offsets +4, +8, and +12.
- The repeated triples are (-192,144,-192), (-191,144,-192), (-208,144,-165), (-209,144,-162), (-351,144,-192), and (-375,144,-192).
- The seventh child has a zero triple and appears structurally different from the six nonzero entries.
- Each of the six nonzero records has a 32-bit value at +16, a count-like value of 1 at +20, and a relocated pointer at +24. In both samples that pointer resolves to a nearby type-1 record 32 bytes earlier.

This is evidence for a coordinate-like triple in the payload, not yet proof of a vertex format. Axes, units, transforms, and the purpose of the +16 value remain unknown. The exact repeated triples across two map files make this a strong target for comparison with executable field accesses and other scene records.

The new tools/inspect-dpc-point-lists.mjs script reports these fields for every validated type-9/class-7012 seven-entry list it finds. It labels the triples as candidates and deliberately avoids assigning geometry semantics.


## Newly observed type-8 records (2026-10-30)

A separate extended traversal was used to inspect the candidate type-8 records. It follows the currently observed type-1 pointer arrays, the provisional type-4 list layout, and the specific type-9/class-7012 seven-entry list. These counts are therefore **specific to this traversal**, and should not be mixed with the earlier six-map graph comparison above.

| DPC resource | File bytes | Reachable records in extended traversal | Reachable type-8 records |
|---|---:|---:|---:|
| `rag01.dpc` | 348,488 | 120 | 0 |
| `rag02.dpc` | 455,100 | 189 | 57 |
| `rag04.dpc` | 884,600 | 392 | 175 |
| `oasis03.dpc` | 245,532 | 419 | 104 |

Every sampled type-8 record is 112 bytes from the next sampled type-8 record in its local run, has numeric class ID 0, and contains eight consecutive signed 32-bit triples beginning at record offset +16 (12-byte stride). This is a repeatable record shape, not yet a decoded mesh format.

The first sampled triples illustrate two distinct numeric patterns:

- Some triples have Euclidean lengths close to 4,096. Examples include (0,0,4096), (-4095,1,0), (0,4095,0), and (0,0,-4096).
- Other triples have substantially larger lengths, for example (16551,7126,7083) and (6953,6992,-15911).

In `rag02.dpc`, sampled records begin with a 32-bit value 65286 (0x0000FF06); in `rag04.dpc`, sampled records include 65286 and 1286 (0x00000506); `oasis03.dpc` samples include 1030 and 773. The following two 32-bit header fields were zero in these samples. These values are recorded as raw observations only.

The presence of near-4096 triples is consistent with fixed-point unit-vector data, but the larger triples in the same eight-element block mean the block cannot safely be described as eight normals. A plausible working hypothesis is that the record interleaves different vector-like fields (for example, directional and position-like values); this remains unproven. The type-8 records were not reachable in the same traversal of `rag01.dpc`, which is an important negative comparison.

**Next validation:** identify the parent record types and pointer fields that lead to type-8 records; compare their eight-triple blocks with the GPC/RPC surfaces and with other maps; then locate the executable code that consumes this record type. Do not export these triples as geometry until the field roles and coordinate transform are established.


### Type-8 record field pattern: two endpoint positions and six unit-length vectors

A full scan of the reachable type-8 records in rag02, rag04 and oasis03 gives a stronger field pattern. In every sampled record, triples at slots 0, 1, 2, 4 and 5 have lengths close to 4096; slot 6 is usually also close to 4096, with occasional zero values. By contrast, slots 3 and 7 have much larger coordinate-like magnitudes. The natural structural grouping is therefore two four-triple blocks:

- block A: three near-unit-length vector triples, followed by one coordinate-like triple (slot 3)
- block B: three near-unit-length vector triples, followed by one coordinate-like triple (slot 7)

For rag02, all 57 records have near-4096 lengths in slots 0, 1, 2, 4 and 5; slot 6 does so in 54/57. For rag04, slots 0, 1, 2, 4 and 5 do so in all 175 records; slot 6 does so in 138/175. For oasis03, slots 0, 1, 2 and 4 do so in all 104 records; slot 5 does so in 103/104 and slot 6 in 59/104. The position-like slots are never all-zero in these samples.

This strongly supports two endpoint-like structures, each carrying three direction-like vectors and one position-like vector. It does not establish whether the direction vectors are face normals, edge normals, a local frame, or another basis. Tests of pairwise orthogonality show they are often not mutually perpendicular, so they must not simply be called XYZ axes. Nor is the endpoint pair proven to be a rendered edge or polygon.

Exact position reuse between type-8 records is uncommon in these samples (rag02: none among 114 endpoint positions; rag04: two shared positions; oasis03: one shared position). This may mean records describe independent edges/segments or use different coordinate precision/transform conventions; more evidence is needed before assembling triangles.


### Broader campaign survey of reachable type-8 records

The same extended traversal was applied to additional campaign and multiplayer DPC files. These are reachable type-8 counts, not total occurrences found by an unrestricted byte scan:

| Resource | Reachable type-8 records |
|---|---:|
| anub01 | 214 |
| anub02 | 71 |
| anub03 | 0 |
| anub04 | 115 |
| anub05 | 3 |
| dead01 | 0 |
| dead02 | 0 |
| dead03 | 5 |
| dead04 | 10 |
| dead1m | 0 |
| dead2m | 0 |
| jug01 | 0 |
| jug02 | 247 |
| mik01 | 32 |
| mik1m | 53 |
| oasis01 | 7 |
| oasis02 | 83 |
| oasis03 | 104 |
| oasis04 | 0 |
| oasis05 | 38 |
| oasis06 | 12 |
| oasis1m | 57 |
| oasis6m | 12 |
| rag01 | 0 |
| rag02 | 57 |
| rag03 | 90 |
| rag04 | 175 |
| rag05 | 89 |

The endpoint/vector field pattern was spot-checked in anub01, jug02, oasis02 and rag03 as well as rag02, rag04 and oasis03. In all four additional samples, slots 0, 1, 2, 4 and 5 were near length 4096 for every reachable type-8 record; slot 6 was near 4096 for most records. Slots 3 and 7 were coordinate-like values and were not near 4096. This makes the two-block pattern a cross-campaign observation rather than a peculiarity of the three initial files.

The distribution is map-dependent: some maps have hundreds of these records, while others have none or only a handful. That argues against treating type-8 as a universal terrain surface record without checking the owning parent and map context. The working interpretation remains two endpoint-like blocks, each containing three direction-like vectors and one coordinate-like triple; exact runtime semantics are unresolved.


## Original motion archive: fixed frame-record stride (2026-10-30)

The extracted `motion.ff` animation resources were surveyed directly. In 58 `.MC` files, the first little-endian 32-bit value is consistent with a frame count, and the remaining payload divides exactly into 152-byte records per frame. The matching files cover male and female stand, walk, run, glide, wait, rock, and death clips.

One file, `fstand2.mc`, is an exception: its header reports 17 frames, while its payload is 2,736 bytes—152 bytes more than 17 × 152. The extra 152 bytes are retained as an anomaly rather than discarded or reinterpreted.

This establishes a stable animation frame-container stride, not the internal channel layout. The number and meaning of channels, skeleton mapping, coordinate system, and interpolation rules remain unverified. The reusable inventory tool is `tools/inspect-motion-format.mjs`.
