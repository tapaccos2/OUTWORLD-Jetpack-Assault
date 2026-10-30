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
