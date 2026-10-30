# Scout armour geometry extraction

**Status: raw indexed geometry decoded and exported; assembled model transforms remain unresolved.**

## Export

tools/export-dpc-armour-geometry.mjs reads an original DCPMC playable-armour resource and writes a self-contained glTF 2.0 binary (.glb) plus a JSON report.

For units/scout_mj.dpc, the exporter follows the class-102 root record and its class-105 part list. It finds one root mesh and eight additional mesh nodes (the ninth class-105 entry is a container, not another mesh). It reads signed 16-bit XYZ vertex entries from the shared coordinate pool and class-090c face records, deduplicates the paired face records that repeat the same unordered four-index set, and triangulates each unique quad as a two-triangle fan. For submeshes, the shared coordinate-pool base is resolved through type-2 +20 → type-16 +8 → descriptor +4. Each submesh also stores its own vertex-slice start at type-2 +28; face indices are relative to that slice. The exporter validates that the slice lies on an 8-byte boundary within the shared coordinate pool, then reads vertices from that per-mesh start.

## Validated extraction counts

| Mesh | Source face records | Unique quads | Triangles |
|---|---:|---:|---:|
| Root | 22 | 11 | 22 |
| Each of eight submeshes | 26 | 13 | 26 |
| **Total** | **230** | **115** | **230** |

The GLB contains nine meshes, 1,976 position entries, 230 triangles, generated vertex normals, and diagnostic materials. It has no external buffer dependencies. The exporter was run against the male Scout scout_mj, scout_ma, and scout_md DPC resources; each produced nine meshes and 230 triangles, and each GLB loaded successfully through trimesh.

## What is and is not decoded

Decoded: the model root/part-list relationship, eight submesh owner nodes, the mesh-data pointers, coordinate records, face-record indices, quad deduplication, triangulation, and a reproducible GLB export.

Not yet decoded: the full attachment/rotation hierarchy, the exact meaning of the linked type-16 records, UV coordinates, TPC pixel records, original material assignments, skin weights, skeleton names, and motion-slot-to-bone mapping. The type-2 wrapper values at +32/+36/+40 match the owning type-1 node's +8/+12/+16 values; they are retained as candidate translation metadata. The --apply-anchor-candidates option is exploratory and must not be mistaken for the game's verified transform behavior.

The current GLB is therefore a verified **raw geometry extraction**, not yet a recognisable, correctly assembled or animated Scout character. The shared coordinate-pool base and per-mesh slices are now validated across all seven Scout DPC resources. The GLBs export nine meshes, 390 referenced vertices and 230 triangles per variant. This validates the extraction graph and vertex-slice addresses, but the resulting combined surface is still not visually recognisable; attachment transforms / rotations remain the primary blocker. Do not replace the in-game soldier with it until attachment transforms and a visual comparison are solved.

## Usage

    node tools/export-dpc-armour-geometry.mjs units/scout_mj.dpc scout-mj-raw.glb
    node tools/export-dpc-armour-geometry.mjs units/scout_mj.dpc scout-mj-anchor-test.glb --apply-anchor-candidates

The exporter also writes a .json report next to each GLB. The first command is the source-faithful default; the second applies candidate translations for investigation only.
