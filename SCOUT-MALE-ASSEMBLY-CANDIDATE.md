# Male Scout assembly candidate

This note records the current geometry-export hypothesis for `scout_mj.dpc`.

## What the latest viewer result ruled out

The candidate exported with `--use-mesh-vertex-reference --apply-owner-translations` is **rejected**. The viewer shows stretched, overlapping triangles rather than an assembled armour model.

The likely cause is an incorrect interpretation of `meshNode+28` as a new vertex-array base:

- All eight mesh face streams reference the common coordinate pool whose descriptor base is offset 40.
- Their face-index ranges progress through the shared pool in roughly 45-vertex blocks: part 1 uses 47–81, part 2 uses 96–130, part 3 uses 141–175, part 4 uses 186–220, part 5 uses 231–265, part 6 uses 276–310, part 7 uses 321–355, and part 8 uses 366–395. Some also reuse low shared indices such as 0 and 1.
- The `meshNode+28` targets are offsets 96, 712, and 744; parts 3–8 all point to 744. These targets are inside the common coordinate pool, not eight advancing per-mesh array starts.
- Adding the face indices to those interior pointers therefore double-offsets the vertex lookup and reads the wrong coordinate records. This is the best-supported explanation for the exploded geometry in the screenshots.

## Next candidate: shared pool plus owner positions

Run from the repository root:

```bash
node tools/export-dpc-armour-geometry.mjs \
  extracted-ff/units/scout_mj.dpc \
  scout-mj-shared-pool-candidate.glb \
  --apply-owner-translations
```

This deliberately omits `--use-mesh-vertex-reference`. It reads the face indices from the shared coordinate-pool base and applies the eight owner position vectors to the submesh nodes. It writes:

- `scout-mj-shared-pool-candidate.glb`
- `scout-mj-shared-pool-candidate.json`

## Still unresolved

- The eight owner positions match their paired-node position fields, but applying them as translations remains a candidate interpretation, not a runtime-verified transform.
- The four opcode-5 transform roots and their matrix hierarchy have not been mapped to the eight geometry parts. The transform-to-geometry audit found no direct descriptor-offset matches.
- Axis orientation and matrix concatenation convention are not runtime-verified.
- The root mesh remains at the origin in this export.
- UVs, texture assignments, material segmentation, skin weights, and animation are not included.

The next useful check is the new GLB in the actual viewer. Do not reuse the rejected mesh-reference-base option for an assembled export.
