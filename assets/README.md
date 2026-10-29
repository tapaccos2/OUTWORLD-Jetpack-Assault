# OUTWORLD assets

Runtime assets belong in this directory and are referenced with paths relative to the site root.

- `models/` — glTF 2.0 binary models (`.glb`) for the marine, Hydrans, weapons and environment props.
- `textures/` — PBR texture sets (base colour/albedo, normal, roughness, ambient occlusion, and metalness where applicable).
- `audio/` — sound effects and ambience.

Prefer compact `.glb` files and 1K textures for the Raspberry Pi 5 target. Record each asset's source, author and license in `ASSET-LICENSES.md` before shipping it. Do not add third-party assets without confirming redistribution rights.
