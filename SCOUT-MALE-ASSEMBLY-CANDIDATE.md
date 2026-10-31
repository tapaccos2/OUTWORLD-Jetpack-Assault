# Male Scout assembly candidate

This note records the first assembled-geometry export path for `scout_mj.dpc`.

## Evidence from the part-graph audit

- The playable-armour root is class 102 and its part list is class 105.
- The list contains eight type-1 part nodes plus a ninth aggregate entry.
- Each of the eight part nodes has a type-2 node at +24 and a paired type-2 node at +28.
- The owner position at +8/+12/+16 matches the paired node position at +32/+36/+40 for all eight parts.
- The type-16 wrapper links form an ordered part chain: part 1 mesh to root mesh +24; each paired node to its own mesh +24; and each mesh from part 2 onward to the previous paired node +56.
- The mesh-node +28 references are aligned within the shared coordinate pool. Their face-index ranges can be read relative to those references. This is the basis for the `--use-mesh-vertex-reference` mode.
- Mesh-reference vertex counts are 45, 43, 45, 45, 45, 45, 45, and 40 for parts 1–8 respectively. Each part contains 13 unique quads (26 triangles) in the parsed face stream.

## First assembled candidate

Run from the repository root:

```bash
node tools/export-dpc-armour-geometry.mjs \
  extracted-ff/units/scout_mj.dpc \
  scout-mj-assembled-candidate.glb \
  --use-mesh-vertex-reference \
  --apply-owner-translations
```

This writes:
- `scout-mj-assembled-candidate.glb`
- `scout-mj-assembled-candidate.json`

The GLB contains the root mesh and eight submeshes. The eight submesh nodes use the owner position vectors as translations. The exporter checks the owner/paired-node position equality before applying them.

## Not yet established

- The four opcode-5 transform roots and their full matrix concatenation have not been mapped to the eight geometry parts. The transform-to-geometry audit found no direct descriptor-offset matches.
- The DPC's final up-axis and matrix convention have not been runtime-verified. Z-up is a working interpretation only.
- The root mesh remains at the origin in this export.
- UVs, source texture assignments, material segmentation, skin weights, animation, and final appearance still need validation in the viewer.

Treat this GLB as the first evidence-based assembly candidate, not a verified final model. The next meaningful check is the exported model in the actual viewer; avoid running another binary-inspection battery unless that visual check reveals a specific failure.
