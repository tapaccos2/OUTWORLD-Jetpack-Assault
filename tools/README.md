# Original-data inspection tools

Run these from the repository root with Node.js 18 or newer.

## 1. Inventory binary files

```sh
node tools/inspect-original-data.mjs original-data > original-data-inventory.json
```

Lists each `.MIS` file's printable strings and resource references, and each `.GRY` file's size/header bytes. This is exploratory inventory only.

## 2. Parse the known mission header

```sh
node tools/parse-mis-header.mjs original-data/misn/Anub02.mis original-data/misn/Anub01.mis
```

Reads the length-prefixed Mission Builder version string and, for the newer observed layout, the length-prefixed mission title. It handles the observed Anub01 legacy variant separately. It does not decode the remaining binary records.

## 3. Audit missing referenced resources

```sh
node tools/check-original-assets.mjs original-data > original-asset-dependencies.json
```

Compares resource filenames found inside the `.MIS` files against filenames present anywhere under `original-data/`. This highlights dependencies that are not in the uploaded folders.

Do not use any of these outputs as a claim that the map or mission has been fully decoded. The next stage is to identify and validate binary record layouts and recover object placement. Terrain geometry must be sourced from the correct asset format.

## 4. Inspect `.GRY` sound-effect audio

```sh
node tools/inspect-gry-audio.mjs original-data/gry/*.gry
```

Identifies embedded sound records beginning with `A0 B9 B7 00`, reports codec metadata and checks that each audio payload ends at the next record boundary.

## 5. Extract individual `.GRY` sound records

```sh
node tools/inspect-gry-audio.mjs --extract extracted-gry-audio original-data/gry/*.gry
```

Writes each embedded sample as a `.vgmstream` file with a matching `.txth` sidecar. Most Outwars `.GRY` records are mono MS ADPCM at 22,050 Hz with 512-byte interleave; `o5.gry` uses PCM16LE. Check playback with vgmstream.

The corrected audio-format evidence and limitations are documented in `original-data/FORMAT-NOTES.md` and `original-data/GRY-STRUCTURE-INDEX.md`.

## 6. Backwards-compatible legacy commands

```sh
node tools/inspect-gry-blocks.mjs original-data/gry/*.gry
```

Legacy command retained for compatibility; it now delegates to the audio-aware inspector. The previous generic-compression and terrain-block interpretation was incorrect. Use `inspect-gry-audio.mjs` directly for new work.

## 7. Inspect DPC headers and typed records

```sh
node tools/inspect-dpc-headers.mjs original-data/structs/*.dpc
node tools/inspect-dpc-records.mjs original-data/structs/anub01.dpc original-data/structs/rag01.dpc original-data/structs/flag_blu.dpc
```

The header inspector checks the `DCPMC` signature and resolves pointers using the relocation base stored at offset 12. The record inspector reads the count at offset 32, follows pointers beginning at offset 36, and reports each record's file bounds and raw kind/flag/class fields. These checks validate the record table; they do not yet decode geometry.

## 8. Validate and extract FF archive resources

First validate the archive directory and list resource offsets:

```sh
node tools/inspect-ff-archives.mjs original-data/units.ff original-data/motion.ff original-data/shelldb/*.ff
```

For archives that pass the known directory-table checks, extract each resource into a subdirectory named after its archive:

```sh
node tools/extract-ff-resources.mjs original-data/motion.ff original-data/shelldb/*.ff --out extracted-ff
```

Try `units.ff` separately as well. The extractor refuses to extract an archive if its count, table boundaries, monotonic offsets, or empty-name EOF sentinel do not match the observed format. A failed validation means this layout has not been established for that archive; it does not mean the archive is corrupt. Extracted files are raw resource payloads and may need further format-specific decoding.


## 9. Find terrain resources in loose files and FF archives

Searches the asset tree for `.GRP`/`.RMP` filenames and for the executable's expected `CPMG`/`CPMR` signatures inside loose files and FF archive payloads:

```sh
node tools/find-terrain-resources.mjs original-data > terrain-resource-search.json
```

The scanner only parses FF archives whose directory layout passes the same structural checks as the existing extractor. Any unrecognized archive layout is reported rather than guessed. Signature matches are candidates for inspection, not proof that terrain geometry is decoded.

## 10. Inspect CPMG group and CPMR ramp records

The loose `.GPC` and `.RPC` files have the same `CPMG` and `CPMR` signatures, version `0x43`, and header/count structure as the executable's group/ramp loaders. Sample files validate exactly as a 20-byte header followed by 32-byte group records or 40-byte ramp records.

