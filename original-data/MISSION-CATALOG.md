# Original mission briefing catalog

Built from the paired `.txt` mission overview files in `original-data/misn/`. This catalog is a navigation aid, not a decoded mission map. Locations are transcribed from the source files; summaries are concise descriptions of the briefing text.

| Mission | Location from briefing | Mission intent |
|---|---|---|
| Anubis 01 | Hobb's Mining Colony, Anubis | Search for surviving colonists using locator beacons, evacuate them, and engage alien forces. |
| Anubis 02 | East of Hobb's Colony | Destroy alien silos with timed charges, suppress gun emplacements, and protect the arriving science team. |
| Anubis 03 | West of Anubis Mines | Use glider-wing pods to clear anti-air defenses around a mine entrance so a strike ship can unseal it. |
| Anubis 04 | Colony Mines, Anubis | Secure the location where miners breached an alien base and destroy nearby hostiles. |
| Anubis 05 | Enemy Hive, Anubis | Enter the alien base, find Echo Team, and locate an alternate exit after the mine entrance collapses. |
| Dead 01 | Phoenix Main Deck | Stop Hydran boarders from reaching the mothership's engine compartments. |
| Dead 02 | Oasis Military Research Facility | Infiltrate the enemy installation linked to a planetary rail gun and orbital station. |
| Dead 03 | Not stated in the overview file | Reach the rail-gun entrance, destroy five heat sinks, and force open a secondary vent. |
| Dead 04 | Inside the Hydran Rail Gun | Descend through the rail gun and sabotage its control core before it targets Earth. |
| Juggernaut 01 | Alien Vessel, Codenamed Juggernaut | Infiltrate the alien vessel while the enemy's forces are concentrated elsewhere. |
| Juggernaut 02 | Alien Vessel, Codenamed Juggernaut | Lead the assault on the alien Queen while an engineering team targets the reactor. |
| Juggernaut 03 | Alien Vessel, Codenamed Juggernaut | Fight through alerted defenses, destroy the Queen, and return to the hangars. |
| Mikhal 01 | Mikhal's World Outpost | Instant-action scenario simulating the alien attack on the observation station. |
| Oasis 01 | Oasis Training Area A | Learn rocket-pack flight through short, controlled hops. |
| Oasis 02 | Training Area B | Complete a timed mobility and target-acquisition exercise. |
| Oasis 03 | Oasis Command Center / Auxillary Training Area | Survive a four-soldier simulated free-for-all. |
| Oasis 04 | Training Area C | Practice teamwork and stealth while approaching an experienced instructor. |
| Oasis 05 | Oasis Training Area A | Defend a damaged dropship and its personnel until evacuation is possible. |
| Oasis 06 | Oasis Command Center / Reactor Core | Recover sensitive technology and information from an occupied command installation during evacuation. |
| Oasis 07 | Oasis Military Research Facility | Infiltrate the research facility and extract glider-pod prototypes. |
| Ragnarok 01 | Ragnarok LZ | Secure a landing zone and destroy a partially underground enemy base during fleet bombardment. |
| Ragnarok 02 | Anti-Orbital Installation, Ragnarok | Disable the shield source protecting an anti-orbital gun, then destroy the gun. |
| Ragnarok 03 | Exterior, Ulysses Crash Site | Clear Hydran forces from the crash area so rescue and recovery can begin. |
| Ragnarok 04 | Interior, Ulysses Crash Site | Rescue Captain Russell and recover intelligence from inside the wrecked Ulysses. |
| Ragnarok 05 | Exterior, Ulysses Crash Site | Protect salvage crews while a demolition team attempts to scuttle the Ulysses. |
| Ragnarok 06 | Interior, Ulysses Crash Site | Return to the engine room, activate a final demolition charge, and escape. |

## Asset relationships found in the binary mission files

Readable strings inside the `.MIS` files contain resource references such as `.DPC` unit/scene resources and `.PCX` briefing/map images. For example, `Anub01.mis` references `anub01.dpc`, several unit `.dpc` files, and `anub01m1.pcx`. This confirms that mission logic depends on assets outside the mission file alone.

## Important limitation

The briefing text is not the same as the mission's actual object placement or terrain. Full reconstruction still requires decoding binary `.MIS` records and identifying the actual terrain asset format. The `.GRY` files are sound-effect audio containers, not terrain data; referenced resources must be matched to their original files. The current inspector script only inventories byte offsets, printable strings, resource references, and initial GRY audio-container bytes; it is not yet a full decoder.
