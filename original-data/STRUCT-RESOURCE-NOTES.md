# Structure-resource format observations (work in progress)

## Inventory

The current repository contains 142 files under `original-data/structs/`:

- 37 `.DPC`
- 34 `.GPC`
- 34 `.RPC`
- 37 `.TPC`

The repository also now contains `original-data/units.ff` (9,468,892 bytes) and `original-data/motion.ff` (935,386 bytes), plus 20 `.FF` files under `original-data/shelldb/`.

## Initial binary signatures

A byte-level inspection of small representative files found these first four bytes:

| Extension | Example | First four bytes (hex) | ASCII view |
|---|---|---|---|
| `.DPC` | `cyball1.dpc` | `44 43 50 4d` | `DCPM` |
| `.GPC` | `anub01.gpc` | `43 50 4d 47` | `CPMG` |
| `.RPC` | `anub01.rpc` | `43 50 4d 52` | `CPMR` |
| `.TPC` | `cyball1.tpc` | `54 43 50 4d` | `TCPM` |

The following bytes differ by resource and appear to contain binary metadata. These observations identify repeatable signatures but do **not** yet establish the full file layout, compression method, geometry representation, or texture encoding.

## Initial interpretation limits

- The `.DPC` and `.TPC` examples contain substantial binary payloads; printable-string extraction alone is not enough to decode them.
- The `.GPC` and `.RPC` examples also begin with stable type-specific signatures and have different sizes, so they should be parsed separately rather than treated as interchangeable files.
- The names of the files suggest campaign/level groupings, but filenames alone do not prove how the resources are linked at runtime.
- `units.ff` and the shell database archives are present in the repository, but their internal directory/table structure has not yet been decoded.

## Next checks

1. Compare the first 64–128 bytes of several files per extension to distinguish common headers from per-file fields.
2. Check whether the apparent 32-bit fields are offsets, lengths, identifiers, or checksums by validating them against actual file sizes and repeated records.
3. Search decoded binary payloads for references to companion resource names, while treating any inferred relationship as provisional until cross-checked.
4. Keep terrain decoding separate: the `.GRY` format remains the blocker for reconstructing a real terrain surface.

No model or texture decoder is claimed by this note. It records initial observations to support reproducible format analysis.