```sh
node tools/inspect-grp-rmp.mjs original-data/structs/rag01.gpc original-data/structs/rag01.rpc
```

This validates record boundaries and emits raw words for analysis. A follow-up hypothesis checker now tests the candidate spatial fields and GPC-to-RPC bounds, but field meanings, corner order, scale, and mesh topology are not yet confirmed; see section 13.

## 11. Cross-reference resource names (with binary-texture false-positive control)

Run the scanner:

```sh
node tools/cross-reference-resources.mjs original-data > resource-audit.json
```

By default, the scanner excludes `.TPC` texture files because arbitrary texture bytes often contain accidental filename-shaped ASCII sequences. To inspect those binary textures experimentally, opt in explicitly:

```sh
node tools/cross-reference-resources.mjs original-data --include-tpc > resource-audit-with-tpc.json
```

Treat unresolved names as candidates for investigation, not proof of missing files. The scan only sees printable filename-like strings and does not decode binary resource references.

## 12. Validate paired GPC/RPC index ranges

A cross-file comparison of `anub01`, `anub02`, `rag01`, `rag02`, and `oasis01` found the same pattern: each 32-byte `.GPC` record contains two 16-bit values at byte offsets 24 and 26 that form an inclusive range into the paired `.RPC` record table. Across these five samples, the ranges are in bounds, sorted, contiguous, start at RPC record 0, and end at the final RPC record. For example, `rag01.gpc` ranges start `[0,10]`, `[11,15]`, `[16,20]` and finish `[678,766]`, covering all 767 records in `rag01.rpc`. This is strong evidence for a GPC-to-RPC range/index relationship, though it does not identify what the RPC records represent geometrically.

Run the validator over all paired resources:

```sh
node tools/check-gpc-rpc-pairs.mjs original-data/structs > gpc-rpc-pair-audit.json
```

The tool checks header/count equations, bounds, ordering, contiguity, and full coverage. It deliberately reports the offsets as candidate range fields rather than claiming the terrain mesh is decoded.

## 13. Test the current terrain-field hypothesis

```sh
node tools/analyze-terrain-field-hypotheses.mjs \
  original-data/structs/rag01.gpc original-data/structs/rag01.rpc \
  original-data/structs/anub01.gpc original-data/structs/anub01.rpc \
  original-data/structs/rag02.gpc original-data/structs/rag02.rpc
```

This reports whether RPC coordinate pairs fall inside the inferred GPC origin/span rectangle and whether the GPC reference value appears among the indexed RPC corner-like values. Current results support the spatial-field hypothesis across several campaign pairs, but this is still internal consistency testing, not a validated mesh decoder. See `original-data/TERRAIN-FIELD-HYPOTHESES.md` for measured results and limitations.

The checker also measures the signed 16-bit pair at RPC offsets +6/+8. The original executable's sine/cosine lookup routines are called by a record setter and write to these exact offsets; across all 8,005 RPC records, the pair's magnitude stays within 2 of 4095. Runtime reachability of that setter is not yet confirmed, but the field interpretation is strongly supported by both code and data.
The same checker tests the signed 16-bit triplet at RPC offsets +10/+12/+14 as a normal candidate; all 8,005 records also stay within 2 units of magnitude 4095, with flat records commonly using (0, 0, 4095). This is a high-confidence data-pattern inference pending a direct executable use-site.
The checker now also validates each stored normal against the normal predicted from the first three corner heights, the two dimensions, and the sine/cosine pair. The full inventory result is 8,003/8,005 with normalized dot product above 0.999; the two inverted flat normals are documented exceptions.

## 14. Export a candidate terrain mesh

```sh
node tools/export-rpc-mesh.mjs \
  original-data/structs/rag01.gpc original-data/structs/rag01.rpc \
  /tmp/rag01-corner.obj

node tools/export-rpc-mesh.mjs \
  original-data/structs/rag01.gpc original-data/structs/rag01.rpc \
  /tmp/rag01-center.obj --anchor=center

node tools/export-rpc-mesh.mjs \
  original-data/structs/rag01.gpc original-data/structs/rag01.rpc \
  /tmp/rag01-alt-diagonal.obj --diagonal=0-3
```

