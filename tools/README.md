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
