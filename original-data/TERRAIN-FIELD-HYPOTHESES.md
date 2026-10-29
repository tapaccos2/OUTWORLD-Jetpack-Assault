# Terrain record field hypotheses

This document tracks the evolving GPC/RPC terrain decode. Early observations are preserved for auditability, but later sections contain the stronger results: dimensions, orientation, normals, corner heights, corner order, and the XY corner anchor have been cross-validated across the full resource inventory. A candidate mesh exporter and interactive preview now exist; visual validation against an original in-game map remains outstanding.

## New lead: RPC corner-value quartet and XY pair

In the 40-byte RPC record, the four 32-bit little-endian fields at record-relative offsets 16, 20, 24 and 28 each contain a signed integer whose observed magnitude fits a plausible terrain scalar. In the same record, the 32-bit signed integers at offsets 32 and 36 form a pair of spatial-looking coordinates. The quartet varies independently in many records and often repeats one value in all four positions.

At this early stage, the pattern only suggested four per-corner values. Later normal-gradient and topology checks in this document confirm that these are ordered corner heights in the same game-unit scale as the two surface dimensions.

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

## Remaining tests before integrating into the playable game

1. Use the interactive preview to compare the candidate geometry with original in-game screenshots or map references.
2. Visually validate the default corner-1–2 triangulation against the alternate diagonal.
3. Establish absolute game scale and the relationship between mission spawn/object coordinates and terrain coordinates.
4. Identify the correct terrain textures and any additional collision, underside, or overlapping surface layers.
5. Integrate the reconstructed mesh into the playable scene only after the coordinate mapping and visual shape are confirmed.

## Important limitation

A candidate mesh exporter and interactive preview are now available. The candidate mesh has not yet been visually validated against an original in-game terrain reference, so it must not yet be treated as a finished faithful level reconstruction.

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

The same pattern occurs at `(1024, 32768)`. These examples are consistent with four ordered grid corners stored in row-major order, with the two pairs representing opposite sides of a surface. This was stronger evidence for a per-corner elevation interpretation than value ranges alone. Subsequent sections decode the dimensions, direction, normal, row-major corner order, and corner anchor; only the remaining type/flags fields and original visual match remain unresolved.

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

The setter's pairwise stores and the real data patterns led to the row-major order `[corner00, corner01, corner10, corner11]`. Under that order, both `[a,a,b,b]` and `[a,b,a,b]` represent the two axis-aligned slope directions. In `oasis01.rpc`, 104 records have the first pattern (excluding fully flat records), 74 have the second, and 103 are fully flat. The later normal-gradient test validates this order: the stored normal agrees with the first three corners and the dimension/orientation fields.

## Orientation vector confirmed by executable trigonometry

The first 16 bytes are not just an opaque block: the 16-bit signed values at RPC offsets `+6` and `+8` are a fixed-point orientation vector. In the native setter at `0x00477030`, the executable calls its sine lookup at `0x004C51C4` and cosine lookup at `0x004C5230`, then stores their 16-bit results at exactly `+6` and `+8`.

This code-level interpretation also matches every shipped RPC record checked: across all 34 RPC files and **8,005 records**, the magnitude `sqrt(sin² + cos²)` for the signed 16-bit pair at offsets `+6/+8` lies within 2 units of 4095. The observed minimum is 4094.34 and maximum is 4096.62. That near-constant magnitude is decisive confirmation that these fields are the fixed-point sine/cosine components of a direction/rotation, rather than arbitrary texture coordinates. The checker now reports this test automatically.

The angle itself, the meaning of fields at offsets `+0`, `+2`, and `+4`, and how the orientation vector transforms the four corners are still unresolved. The three fields at `+10`, `+12`, and `+14` are now strongly identified as a normal-like vector; see the next section.

**Reachability caveat:** this setter is a real routine in the executable, but a simple static cross-reference scan did not find a direct call instruction or literal function-pointer reference to `0x00477030`. Its runtime reachability is therefore unconfirmed; treat it as strong structural evidence for the record layout, not yet proof that this exact routine processes the campaign files during normal gameplay.

## A second fixed-point vector: surface normal candidate

The signed 16-bit triplet at RPC offsets `+10`, `+12`, and `+14` also has a near-constant magnitude. Across all 34 RPC files and **8,005 records**, `sqrt(nx² + ny² + nz²)` is within 2 units of 4095 for every record; the observed range is 4094.27–4095.75. Flat records commonly store `(0, 0, 4095)`, while sloped records use non-zero first/second components and a reduced third component. This is strong evidence that the triplet is a fixed-point surface-normal vector.

