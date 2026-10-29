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

The original mission and terrain files are being analyzed separately from the browser prototype. Current byte-level findings and limitations are tracked in:

- [Terrain structure index](original-data/GRY-STRUCTURE-INDEX.md)
- [Binary format notes](original-data/FORMAT-NOTES.md)
- [Mission catalog](original-data/MISSION-CATALOG.md)
- [Missing asset requirements](original-data/ASSET-REQUIREMENTS.md)
- [Inspection tools](tools/README.md)

The terrain files are **not yet decoded into actual vertices/heights**. The prototype should not be described as a faithful original-level rebuild until the terrain and mission placement formats have been decoded and validated.
