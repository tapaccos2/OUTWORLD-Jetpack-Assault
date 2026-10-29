# Extracted mission header index

These labels and resource names were read from the original binary `.MIS` files. They are the files' internal Mission Builder titles, not always the same as the campaign briefing titles. The first `.DPC` listed is the first mission-level resource string found; it is not yet proven to identify the terrain file.

| File | Internal title / label | First mission resource | Briefing/map image references |
|---|---|---|---|
| `Anub01.mis` | Legacy format: briefing text used in place of a title | `anub01.dpc` | `anub01m1.pcx` |
| `Anub02.mis` | Anubis 2 Remix | `anub02.dpc` | `anub02m1.pcx` |
| `ANUB03.MIS` | Anubis 3 Glider wing mission | `anub03.dpc` | `anub03m1.pcx` |
| `Anub04.MIS` | Anub04 | `anub04.dpc` | `anub04m1.pcx` |
| `ANUB05.MIS` | Anubis-5 Alien Tunnels | `anub05.dpc` | `anub05m1.pcx`, `anub05m2.pcx`, `anub05m3.pcx` |
| `Dead01.MIS` | Dead 1 - Save the Phoenix! | `dead01.dpc` | `dead01m1.pcx`–`dead01m4.pcx` |
| `Dead02.mis` | Oasis 1 | `dead02.dpc` | `dead02m1.pcx`–`dead02m3.pcx` |
| `DEAD03.MIS` | no description | `dead03.dpc` | `dead03m1.pcx` |
| `Dead04.mis` | Deadworld 4 - The final Mission | `dead04.dpc` | `dead04m1.pcx`, `dead04m2.pcx` |
| `Jug01.mis` | Juggernaut 1 - Sneak into the base & Capture the mastermind | `jug01.dpc` | `jug01m1.pcx` |
| `JUG02.MIS` | jug02 temp | `jug02.dpc` | `jug02m1.pcx` |
| `jug03.MIS` | Juggernaut 3 - Destroy the Queen | `jug02.dpc` | `jug03m1.pcx` |
| `Mik01.mis` | mikhal's world | `mik01.dpc` | `mik01m1.pcx` |
| `OASIS1.MIS` | Oasis 1 | `oasis01.dpc` | `oasis1m1.pcx` |
| `OASIS2.MIS` | training 2 | `oasis02.dpc` | `oasis2m1.pcx` |
| `Oasis3.MIS` | Oasis 03 - 3 npc free-for-all | `oasis03.dpc` | `oasis3m1.pcx` |
| `oasis4.mis` | no description | `oasis05.dpc` | `oasis4m1.pcx` |
| `OASIS5.MIS` | oasis 5 Defend Evac | `oasis01.dpc` | `oasis1m1.pcx` |
| `oasis6.MIS` | Oasis 6 | `oasis06.dpc` | `oasis6m1.pcx` |
| `oasis7.mis` | Oasis 7 | `oasis04.dpc` | `oasis7m1.pcx`–`oasis7m3.pcx` |
| `Rag01.MIS` | Crash on Ragnarok. | `rag01.dpc` | `rag01m1.pcx` |
| `rag02.MIS` | Destroy the reactor and Anti-Orbital Gun | `rag02.dpc` | `rag02m1.pcx` |
| `Rag03.mis` | Ragnarok 3 - the Battle for Ulysses | `rag03.dpc` | `rag03m1.pcx` |
| `RAG04.MIS` | Ragnarok 4: Search & Rescue | `rag04.dpc` | `rag04m1.pcx`, `rag04m2.pcx`, `rag04m3.pcx` |
| `rag05.mis` | Ragnarok 5 Level | `rag05.dpc` | `rag03m1.pcx` |
| `Rag06.mis` | Ragnarok 6 - Scuttling the Ulysses | `rag04.dpc` | `rag04m1.pcx`, `rag04m2.pcx`, `rag04m3.pcx` |
| `ia01.MIS` | no description | `oasis05.dpc` | No `.PCX` reference found in the mission binary |

## Format observations

- 26 files use a length-prefixed `Mission Builder v1.9` version string followed by a length-prefixed title/label.
- `Anub01.mis` uses a legacy variant: the byte `G` follows the version string, then a NUL-terminated briefing sentence appears where later files store the title.
- Some mission files intentionally reuse a level resource or map image. The file stem alone is not a safe way to infer terrain pairing.
- The table is an initial string-level index. Object placements, transforms, trigger parameters, and terrain associations remain undecoded.