The exporter emits four vertices and two triangles per RPC surface, grouped by the GPC ranges. The default treats the record XY pair as the local (0,0) corner and splits the quad along corner 1–2, because this interpretation produces far more shared edges with matching endpoint heights across the campaign files, and the stored normal agrees with the first three row-major heights. The centre-anchor alternative and diagonal 0–3 remain configurable for comparison against an original terrain screenshot before choosing the final runtime implementation. Raw game units are preserved; no arbitrary scale is applied.
The checker now compares centre anchoring against local-corner anchoring by reconstructing quad corners and counting shared edges with identical endpoint heights. Across the full 34-file inventory, corner anchoring wins by a wide margin (2,297 shared edge keys / 1,872 exact-height matches versus 445 / 175 for centre anchoring).


## 15. Compare candidate geometry with an original mission map

Open `terrain-preview.html` on GitHub Pages or through a local HTTP server. The preview now has a **Top-down view** control and a collapsible **Show map reference** panel. For supported campaign maps it loads the matching original PCX mission/briefing image from `original-data/misn/` and decodes its 8-bit indexed PCX pixels in-browser.

The reference panel is an inspection aid only: these PCX files are briefing/map graphics, not ground textures, and they have not been coordinate-registered to the exported mesh. Use the side-by-side comparison to check broad shape and orientation; do not treat visual resemblance alone as proof of world scale or placement. Unsupported map variants state that no reference is mapped rather than loading a guessed filename.



## 17. Investigate nested DPC scene records

The DPC graph tools list nested pointers and numeric record classes across campaign resources. They are diagnostic only: numeric type/class IDs are kept intact rather than labelled “terrain”, “ground” or “placement” without executable evidence.

```sh
node tools/inspect-dpc-graph.mjs original-data/structs/rag01.dpc > rag01-dpc-graph.json
node tools/inspect-dpc-graph-compare.mjs original-data/structs/rag01.dpc original-data/structs/rag02.dpc original-data/structs/rag04.dpc original-data/structs/anub01.dpc original-data/structs/dead01.dpc original-data/structs/oasis01.dpc > dpc-graph-comparison.json
```

The kind-1 pointer array is based on the existing observed inspector layout. Following kind-4 pointers is tentative; compare results against executable read sites before relying on those nested edges. The inspector also follows the observed type-9/class-7012 seven-pointer list found through type-13/class-7011 records in `rag04.dpc` and `dead01.dpc`; this is sample-validated, not assumed universal. The latest six-campaign summary and unresolved class-ID leads are recorded in [`original-data/DPC-GRAPH-FINDINGS.md`](../original-data/DPC-GRAPH-FINDINGS.md).

## 4. Decode Outwars TPC image records

```sh
node tools/inspect-tpc-records.mjs original-data/units/scout_mj.tpc
node tools/decode-tpc-palette-textures.mjs original-data/units/scout_mj.tpc public/assets/outwars/scout-mj
```

The inspector validates each of the six v0x43 TCPMC record boundaries and decoded image extents. The decoder writes browser-ready indexed PNGs with RGB555 palettes and per-entry transparency. The executable's stored row width is doubled to obtain the actual image width. UV coordinates and material-to-mesh assignments are not included.

## 5. Catalogue motion resources

```sh
node tools/inspect-motion-catalog.mjs original-data/motion motion-catalog.json
```

Checks the 152-byte frame stride and inventories the 19 eight-byte entries per frame across available .MC files. The report keeps the one known declared-count mismatch (fstand2.mc) visible. It does not infer bone names or a skeleton hierarchy.

## 6. One-command Scout finalization

Run this single command from the repository root. It performs the callback/transform/executable analysis, extracts the male Scout DPC from the FF archive, exports five coordinate-base/placement candidates, validates the GLB accessors and topology counts, applies active-scene node transforms (including parent transforms) when calculating world-space bounds, and writes a comparison report, and packages all outputs.

```sh
node tools/scout-finalize.mjs \
  original-data/units.ff \
  scout-final \
  --exe /home/tapaccos/Outwars-extracted/outwars.exe
```

Main outputs:

- `scout-final/scout-candidate.glb`: owner-translated static geometry candidate.
- `scout-final/FINAL-REPORT.md` and `FINAL-REPORT.json`: validation and completion status.
- `scout-final/geometry/`: shared-pool, owner-translated, reference-point-mapped, mesh-reference-base and mesh-reference-plus-owner-translation alternatives.
- `scout-final/analysis/`: callback graph, descriptor, opcode-4/opcode-5 and executable-disassembly evidence.
- `scout-final.zip`: the complete bundle.

