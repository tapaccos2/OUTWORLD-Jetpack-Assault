# Scout armour geometry extraction

**Status: raw indexed geometry decoded and exported; assembled model transforms remain unresolved.**

## Export

tools/export-dpc-armour-geometry.mjs reads an original DCPMC playable-armour resource and writes a self-contained glTF 2.0 binary (.glb) plus a JSON report.

Across the seven available Scout DPC files, the exporter follows class-102/class-105 roots for male variants and class-152/class-155 roots for female/test variants. It finds one root mesh and eight additional mesh nodes (the ninth class-105 entry is a container, not another mesh). It reads signed 16-bit XYZ vertex entries from the shared coordinate pool and class-090c face records, deduplicates the paired face records that repeat the same unordered four-index set, and triangulates each unique quad as a two-triangle fan. For submeshes, the shared coordinate-pool base is resolved through type-2 +20 → type-16 +8 → descriptor +4. The type-2 +28 pointer is retained as a separate mesh-reference field; current tests do not establish it as the base of the XYZ array. The face indices resolve against the shared coordinate pool.

## Validated extraction counts

| Mesh | Source face records | Unique quads | Triangles |
|---|---:|---:|---:|
| Root | 22 | 11 | 22 |
| Each of eight submeshes | 26 | 13 | 26 |
| **Total** | **230** | **115** | **230** |

Each GLB contains nine meshes, 390 referenced position entries, 230 triangles, generated vertex normals, and diagnostic materials. It has no external buffer dependencies. The exporter was run against all seven Scout DPC resources (mj, ma, md, fa, fd, fj, test); each produced nine meshes and 230 triangles, and each GLB loaded successfully through trimesh.

## What is and is not decoded

Decoded: the model root/part-list relationship, eight submesh owner nodes, the mesh-data pointers, coordinate records, face-record indices, quad deduplication, triangulation, and a reproducible GLB export.

Not yet decoded: the full attachment/rotation hierarchy, the exact meaning of the linked type-16 records, UV coordinates, TPC pixel records, original material assignments, skin weights, skeleton names, and motion-slot-to-bone mapping. The type-2 wrapper values at +32/+36/+40 match the owning type-1 node's +8/+12/+16 values; they are retained as candidate translation metadata. The --apply-anchor-candidates option is exploratory and must not be mistaken for the game's verified transform behavior.

The current GLB is therefore a verified **raw geometry extraction**, not yet a recognisable, correctly assembled or animated Scout character. The shared coordinate-pool base is validated across all seven Scout DPC resources; type-2 +28 remains separate unresolved metadata. The GLBs export nine meshes, 390 referenced vertices and 230 triangles per variant. This validates the extracted pointer graph and shared coordinate-pool reads, but not the attachment transforms. The resulting combined surfaces are still broad overlapping/fan-like forms rather than a recognisable character; attachment rotations and hierarchy remain the primary blocker. Do not replace the in-game soldier with it until attachment transforms and a visual comparison are solved.

## Usage

    node tools/export-dpc-armour-geometry.mjs units/scout_mj.dpc scout-mj-raw.glb
    node tools/export-dpc-armour-geometry.mjs units/scout_mj.dpc scout-mj-anchor-test.glb --apply-anchor-candidates

The exporter also writes a .json report next to each GLB. The first command is the source-faithful default; the second applies candidate translations for investigation only.

## Corrected part-list audit (2026-10-30)

The automated graph audit of `scout_mj.dpc` corrects the earlier count/role shorthand:

- The class-105 list has **nine type-1 entries**.
- The **first eight entries** are the eight mesh-owner records at offsets 8,040; 9,592; 11,144; 12,696; 14,248; 15,800; 17,352; and 18,904. Each has a child type-2 node at owner +24 and a second type-2 node at owner +28.
- For all eight, the second child node's signed values at +32/+36/+40 exactly match the owner's +8/+12/+16 vector. This confirms the stored values agree between the two records; it does **not** prove that directly applying the vector as a glTF node translation matches the runtime transform.
- The **ninth entry**, at offset 20,436, is structurally different. It has no type-2 child at owner +28. Its later fields contain links to the first eight owners, to itself, and to the model root at offset 6,496. Treat it as an aggregate/grouping node, not a ninth renderable mesh.

A further caution follows from the exporter: all nine mesh decodes read positions from the same shared coordinate pool (base file offset `0x28`), and the face indices are global indices into that pool. Consequently the extracted vertex positions may already be expressed in a common model-space frame. Applying the stored owner vectors on top could duplicate a placement rather than assemble a local-space mesh. The raw no-anchor GLB must be compared with the candidate-anchor GLB before deciding which transform interpretation is correct.

The type-2 values at +8/+12/+16 and the remaining pointer/flag fields are still unlabelled. Do not call them Euler angles or a rotation until an executable read site or a cross-variant pattern establishes that.

## Corrected interpretation: alternating type-16 geometry-descriptor links (2026-10-31)

