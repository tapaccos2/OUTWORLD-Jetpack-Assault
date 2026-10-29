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

Do not use any of these outputs as a claim that the map or mission has been fully decoded. The next stage is to identify and validate binary record layouts and recover terrain/object placement.

## 4. Compare terrain byte structure

```sh
node tools/inspect-gry-structure.mjs original-data/gry/*.gry
```

Reports the common file prefix, little-endian header values, every occurrence of the observed `00 A0 B9 B7` byte pattern, candidate 20-byte blocks, candidate 14-byte blocks, the proposed header-count formula, and groups files by the 64-byte signature at that occurrence. These are structural observations, not decoded fields.

## 5. Scan for candidate terrain tags

```sh
node tools/scan-gry-tags.mjs original-data/gry/*.gry
```

Searches for four-letter ASCII sequences followed by a plausible little-endian 32-bit length and reports candidate payload bytes plus both integer byte orders. Current scans find repeated `fact`/length-4 candidates in nine of the ten readable terrain files; this is a lead, not a proven chunk specification.

The full current evidence and limitations are documented in `original-data/FORMAT-NOTES.md`.
