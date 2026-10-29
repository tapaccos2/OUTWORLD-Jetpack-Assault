# Third-party asset licenses

| Asset | Source | License | Use |
|---|---|---|---|
| Rock001/002/003, Cliff001/002, Hill001 | [Gobkit Free 3D Assets](https://github.com/Ariescar/gobkit-free-assets) | CC0 1.0 Universal | Environment props |
| Tactical soldier model (`soldier_tac.glb`) | [DanlyVostok — Military tactical suit](https://sketchfab.com/3d-models/military-tactical-suit-lowpolygameready-ef698ce36b1545a78ce592dd3db4c7ed), served via [3d-fps](https://github.com/cktang88/3d-fps) | CC BY 4.0 | Third-person player character |
| First-person arms and rifle (`smg45_rifle_arms.glb`) | [DJMaesen — FPS animated SMG](https://sketchfab.com/3d-models/fps-animated-smg-ea3dad7478624495a5a46f40127b0579), adapted via [3d-fps](https://github.com/cktang88/3d-fps) | CC BY 4.0 | First-person arms/weapon viewmodel |

The character and first-person weapon assets are loaded as GLB models from the upstream public repository. Their original geometry and textures are used; the game does not generate replacement soldier body parts. Attribution for CC BY 4.0 assets is retained here. The game uses Three.js GLTFLoader to load and animate compatible clips.