The first 16 bytes of each RPC record therefore contain at least: a type/flag word at `+0`, two dimension values at `+2/+4`, a 2D orientation/direction pair at `+6/+8`, and a 3D normal at `+10/+12/+14`. The native setter directly writes the direction pair and the height/position fields; the normal vector is strongly confirmed by its fixed magnitude and its agreement with the height-derived plane normal, although a direct native consumer of the normal triplet has not yet been located.

## Geometry formula validated against stored normals

The dimension and corner-order interpretation can now be tested geometrically. For each RPC record, let `w = u16(+2)`, `d = u16(+4)`, `s = int16(+6)/4095`, and `c = int16(+8)/4095`. Treat the four signed 32-bit values at `+16/+20/+24/+28` as row-major heights `h00/h01/h10/h11`. The first three corners give local gradients:

- `gxLocal = (h01 - h00) / w`
- `gyLocal = (h10 - h00) / d`

Rotate those gradients by the negative angle represented by the sine/cosine pair:

- `gxWorld = gxLocal*c + gyLocal*s`
- `gyWorld = -gxLocal*s + gyLocal*c`

The expected surface normal is `normalize(-gxWorld, -gyWorld, 1)`. Compare it with the signed 16-bit normal at `+10/+12/+14`, normalized. This is not just a plausible fit: across all 8,005 RPC records, **8,003 match with a normalized dot product above 0.999**. The other two are the same flat record in `dead01.rpc` and `dead1m.rpc`: all four heights are 6487, but the stored normal is `(0,0,-4095)` rather than `(0,0,4095)`, so it is exactly inverted. Preserve that sign; do not force all normals upward.

This confirms the working interpretation of `+2/+4` as the two surface dimensions, `+6/+8` as the orientation sine/cosine pair, `+10/+12/+14` as the normal, and `+16/+20/+24/+28` as the ordered corner heights. The remaining geometric uncertainty is the exact meaning of the position at `+32/+36` (the local (0,0) corner is now the best-supported interpretation) and the triangulation convention for the fourth corner when the four heights are not coplanar. The checker now reports the normal-vs-gradient consistency test.

## Position anchor resolved by cross-surface edge continuity

I compared two possible interpretations of the final RPC XY pair across all 34 resource sets: (a) it is the centre of the rectangle, or (b) it is the local `(0,0)` corner. For each record, I generated the four XY corners from the stored width/depth and sine/cosine, rounded the fixed-point results to the nearest game coordinate, then counted shared edges and whether their endpoint heights matched exactly.

| Position interpretation | Shared edge keys | Shared edges with matching endpoint heights |
|---|---:|---:|
| XY is rectangle centre | 445 | 175 |
| XY is local `(0,0)` corner | 2,297 | 1,872 |

The corner interpretation produces over five times as many shared edges and over ten times as many exact height-matched shared edges. It is better in 27 of the 34 resource sets. This is strong internal topological evidence that `+32/+36` is the local origin/corner, not the centre. The few sets where it is tied or worse are small or have overlapping/multiple surfaces; `oasis06` also contains substantial overlapping geometry, so its edge-height agreement is lower even though the corner interpretation creates more shared edges.

The mesh exporter now defaults to corner anchoring, while retaining `--anchor=center` as a comparison option. This resolves the previous anchor ambiguity enough to build a first candidate mesh, but the result still needs a visual comparison against an original in-game map to validate scale and triangle diagonal.

## First candidate meshes generated and inspected

The first candidate OBJ meshes have now been generated successfully by GitHub Actions for `rag01`, `rag02`, and `oasis01`, with `rag01` exported in centre-anchor and both diagonal variants. The workflow and downloadable artifact are available from the [mesh-export workflow run](https://github.com/tapaccos2/OUTWORLD-Jetpack-Assault/actions/runs/40956696490). The artifact contains five OBJ files and was generated without parser or range-validation errors.

A first 3D preview of `rag01` confirms the records form a collection of individual surface patches spread across a large coordinate range, not a single continuous heightfield. A simple shared-edge connected-component check found 761 connected triangle components across 1,534 triangles; most quads are separate pieces, with only a small number sharing edges. This is consistent with RPC records describing discrete ramp/surface objects, and it means the OBJ should be treated as a geometry extraction candidate rather than a complete, seamless landscape. Other terrain/environment resources or map-specific placement may still be needed to reproduce the full level.

Preview images produced during inspection: `rag01_candidate_mesh_3d.png` and `rag01_candidate_mesh_topdown.png` (generated in the working session; not committed as game assets). The next validation is to inspect how these patches align with the level reference and to determine whether additional resources supply the surrounding ground.
