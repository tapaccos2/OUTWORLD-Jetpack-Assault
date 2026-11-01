# Scout one-run finalization report

- Status: STATIC_CANDIDATES_EXPORTED_PLACEMENT_UNVERIFIED
- Source archive/DPC: /home/runner/work/OUTWORLD-Jetpack-Assault/OUTWORLD-Jetpack-Assault/original-data/units.ff
- Extracted DPC SHA-256: 05887eae665ec9eb7da64420d549e239d23c0a81e3b27eae4f77ac655df58758
- Executable analysis: not requested

## Primary static candidate

- File: scout-candidate.glb
- Validation: PASS
- Meshes: 9
- Vertices: 390
- Triangles: 230
- Combined bounds: {"min":[-2304,-904,120],"max":[1790,1107,2799],"size":[4094,2011,2679]}

| Mesh | Vertices | Triangles | Face records | Unique quads |
|---|---:|---:|---:|---:|
| root_mesh | 37 | 22 | 22 | 11 |
| submesh_1 | 45 | 26 | 26 | 13 |
| submesh_2 | 43 | 26 | 26 | 13 |
| submesh_3 | 45 | 26 | 26 | 13 |
| submesh_4 | 45 | 26 | 26 | 13 |
| submesh_5 | 45 | 26 | 26 | 13 |
| submesh_6 | 45 | 26 | 26 | 13 |
| submesh_7 | 45 | 26 | 26 | 13 |
| submesh_8 | 40 | 26 | 26 | 13 |

## Placement

Bounds in this report are world-space bounds: every GLB node matrix or TRS transform is applied, including parent transforms. Local-space bounds are also reported separately. This corrects the prior validator, which ignored node translations.

## Coordinate-base comparison

| Candidate | Meshes | Vertices | Triangles | World-space bounds |
|---|---:|---:|---:|---|
| rawSharedPool | 9 | 390 | 230 | {"min":[-2047,-1328,120],"max":[2047,644,832],"size":[4094,1972,712]} |
| ownerTranslated | 9 | 390 | 230 | {"min":[-2304,-904,120],"max":[1790,1107,2799],"size":[4094,2011,2679]} |
| referencePointMapped | 9 | 390 | 230 | {"min":[-2152,-795,120],"max":[1942,1519,2278],"size":[4094,2314,2158]} |
| meshReferenceBase | 9 | 390 | 230 | {"min":[-2047,-1328,-451],"max":[2047,644,832],"size":[4094,1972,1283]} |
| meshReferenceOwnerTranslated | 9 | 390 | 230 | {"min":[-2381,-924,120],"max":[1713,1080,2799],"size":[4094,2004,2679]} |

The mesh-reference candidates apply the alternate vertex base stored at meshNode+28. This was omitted from the earlier pass and must be compared before selecting a final placement.

## Runtime reconstruction boundary

- analysis/ contains the integrated callback, descriptor, opcode-4, opcode-5 and executable-disassembly reports.
- The static mesh export does not claim verified per-mesh opcode-5 ownership or composed runtime matrices.
- Original UVs, texture/material assignment, skinning, animation and bit-exact renderer behavior are not claimed.
- The repeated 0x04010C09 records are treated as candidate face records only in the owner-part mesh streams. Elsewhere they remain callback/class records; no global byte-pattern interpretation is applied.

## Validation

- All nine mesh sections passed GLB/index-bound checks.
- World-space bounds include every active-scene node matrix/TRS and parent transform.
- This is structural validation only; bounds do not establish anatomical correctness or select a winning placement.
- Each source face-record count matches the observed two-record-per-unique-quad pattern.
- Triangle counts agree with the exported unique quad counts.

## Files

- scout-candidate.glb: owner-translated comparison baseline; not a selected or verified final placement.
- geometry/: shared-pool, owner-translated, reference-point-mapped, mesh-reference-base and mesh-reference-plus-owner-translation alternatives with JSON sidecars.
- analysis/: complete integrated forensic report set.
- FINAL-REPORT.json and FINAL-REPORT.md: machine-readable and human-readable summaries.
- The adjacent ZIP contains the complete output directory.
