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


### Motion frame payload subdivision

The 152-byte frame payload divides exactly into 19 consecutive 8-byte slots. Treating each slot as four little-endian signed 16-bit values, the fourth value is the same sentinel `-16393` (`0xBFF7`) in every slot of every complete frame inspected: 112,195 slot records across 5,905 frames from the 58 exact-stride files. The first three signed words vary and remain raw numeric channels.

This is a strong structural result: each frame is a fixed array of 19 four-word records, with a constant fourth word. It is not yet proof that the 19 slots map one-to-one to bones, or that the first three values are Euler angles, translations, or another representation. The `fstand2.mc` extra 152-byte block remains an exception and was excluded from the complete-frame tally.


## Playable armour model graph: root-to-geometry-class link (2026-10-30)

The extracted `units.ff` armour resources were compared using the DPC relocation base and the observed type-1 pointer array. The type-1 model root points to a type-12 record; in these unit resources, the type-12 record has a relocated pointer at relative offset +8 back into the model's type-1 record network. Following that observed link exposes a second type-1 record whose child pointers reach a type-9 record and a type-5 record.

For the playable armour classes, the reachable type-9 class IDs track the armour class IDs with a consistent +2 offset:

| Armour family | Root type-1 class | Reachable type-9 class |
|---|---:|---:|
| Scout | 100 | 102 |
| Combat | 200 | 202 |
| Assault | 300 | 302 |
| Dreadnought | 400 | 402 |

The same pattern recurs across male/female and environment variants. This is stronger evidence that the type-9 record is part of the playable armour model representation than a class-number observation from one file. It does not yet identify the vertex/index layout or prove the precise role of type-5/type-8/type-2 records.

The first model-network type-1 node also exposes two children: a type-9 armour-class record and a type-5 record. In the Scout sample, the type-9 record is at file offset 20,516 and the type-5 record at 37,632. A six-entry relocated-pointer table immediately precedes the type-9 record in that sample. The pointer table and type-9 payload are recorded as candidates for the next geometry-decoding step; no mesh is exported from them yet.

The current graph inspector did not follow this unit-specific type-12 link, so these observations were derived by validating the relocated target headers directly across the extracted model files. Treat the type-12 +8 relationship as observed for this unit-model family, not as a universal DPC rule.


## Playable armour sub-part graph (2026-10-30)

A first-pass inspection of the male Scout model was too narrow: it described only six type-1 part nodes and missed the earlier two nodes in the type-9/class-105 pointer list. The complete observed list contains eight type-1 nodes, plus a ninth list entry that resolves to a separate linked record. The eight type-1 nodes begin at file offsets 9,592, 11,144, 12,696, 14,248, 15,800, 17,352, 18,904, and 20,436.

The type-9/class-105 node at offset 20,464 has a count of nine at +6 and its pointer list begins at +16. The eight type-1 entries are not all equivalent: the first seven show the repeated paired-child pattern, while the final node has a different nested shape. These are graph nodes, not yet eight proven visible mesh parts.

Examples of the paired child structure include type-1 node 9,592 linking to type-2 nodes at 9,240 and 9,568; node 11,144 links to 10,792 and 11,120; node 12,696 links to 12,344 and 12,672. The remaining nodes must be treated individually rather than extrapolated from a six-part assumption.

Type-2 records expose a relocated pointer at +20 to a type-16 record. Type-16 records begin with the value 10,000 (0x2710) in the sampled Scout paths. The relocated pointer at type-16 +8 resolves to another type-2 record header (for example, type-16 at 9,228 links to type-2 at 8,072); it is not a raw vertex buffer. The meaning of 10,000 is unknown and must not be labelled a vertex count.

Type-2 records also link to type-4 records. Examples include offsets 9,308, 9,668, 10,860 and 11,220. Their payloads contain packed short values, but their meaning (geometry, indices, materials, or another structure) is not established.

The root chain remains observed as: root type-1/class-100 → type-12 → type-1 → type-9/class-102, which links into the type-9/class-105 subgraph. These observations establish a graph shape only. They do not yet establish vertex positions, triangle indices, skinning, or the number of rendered sub-meshes.

## Executable cross-check: playable model sub-part links (2026-10-30)

The uploaded original `outwars.exe` was checked directly (PE32/i386, original 1998 build).

A correction to the earlier type-16 note: in the Scout sample, the relocated pointer at type-16 relative offset +8 resolves to another type-2 record, not to a separate untyped data buffer. For example, the type-16 record at file offset 9,228 contains `0x2710` at +0 and its +8 pointer resolves to the type-2 record at 8,072. The 10,000 value must not be described as a vertex count. The type-16 record is therefore a wrapper/link in this observed graph, with its exact runtime role still unknown.