The exporter checks that the eight owner translation vectors match their paired-node translation fields before applying them. The candidate contains nine sections. The repeated `0x04 0x01 0x0C 0x09` pattern is treated as a face-record candidate only inside the owner-part mesh streams; it is not globally interpreted as a face record in the callback graph. Mesh indices and face/triangle counts are checked, and local/world-space bounds are recorded for every mesh. These checks establish structural validity only; they do not select a placement or prove anatomical correctness.

The output is explicitly a **static Scout candidate**, not a bit-exact runtime model. The report keeps unverified opcode-5 mesh ownership, composed runtime matrices, UVs, texture/material assignment, skinning and animation visible as unresolved. The one-command run does not require a second diagnostic upload or another assistant interpretation pass.

The historical command is now a compatibility alias for the same complete workflow:

```sh
node tools/scout-runtime-rebuild.mjs original-data/units.ff scout-final --exe /path/to/outwars.exe
```


## 7. One-run Scout closeout (coordinate + ownership + placement)

The closeout runner performs the full executable-guided discovery, exports five independent geometry controls, validates every referenced 8-byte XYZ record against the source DPC and exporter bounds, joins the legacy geometry-descriptor audit to the nine exported face streams and part-list owner records, separately tests for exact opcode-5 transform ownership, and evaluates matrix conventions against the stored mesh reference-point targets. A legacy descriptor/part-owner match is not misreported as proof of a runtime transform link.

Run once from the repository root:

```sh
node tools/scout-closeout.mjs \
  original-data/units.ff \
  scout-closeout-v2 \
  --exe /home/tapaccos/Outwars-extracted/outwars.exe
```

It writes one `scout-closeout.zip` containing the exact DPC, executable checksum, complete callback/disassembly evidence, five geometry candidates, per-mesh coordinate, legacy geometry-descriptor, part-list owner, and opcode-5 transform-link results, plus matrix validation results, and a consolidated report.

The same run now also replays the callback work stack in event order and emulates the executable's `0x4e59c8` face-record helper (variable strides, byte mask, and modulo-8 slot tags). This is analysis-only: it adds no duplicate GLB candidates. It also audits the class-specific object path: callback interpreter `0x4dfce4`, class callback `0x420b00`, class-`0x0006` setup `0x4e1ad8`, current-object setter `0x4e3260`, and object consumer `0x4e32a0` (which reads the DPC record at object+`0x160`). The report includes the eight-entry update table and slot-update routines at `0x4e40a0` and `0x4e4d5c`. The face-slot consumer at `0x514d15` extracts bits 13–15 from each face record and uses that slot to select a two-bit renderer-state flag at `+0x24`; this confirms the tag affects render-state selection. The separate eight-entry update routines build per-slot rotation matrices and apply position offsets, but their relationship to the face slots is not yet proven, and the object consumer is not yet proven to be the visual mesh renderer. The slot replay assumes the global counter starts at zero; the helper itself does not reset it, so a prior model load could change the starting tag. All event-order, slot-tag, disassembly, call/global-xref, and exact owner/mesh/paired-node evidence is included in the single ZIP.

If (and only if) all nine coordinate bases validate, all eight submeshes have exact opcode-5 transform ownership, and exactly one transform convention maps all eight reference points to their recorded targets within two game units, the tool additionally emits `geometry/scout-runtime-assembled.glb`. Otherwise it leaves the five comparison candidates intact and names the failed gate. It does not promote nearby byte-pattern or matrix-rigidity heuristics to verified runtime facts.

## 7. Lower-level Scout evidence tools

For focused investigations, the component tools remain available:

```sh
node tools/reconstruct-scout.mjs original-data/units.ff scout-reconstruction --exe /path/to/outwars.exe
node tools/inspect-scout-part-graph.mjs /path/to/scout_mj.dpc scout-part-graph.json
node tools/inspect-scout-transform-records.mjs /path/to/scout_mj.dpc
```

These are subcomponents of the one-command finalizer. Do not use the older geometry exporter by itself as proof of a complete runtime reconstruction.

## Scout runtime bridge audit

Run from the repository root:

```sh
node tools/scout-runtime-bridge.mjs \
  original-data/units.ff \
  scout-bridge \
  --exe /home/tapaccos/Outwars-extracted/outwars.exe
```

