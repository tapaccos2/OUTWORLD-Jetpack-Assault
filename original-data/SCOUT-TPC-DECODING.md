# Scout texture decode

**Status: complete for the male Scout TPC variants tested (scout_mj, scout_ma, scout_md).**

tools/decode-tpc-palette-textures.mjs decodes the six image records in a version-0x43 TCPMC file into browser-ready indexed PNG files.

## Validated structure

- The TPC header stores the record count at offset 0x0c; the first record begins at 0x10.
- Each outer record stores a size at its start; the next record begins at offset + size + 4.
- Each record has a 256-entry little-endian RGB555 palette at +24.
- The inner image header begins at +536; its payload-size word is followed by a reserved word and stored width/height.
- The executable doubles the stored width. Actual image width is storedWidth * 2.
- Pixel bytes begin at +548; each byte is an index into that record's 256-colour palette. Palette word zero is transparent.
- The inner payload size equals 12 + decodedWidth * height; the outer record extent equals the payload start plus pixel byte count.

All six record boundaries and image extents validate exactly for each of the three tested male Scout variants.

## Scout MJ image sizes

| Image | Dimensions |
|---|---:|
| 1 | 128 × 64 |
| 2 | 64 × 128 |
| 3 | 256 × 256 |
| 4 | 128 × 128 |
| 5 | 64 × 64 |
| 6 | 64 × 64 |

The output PNGs preserve indexed colour and per-palette-entry transparency. This decodes the source images; it does not yet establish UV coordinates or material-to-mesh assignments.

## Usage

    node tools/decode-tpc-palette-textures.mjs units/scout_mj.tpc public/assets/outwars/scout-mj

The tool writes texture-01.png through texture-06.png plus manifest.json.