The type-9/class-105 node at file offset 20,464 contains a nine-entry relocated-pointer list at +16. In the Scout sample, eight of those entries resolve to the eight type-1 part nodes at offsets 9,592, 11,144, 12,696, 14,248, 15,800, 17,352, 18,904, and 20,436; the ninth entry is a separate linked record. This corrects the earlier shorthand that described the structure as only a six-entry list. Six of the eight repeated part nodes have matching paired type-2 children; the remaining two are additional nodes and must be accounted for during reconstruction.

These observations are structural only. No vertex/index interpretation is assigned to type-2, type-4, or type-16 payloads until their executable consumers are resolved.

## Executable cross-check: 19-slot animation frame array (2026-10-30)

Static disassembly of the uploaded original `outwars.exe` confirms that the 152-byte motion frame is consumed as a fixed 19-entry array. At VA `0x00415c1d` and again at `0x00415d8e`, the runtime sets the associated animation object's element count to `0x13` (19). The loops at `0x00415c60` and `0x00415dd5` advance the source pointer by `0x98` bytes (152) for each frame while adjusting the signed 16-bit value at frame-relative offset +2. The runtime then creates 19 entries with an 8-byte per-entry stride.

This directly links the observed 152-byte frame stride to 19 per-frame channels/entries, rather than merely noting that 152 divides by 8. It confirms a 19-element runtime animation array; it does not yet prove that each element maps one-to-one to a named skeleton bone. The code inspected here does not yet expose the complete hierarchy, names, or the meaning of all four 16-bit words in each 8-byte entry; those remain open. The constant fourth word `0xBFF7` is still recorded as a raw invariant, not assigned a semantic label.

## Corrected playable-armour list interpretation (2026-10-30)

An automated audit of the complete nine-entry class-105 list in `scout_mj.dpc` resolves an earlier ambiguity:

- Entries 0–7 resolve to type-1 owner records at offsets 8,040 through 18,904 (1,552-byte spacing). Each has two type-2 children at +24 and +28.
- Entry 8 resolves to type-1 record 20,436. It is an aggregate node: its pointer list at +44 through +76 links to the first eight owner records and to itself; its pointer at +96 links to the model root (type-1 record at 6,496). It is not an additional rendered armour mesh.
- Across the eight owner records, the signed triple at owner +8/+12/+16 matches the signed triple at the paired owner+28 type-2 child +32/+36/+40 in every case.

The paired-node equality is a verified structural consistency check only. The semantic role of the two type-2 nodes and their other fields remains unresolved. In particular, the repeated values at their +8/+12/+16 fields have not been proven to be rotations.

The geometry exporter also reads all submesh vertices from the shared coordinate pool at file offset `0x28`, with global face indices. This raises a concrete alternative to the existing translation-only preview: the vertices may already be in a common model coordinate frame, in which case adding the owner triple again would over-translate them. Compare raw and translated exports before interpreting the result as a missing rotation problem.

## Scout type-16 wrapper chain and embedded descriptors (2026-10-30)

A byte-level link audit of the eight Scout mesh/paired-node pairs identifies a repeatable alternating chain. The type-16 wrapper's +8 pointer does not land on the start of another type-2 record; it lands on an embedded type-0/class-0 descriptor at a field inside an existing type-2 record:

- submesh 1 mesh-side wrapper (value 10,000) → root type-2 node +24;
- each paired-node wrapper (value 2,250,000) → its own mesh type-2 node +24;
- each subsequent mesh-side wrapper (value 10,000) → the previous paired type-2 node +56.

This yields 1 root-to-first-mesh link, 8 paired-to-own-mesh links, and 7 mesh-to-previous-paired links: all 16 expected links are accounted for in the sample. The embedded descriptors begin with bytes `00 ff 00 00`; the next fields include pointers to vertex data, a common external resource reference, and face data, followed by small count/flag-like values. In the sampled model, mesh-side descriptors point to shared vertex base offset 40, while paired-side descriptors point to part-specific offsets such as 96, 712, and 744.

This is a verified pointer/layout pattern, not yet proof of the semantic transform equation. The +24/+56 targets are embedded descriptors; do not call them rotation matrices until their executable consumer is identified. The two wrapper constants (10,000 and 2,250,000) are retained as raw values.

A diagnostic applied the owner triples as Euler angles with 4096 units per full turn in all six Euler orders. None produced a recognisable Scout silhouette. Directly applying the same triples as translations also made the combined model spread farther apart. Both simple interpretations are rejected as assembly solutions.

Next target: locate the executable routine that consumes type-16 wrappers and these embedded type-0 descriptors, and establish the transform/matrix access pattern before changing the GLB exporter.
