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
