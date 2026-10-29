# PCX image header samples

The mission directory includes briefing/map images referenced from the `.MIS` files. PCX header fields were inspected directly:

| File | Bytes | Dimensions | Bits per pixel | Planes | Encoding |
|---|---:|---:|---:|---:|---|
| `anub01m1.PCX` | 114,766 | 1395 × 1060 | 8 | 1 | PCX RLE |
| `anub02m1.PCX` | 93,334 | 1088 × 823 | 8 | 1 | PCX RLE |
| `dead01m1.PCX` | 60,979 | 1088 × 823 | 8 | 1 | PCX RLE |
| `oasis1m1.PCX` | 49,049 | 584 × 1001 | 8 | 1 | PCX RLE |
| `rag01m1.PCX` | 198,418 | 1660 × 1556 | 8 | 1 | PCX RLE |
| `a1map.PCX` | 128,060 | 274 × 220 | 8 | 3 | PCX RLE |

All six sampled files use PCX version 5 and RLE encoding. The single-plane images have a 256-colour palette at the end of the file; the sampled `a1map.PCX` is three-plane RGB.

A converter is available at `tools/pcx-to-png.mjs`:

```sh
node tools/pcx-to-png.mjs original-data/misn/anub01m1.PCX
```

This supports 8-bit indexed single-plane and 8-bit three-plane RGB PCX files. The resulting PNGs are intended for visual inspection/reference. Their pixel dimensions and visual contents have not been used as a substitute for the still-undecoded `.GRY` terrain geometry.
