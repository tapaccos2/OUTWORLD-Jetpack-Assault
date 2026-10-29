# DPC scene-record graph comparison

**Checked:** 2026-10-29  
**Status:** structural relationships observed; record semantics still unresolved.

## Scope and method

The nested pointer-graph inspector was run over six campaign/map DPC resources: `rag01.dpc`, `rag02.dpc`, `rag04.dpc`, `anub01.dpc`, `dead01.dpc`, and `oasis01.dpc`.

The inspector validates the top-level `DCPMC` header, relocation base, record pointer table, and nested pointer targets. It follows the observed kind-1 pointer array layout. Kind-4 traversal remains tentative: the count candidate is read at record offset `+18` and pointers from `+20`. A traversal depth limit is used to avoid treating every binary field as a pointer. Numeric type/class IDs are preserved without guessing their names.

## Comparison results

| DPC resource | Top-level records | Distinct reachable nodes | Pointer edges | Invalid pointers | Truncated |
|---|---:|---:|---:|---:|---|
| `rag01.dpc` | 6 | 119 | 114 | 0 | No |
| `rag02.dpc` | 6 | 189 | 183 | 0 | No |
| `rag04.dpc` | 5 | 189 | 207 | 0 | No |
| `anub01.dpc` | 5 | 168 | 377 | 0 | No |
| `dead01.dpc` | 5 | 121 | 116 | 0 | No |
| `oasis01.dpc` | 7 | 154 | 147 | 0 | No |

The automated browser smoke-test workflow runs the graph walker and the six-file comparison. All six files completed without an out-of-bounds pointer or depth/node-limit failure. Edge counts include multiple distinct pointer fields that may point to the same target.

## Map-specific type-13 record classes

The following type-13 class IDs were reachable in the inspected maps:

| DPC resource | Type-13 classes observed (count) |
|---|---|
| `rag01.dpc` | 5709 (1) |
| `rag02.dpc` | 5703 (1), 5709 (8) |
| `rag04.dpc` | 5601 (1), 7011 (13), 7017 (1) |
| `anub01.dpc` | None reached by this traversal |
| `dead01.dpc` | 7011 (14) |
| `oasis01.dpc` | 5601 (1), 5700 (9), 5709 (3) |

In the maps where they occur, these records are linked beneath a type-1/class-6 record. This is a useful structural lead because the class IDs vary by map, while other type/class combinations recur across campaigns. **This does not yet prove that type-13 records are ground, ramps, or terrain meshes.** Their exact fields and runtime use still need verification against the executable.

The graph also repeatedly contains type-0 records with class IDs such as 2000, 2001, 2002, 2019, 2100, 2200, 2210, 2220, 3010–3015, 3030–3031, 3040, 3042, 3050, 3071, 3091, and 4020–4035. These are recorded as recurring numeric IDs only; their meanings have not been inferred.

## What this establishes—and what it does not

- The six map DPC files contain structured, traversable pointer relationships rather than only flat opaque byte blobs.
- Several maps include a type-1/class-6 node linked to map-specific type-13 records, making those type-13 classes a concrete target for further investigation.
- The output is a pointer-graph inventory, **not** a scene decoder. It does not recover transforms, mesh vertices, materials, texture references, mission placements, or broad ground.
- Kind-4 pointer traversal is provisional until confirmed by a matching executable read site.

## Next investigation

1. Inspect the type-13 class 5700/5703/5601/5709/7011/7017 payloads across maps and match their field access patterns to executable code.
2. Check whether those records refer to `.TPC` texture data or geometry data, without assigning meaning from class IDs alone.
3. Keep the GPC/RPC terrain-surface mesh separate from the DPC scene graph until their spatial relationship is established.
