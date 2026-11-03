# OUTWORLD: Jetpack Assault

Browser-based 3D sci-fi shooter prototype inspired by classic jetpack infantry games.

## Project layout

- `index.html` — page shell and HUD.
- `styles/game.css` — HUD and responsive control styling.
- `src/main.js` — Three.js scene, player controls, weapons, combat and enemy behaviour.
- `src/assets.js` — asynchronous glTF environment asset loader.
- `assets/models/`, `assets/textures/`, `assets/audio/` — asset staging folders and notes.
- `ASSET-LICENSES.md` — third-party asset/license ledger.

## Run

Serve the repository over HTTP(S), for example with GitHub Pages or a local static server. The game now uses ES modules and therefore should not be opened directly using a `file://` URL.

Three.js and GLTFLoader are loaded from jsDelivr. Three environment props (two rock variants and a cliff) are loaded from Gobkit's public CC0 1.0 glTF pack at runtime. Those props require an internet connection. If they fail to load, the procedural environment remains as fallback.

## Controls

- **W A S D** — move
- **Right mouse drag / mouse lock** — aim
- **Click** — fire
- **Space** — jump
- **Shift** — jetpack
- **V** — switch camera
- **Esc** — release pointer lock

Mobile touch controls are available in the game UI.

## Current limitations

The imported glTF props are environment assets only. The player marine and Hydran enemy are still project-generated geometry; dedicated high-quality character and weapon models have not yet been integrated. The environment asset URLs are currently remote rather than bundled locally, so the current build is not fully self-contained/offline.

## Original Outwars data investigation

The original mission files and sound-effect audio containers are being analyzed separately from the browser prototype. The `.GRY` files are audio, not terrain geometry. Current byte-level findings and limitations are tracked in:

- [GRY audio-container index](original-data/GRY-STRUCTURE-INDEX.md)
- [Binary format notes](original-data/FORMAT-NOTES.md)
- [Mission catalog](original-data/MISSION-CATALOG.md)
- [Missing asset requirements](original-data/ASSET-REQUIREMENTS.md)
- [Inspection tools](tools/README.md)
- [Interactive terrain reconstruction preview](terrain-preview.html)
- [Candidate mesh exporter](tools/export-rpc-mesh.mjs)

The GPC/RPC terrain-surface layout is now decoded far enough to export candidate vertices and triangles: dimensions, orientation, normals, four corner heights, and the XY corner anchor cross-validate across all 34 resource pairs. Use [the terrain field analysis](original-data/TERRAIN-FIELD-HYPOTHESES.md) and [the candidate mesh exporter](tools/export-rpc-mesh.mjs). The exported geometry has not yet been visually validated against an original in-game map, and terrain textures, exact mission placement, absolute world scale, and any additional collision/terrain layers remain unfinished. The prototype should not yet be described as a faithful original-level rebuild.

The terrain preview is a separate diagnostic page, so it does not alter the playable prototype. Open it through a static HTTP(S) server, select a map, and compare corner/centre anchoring and the two triangle diagonals; wireframe, GPC-group colours, and stored normals can be toggled while orbiting the model.


## Scout DPC browser inspector

Use [Scout DPC Inspector](./scout-inspector.html) to inspect `extracted-ff/units/scout_mj.dpc` directly in a browser. It parses the selected file locally (no upload or server processing), lists transform roots and attachment descriptors, and renders selectable coordinate samples as a 3D point cloud. The inspector shows transform matrices and opcode-4 child payloads but deliberately does not infer triangles or export a GLB: mesh topology and the exact coordinate-block boundaries still need to be established from the runtime data.

Open the page through the same static HTTP(S) server used for the game, choose `scout_mj.dpc`, then select a transform root and attachment descriptor. The coordinate start and sample-count controls are diagnostic views only; they do not claim a final vertex count or byte layout.


## Scout runtime handler audit

After running [Scout dispatch audit](tools/scout-dispatch-audit.mjs), run [Scout handler semantics audit](tools/scout-handler-semantics.mjs) to extract each verified opcode handler up to the next distinct dispatch target. The report includes the complete bounded opcode-2 block, branches, calls, and scratch-global references. It is a static data-flow audit; it does not claim final mesh placement.

```bash
node tools/scout-handler-semantics.mjs scout-dispatch/SCOUT-DISPATCH-AUDIT.json scout-handler-semantics --exe /home/tapaccos/Outwars-extracted/outwars.exe
```


## Scout scratch data-flow audit

After the dispatch and handler audits, run [Scout scratch data-flow audit](tools/scout-scratch-dataflow.mjs). It inventories all executable references to the three scratch globals and captures the dispatcher and opcode-2 handler contexts. It confirms the six-DWORD, 0x18-byte scratch record layout without assigning speculative meanings to its fields.

```bash
node tools/scout-scratch-dataflow.mjs scout-dispatch/SCOUT-DISPATCH-AUDIT.json scout-scratch-dataflow --exe /home/tapaccos/Outwars-extracted/outwars.exe
```