The graph audit follows each type-16 wrapper's +8 pointer to its exact target field. Across the eight submeshes, the 16 links follow this pattern:

1. submesh_1 mesh node → root mesh +24;
2. submesh_1 paired node → submesh_1 mesh node +24;
3. submesh_2 mesh node → submesh_1 paired node +56;
4. submesh_2 paired node → submesh_2 mesh node +24;
5. the pattern repeats through submesh_8.

Counts: one root-to-first-mesh link, eight paired-node-to-own-mesh links, and seven mesh-to-previous-paired links: **16/16 links accounted for**.

**Correction to the earlier report:** the displayed first DWORDs 10,000 and 2,250,000 were the little-endian DWORD representation of each 4-byte record header, not numeric transform values. The actual headers are:
- mesh-side wrappers: type 16, flags 0x27, class ID 0; DWORD at wrapper +4 is 0;
- paired-node wrappers: type 16, flags 0x55, class ID 34; DWORD at wrapper +4 is 10,000.

The wrapper +8 pointer does not target a type-2 record header. It targets an embedded descriptor field at +24 or +56 within another node. That field begins with `00 ff 00 00` (DWORD 0x0000FF00), followed by a pointer at descriptor +4. Following that pointer resolves to the common coordinate-pool base at file offset 40. The chain therefore supplies the shared vertex-pool descriptor used by the geometry parser; it is **not evidence of a bone/attachment parent hierarchy**.

The per-mesh coordinate reference remains a distinct field: mesh-node +28 points to offsets 96, 712, and 744 for the Scout parts. The exporter uses the type-16 descriptor chain to recover the shared pool at offset 40, while retaining the +28 target as a separate candidate local/per-mesh reference. The exact interpretation of the latter is still open; see the cross-variant comparison and corrected +28 analysis below.

The 16 links are now accounted for as geometry-pool references. The actual runtime attachment/rotation hierarchy remains unresolved. The earlier Euler-order and direct-anchor-translation trials did not produce a recognisable Scout and remain rejected as transform solutions.

## Per-mesh vertex-base hypothesis: cross-variant bounds validation (2026-10-30)

The alternate `--use-mesh-vertex-reference` export treats the type-2 +28 pointer as a per-mesh vertex-array base, while face indices are interpreted relative to that base. An automated comparison of all seven Scout DPC variants finds:

- All 8 of 8 offsets are eight-byte aligned in every variant.
- All effective referenced vertex indices remain within the source DPC file.
- All 8 of 8 meshes produce the expected 13 unique quads / 26 triangles under this interpretation.
- The +28 offsets are 96 for submesh 1 (start index 7), 712 for submesh 2 (start index 84), and 744 for submeshes 3–8 (start index 88).
- The maximum effective vertex index reaches 483 in submesh 8, consistently across all seven variants.

This is strong structural evidence that +28 can be a valid vertex-base candidate. It does not settle whether it is the intended base for every face-index stream: the local-base preview still renders overlapping plate-like geometry rather than a recognisable Scout. The original shared-base interpretation also remains a valid parse of the data. Keep both export modes until the runtime consumer or an independent source-format invariant establishes the correct interpretation. Do not change the default exporter to local-base on bounds checks alone.

## Corrected interpretation of type-2 +28 targets (2026-10-31)

The seven-variant comparison now reads the eight bytes at each type-2 `+28` target directly. These are **8-byte coordinate-pool entries**, not type-0 descriptor records. The first four bytes can coincidentally resemble a type-0 record header, so the generic record-header heuristic is a false positive at these offsets.

The records contain three signed 16-bit XYZ values followed by a zero 16-bit word. Across all seven Scout variants, the references are identical:

| Parts | File offset | Coordinate-pool index | XYZ | Trailing word |
|---|---:|---:|---|---:|
| 1 | 96 | 7 | `[0, -347, 127]` | 0 |
| 2 | 712 | 84 | `[-409, -285, 732]` | 0 |
| 3–8 | 744 | 88 | `[-39, -396, 359]` | 0 |

This confirms that `+28` points at valid coordinate records. It does **not** settle whether the field is a per-mesh vertex-array base, an attachment reference point, or another coordinate-pool reference. Treating it as the start of each mesh's vertex array still produces broad overlapping/fan-like geometry, and using it as a pivot with candidate planar rotations did not produce a recognisable Scout. Neither interpretation is accepted as the runtime transform.

The cross-variant report now includes the full referenced vertex record and offset for each part. The default exporter remains unchanged.


## Runtime-transform separation warning (2026-10-31)

The executable analysis identifies runtime object fields at +0xE4/+0xE6/+0xE8 for three 16-bit rotation components, +0xB4 for a derived orientation matrix, and +0xEC/+0xF0/+0xF4 for a three-component position. This is separate evidence from the DPC type-16 geometry-pool links described above. The code paths have not yet been tied to the eight Scout submeshes or to their paired type-2 records. Do not use the type-16 descriptor chain as the transform hierarchy, and do not change the exporter to apply guessed rotations or translations until that runtime data path is connected to the Scout records.