This reuses the maintained part-graph, opcode-2 callback-chain, transform-attachment, and opcode-5 decoders. It traces exact relocated DPC pointers and scans executable disassembly for functions referencing the callback scratch globals written by opcodes 1 and 2. The ZIP contains per-node pointer traces, exact pointer edges, descriptor-owner joins, and executable cross-references. These are leads for runtime-consumer analysis, not proof of rendering or final placement. Existing output is preserved and a numbered folder is selected automatically.

## Scout opcode dispatch audit

Run from the repository root:

```sh
node tools/scout-dispatch-audit.mjs \
  original-data/units.ff \
  scout-dispatch \
  --exe /home/tapaccos/Outwars-extracted/outwars.exe
```

This reads the executable's PE32 section table, locates the opcode switch's indexed DWORD jump table in the actual file bytes, decodes each case target, and matches exact handler addresses against callback targets recorded in Scout DPC opcode-2 entries. It also writes short disassembly windows for every case and lists all references to the callback scratch-table globals. The output ZIP includes the dispatch map and exact callback joins. Address matches establish dispatch routing only; they do not alone prove rendering semantics or final placement.


## Scout renderer backend probe

Run from the repository root (or pass the executable's full path):

```sh
bash tools/scout-renderer-backend-probe.sh /path/to/outwars.exe
```

The probe is read-only. It records the executable SHA-256, PE sections and imports, graphics-related strings, references to imported graphics APIs, the full disassembly, and focused windows around the previously identified Direct3D transform/render routines.

**All generated output uses one fixed repository-relative location:**

- `scout-logs/renderer-backend-probe/` — individual reports.
- `scout-logs/renderer-backend-probe.zip` — upload this archive for analysis.

The path is resolved from the script's own location, so it is the same regardless of the current working directory. Each run replaces only this probe's previous output; no logs are written to the home directory or `/tmp`.


## Scout transform slot audit

Run after the renderer backend probe, from the repository root:

```sh
node tools/scout-transform-slot-audit.mjs --exe /path/to/outwars.exe
```

The tool accepts only the verified executable SHA-256 `722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2` and Scout DPC SHA-256 `05887eae665ec9eb7da64420d549e239d23c0a81e3b27eae4f77ac655df58758`. It extracts `scout_mj.dpc` from `original-data/units.ff`, audits WORD `[opcode5_record+0x34]` slot IDs, and captures the executable's class-100 registration, table lookup and record-consumer paths.

All output is fixed under:

- `scout-logs/scout-transform-slot-audit/`
- `scout-logs/scout-transform-slot-audit.zip`

Upload that ZIP for analysis. The tool does not export, modify or promote a GLB.


## One-run parallel Scout audit (preferred bundle)

Run once from the repository root:

```sh
bash tools/scout-parallel-audit.sh "$HOME/Outwars-extracted/outwars.exe"
```

The runner is pinned to the exact executable build SHA-256
`722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2`.
It performs the renderer/backend capture, class-100 transform-slot audit,
cross-variant geometry/ownership analysis, Scout TPC inspection and decoding,
and MC motion/channel analysis. The independent geometry, texture and motion
streams run concurrently after the shared archive extraction. It also compares
DPC slot IDs against both candidate MC channel index conventions without
assigning bone or mesh names.

**One persistent output location and one upload:**

- `scout-logs/scout-parallel-audit/` — all reports, decoded texture previews and logs.
- `scout-logs/scout-parallel-audit.zip` — the single combined evidence bundle.

Intermediate extracted game resources and component output folders are removed
after they have been analysed/copied into the combined report. Do not upload the
individual component archives. Upload only the single parallel-audit ZIP.


## Scout next-stage consolidated tester

Run one complete follow-up after pulling the latest repository changes:

```bash
git pull
bash tools/scout-next-stage.sh "$HOME/Outwars-extracted/outwars.exe"
```

It runs the existing parallel geometry, renderer, texture and animation audits, then adds:
- a focused disassembly capture of the CPU software textured-polygon / scanline pipeline;
- callsite and global-reference inventories for the software fill path and renderer mode flag;
- a scan of all Scout DPC variants for both male class 100 and female class 150 opcode-5 slot registrations;
- a corrected motion catalogue summary using `entriesPerFrame`;
- explicit unresolved-link checks for Scout geometry-to-raster records and the callback tag reader.

All persistent output is written under `scout-logs/`. The single uploadable archive is:

`scout-logs/scout-next-stage.zip`

The tester requires the exact previously audited `outwars.exe` build (SHA-256 `722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2`). It does not claim a final Scout model unless the missing ownership, transform and material links are independently established.