## Scout opcode handler map

Run [Scout opcode handler map](tools/scout-opcode-handler-map.mjs) after the dispatch audit. It inventories all 14 opcode handlers, their bounded linear instruction ranges, register-relative memory offsets, calls, branches, and associated Scout DPC callback records. The report deliberately distinguishes address-range boundaries from true compiler function boundaries and does not guess register roles.

```bash
node tools/scout-opcode-handler-map.mjs scout-dispatch/SCOUT-DISPATCH-AUDIT.json scout-opcode-handler-map --exe /home/tapaccos/Outwars-extracted/outwars.exe
```


## Scout nested descriptor dispatch trace

Run [Scout nested descriptor audit](tools/scout-nested-descriptor-audit.mjs) after the dispatch audit. It extracts the Scout DPC callback chain, resolves each nested descriptor pointer, reads its opcode byte, and joins it to the executable jump table. It groups duplicate handler destinations and captures each unique handler entry plus direct callee windows. This avoids treating shared dispatcher continuations or jump-table aliases as separate handler bodies.

```bash
node tools/scout-nested-descriptor-audit.mjs original-data/units.ff scout-dispatch/SCOUT-DISPATCH-AUDIT.json scout-nested-descriptor-audit --exe /home/tapaccos/Outwars-extracted/outwars.exe
```


## Scout Opcode 0 control-flow audit

Run [Scout Opcode 0 CFG audit](tools/scout-opcode0-cfg-audit.mjs) after the dispatch audit. Unlike the earlier linear-range handler inventory, this follows decoded instruction lengths and direct branch edges, stops at other verified dispatch entries, and analyzes direct callees separately. It is intended to inspect the child-descriptor handler and the routine it calls without treating the entire remaining executable as one function.

```bash
node tools/scout-opcode0-cfg-audit.mjs scout-dispatch/SCOUT-DISPATCH-AUDIT.json scout-opcode0-cfg-audit --exe /home/tapaccos/Outwars-extracted/outwars.exe
```


## Scout descriptor preparation audit

Run [Scout descriptor preparation audit](tools/scout-descriptor-preparation-audit.mjs) to correlate the Opcode 0 callee at 0x4e59c8 with each nested Scout descriptor. It extracts the DPC, walks the variable-stride records referenced by descriptor fields +0x0C and +0x10, and reports the fields changed by the preparation routine.

```bash
node tools/scout-descriptor-preparation-audit.mjs original-data/units.ff scout-descriptor-preparation-audit --exe /home/tapaccos/Outwars-extracted/outwars.exe
```


## Scout preparation-record pointer map

Run [Scout preparation-record pointer map](tools/scout-preparation-pointer-map.mjs) after the descriptor-preparation audit. It extracts the DPC, inspects each unique physical record reached by the 16 descriptors, maps DPC-relative pointer fields, and cross-references targets against the known geometry-descriptor and opcode-5 transform inventories.

```bash
node tools/scout-preparation-pointer-map.mjs \
  original-data/units.ff \
  scout-descriptor-preparation-audit/SCOUT-DESCRIPTOR-PREPARATION-AUDIT.json \
  scout-bridge/analysis/transform-attachment-audit.json \
  scout-preparation-pointer-map
```


## Scout preparation target graph

Run [Scout preparation target graph](tools/scout-preparation-target-graph.mjs) after the preparation pointer map. It extracts the Scout DPC, captures 128-byte target windows, finds nested DPC-relative pointer candidates to depth two, and inventories aligned inbound references.

```bash
node tools/scout-preparation-target-graph.mjs \
  original-data/units.ff \
  scout-preparation-pointer-map/SCOUT-PREPARATION-POINTER-MAP.json \
  scout-descriptor-preparation-audit-3/SCOUT-DESCRIPTOR-PREPARATION-AUDIT.json \
  scout-preparation-target-graph
```


## Scout transform-attached descriptor audit

Run [Scout transform-attached descriptor audit](tools/scout-transform-attached-descriptor-audit.mjs) to inspect the separate Opcode-2 descriptors attached beneath Opcode-5 transform nodes. This decodes each opcode-0 descriptor's +0x0C array pointer and +0x10 iteration count, then follows the same variable-stride record preparation logic used by the part-graph descriptor audit.

```bash
node tools/scout-transform-attached-descriptor-audit.mjs \
  original-data/units.ff \
  scout-bridge/analysis/transform-attachment-audit.json \
  scout-transform-attached-descriptor-audit
```


## Latest Scout renderer integration findings

The latest uploaded Scout next-stage audit confirms that the CPU software textured-polygon renderer is called from the main scene traversal when renderer mode flag `0x1355BB4` is zero; the nonzero route selects the hardware renderer. The exact menu option to mode-flag dataflow and the conversion from Scout DPC geometry into the runtime A0/B0 polygon-object layout are still being traced. See [Scout investigation 29](original-data/SCOUT-INVESTIGATION-29.md) for exact addresses, the object data layout and the male/female DPC slot comparison.
