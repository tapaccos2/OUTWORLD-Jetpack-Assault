# Outwars `.GRY` audio-container index

## Corrected identification

**The `.GRY` files are sound-effect audio containers, not terrain geometry.** This was established by comparing the binary records with the extraction format posted in the ZenHAX thread [“GRY files [Twisted Metal 2, Jet Moto, and Outwars]”](https://zenhax.com/viewtopic.php@t=13514.html). That post explicitly identifies the Outwars files as sound effects and gives vgmstream settings for MS ADPCM in every file except `o5.gry`, which is PCM16LE.

The current repository investigation initially treated the records as terrain and tested their payloads with generic compression libraries. That was the wrong model: the payloads are encoded audio. The failed zlib/Deflate/gzip/Brotli tests do not indicate a proprietary terrain compressor.

## Container and record framing

- All inspected files begin with `27 70 06 03`.
- Each embedded sound record begins with the exact four-byte marker `A0 B9 B7 00`. Earlier scans recorded the preceding byte as part of the signature, making reported record starts one byte too early.
- Outwars MS ADPCM records have `2E 3E 9D 00` at record-relative offset `+70`. The following four bytes are a little-endian audio stream size, and the audio payload begins at `+78`.
- `o5.gry` is the PCM16LE variant: the data marker is at relative offset `+24`, its four-byte size follows, and the payload begins at `+32`.
- MS ADPCM records contain `fact`, followed by a four-byte length of `4` and a four-byte value that behaves like decoded PCM byte length. This value is roughly twice the encoded stream size; it is not terrain metadata.
- For all 35 records in the ten files whose bytes were inspected directly, `payloadOffset + streamSize` lands exactly on the next record start, or four bytes before EOF for the last record.
- Files end with the four-byte trailer `22 75 28 03`. The byte immediately before that trailer belongs to the final audio payload, not to the trailer.

## Validation across ten files

| File | Bytes | Sound records | Codec | Channels | Sample rate | Interleave | Boundary checks |
|---|---:|---:|---|---:|---:|---:|---:|
| `Q.gry` | 87,615 | 4 | MS ADPCM | 1 | 22,050 Hz | 512 | 4/4 pass |
| `a2.gry` | 49,142 | 2 | MS ADPCM | 1 | 22,050 Hz | 512 | 2/2 pass |
| `d4.gry` | 411,857 | 13 | MS ADPCM | 1 | 22,050 Hz | 512 | 13/13 pass |
| `j1.gry` | 4,082 | 1 | MS ADPCM | 1 | 22,050 Hz | 512 | 1/1 pass |
| `o2.gry` | 71,108 | 4 | MS ADPCM | 1 | 22,050 Hz | 512 | 4/4 pass |
| `o5.gry` | 142,611 | 1 | PCM16LE | 1 | 22,050 Hz | — | 1/1 pass |
| `o7.gry` | 148,294 | 4 | MS ADPCM | 1 | 22,050 Hz | 512 | 4/4 pass |
| `r1.gry` | 77,150 | 1 | MS ADPCM | 1 | 22,050 Hz | 512 | 1/1 pass |
| `r2.gry` | 28,329 | 3 | MS ADPCM | 1 | 22,050 Hz | 512 | 3/3 pass |
| `r6.gry` | 36,962 | 2 | MS ADPCM | 1 | 22,050 Hz | 512 | 2/2 pass |

The 2,603,540-byte `oc.gry` was previously scanned as having 132 candidate records, but its binary body was not available through the repository connector for the same byte-by-byte verification in this pass. Do not treat that count as newly revalidated here.

## Tools

Inspect sample records and verify their boundaries:

```sh
node tools/inspect-gry-audio.mjs original-data/gry/*.gry
```

Extract individual sample records as `.vgmstream` files with `.txth` sidecars for playback experiments:

```sh
node tools/inspect-gry-audio.mjs --extract extracted-gry-audio original-data/gry/*.gry
```

The sidecar settings follow the community post above. Playback should be checked with vgmstream; this tool extracts records and validates framing, but does not itself decode PCM samples.

## What this does and does not establish

The audio-container interpretation, codec distinction, sample metadata offsets, and record boundaries are supported by the file bytes and the cited extraction notes. No terrain vertices, heightmaps, triangles, materials, or world coordinates have been decoded from `.GRY`, because these files are sound-effect assets. Terrain geometry, if stored elsewhere, remains a separate investigation.
