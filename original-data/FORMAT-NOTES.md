# Binary format investigation notes (work in progress)

## Mission files (`.MIS`)

Observed across Anubis, Oasis, Dead, Juggernaut and Ragnarok mission files:

- The first byte is a length byte for the ASCII version string.
- The following bytes spell `Mission Builder v1.9` (20 bytes). In `Anub01.mis`, the next byte is `G`, indicating a variant/version suffix rather than a new title-length byte.
- Most files then have a one-byte length followed by a readable mission title, e.g. `Anubis 2 Remix`, `Anubis 3 Glider wing mission`, `Anubis-5 Alien Tunnels`, and `Dead 1 - Save the Phoenix!`.
- The mission title/briefing area is followed by null bytes and a repeated binary header region. Later sections contain resource names, object/unit definitions, positions/parameters, and event/trigger names.
- Resource names observed include mission-specific `.DPC` files and briefing/map `.PCX` files. Mission event names are also stored as readable strings, but the data around them is binary and must be parsed to recover their parameters and links.

This is enough to start a parser at the header, but not enough to safely decode object placement or mission logic. The parser must be validated against multiple missions and cross-referenced with in-game/asset data.

## Sound-effect files (`.GRY`)

The `.GRY` files are **sound-effect audio containers, not terrain geometry**. A format-research post explicitly identifies the Outwars files as sound effects and provides vgmstream playback settings: [ZenHAX — GRY files (Twisted Metal 2, Jet Moto, and Outwars)](https://zenhax.com/viewtopic.php@t=13514.html).

The exact embedded-record marker is `A0 B9 B7 00`. Most files contain MS ADPCM audio records; `o5.gry` contains PCM16LE audio. The `2E 3E 9D 00` marker is followed by a 32-bit little-endian stream size. For MS ADPCM records, that marker is at relative offset `+70` and audio begins at `+78`; for `o5.gry`, the marker is at `+24` and audio begins at `+32`.

Earlier analysis incorrectly treated these records as terrain blocks and tested their payloads with generic compression codecs. That test was aimed at the wrong data type: MS ADPCM is an audio codec, not zlib/Deflate/gzip/Brotli compression. No vertices, heights, faces, materials, or world coordinates have been decoded from these files.

See [`GRY-STRUCTURE-INDEX.md`](GRY-STRUCTURE-INDEX.md) for per-file counts, verified record boundaries, and extraction instructions.

## Supporting files

The mission directory also contains human-readable `.txt` briefings and `.PCX` map/briefing images. The briefing catalog in `MISSION-CATALOG.md` records the location and high-level objective from each available overview. Those descriptions help identify which mission is being examined, but do not substitute for actual coordinates and triggers.

## Current tools

Run:

```sh
node tools/inspect-original-data.mjs original-data > original-data-inventory.json
```

The script inventories readable strings and raw headers. It is deliberately described as an inventory tool, not a complete decoder.


## GRY audio investigation and tools

The corrected byte-level scan verified 35 embedded sound records across ten files. All 35 data-size fields end exactly at the next record start, or four bytes before EOF for the final record. The files are mono at 22,050 Hz in the inspected records; MS ADPCM records use a 512-byte interleave. `o5.gry` is the PCM16LE exception.

Use the audio-aware inspector and optional extractor:

```sh
node tools/inspect-gry-audio.mjs original-data/gry/*.gry
node tools/inspect-gry-audio.mjs --extract extracted-gry-audio original-data/gry/*.gry
```

The extractor writes individual `.vgmstream` records and `.txth` sidecars based on the community playback settings. Validate playback with vgmstream. The `oc.gry` file was previously scanned as containing 132 candidate records, but its binary body was not revalidated during the current pass.

Terrain geometry remains undecoded and must be investigated in the appropriate asset format; the `.GRY` files are not evidence of a terrain decoder.
