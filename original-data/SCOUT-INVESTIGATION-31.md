# Outwars Scout investigation 31

Date: 2026-11-03

## Frame update order

The main frame loop at `0x47A82E` calls `0x4DF338` with:

- EAX = scene root global `0x5299C4`
- EDX = 0

Later in the same frame loop, at `0x47A8AD`, it calls `0x4E427C` with the same scene root. This establishes the ordering: the `0x4DF338` scene/object update runs before the `0x4E427C` frame rendering traversal.

## What 0x4DF338 does

The routine at `0x4DF338` saves the supplied root in EBP and resets per-frame work counters and state. It then obtains the current object through `0x4CC834` (which returns the current-object global at `0xF90018`).

For the current object and associated nested objects it:
- reads an object-owned pointer at `+0x160`;
- follows object/child entries and copies 12 DWORDs beginning at child/object offset `+0x3C` into work records (a 12-word block consistent in size with a 3x4 matrix, although exact semantic layout is not fully named);
- calls `0x4DDB1C` to process the associated hierarchy/object records;
- maintains bounded per-frame lists and counts in globals around `0x12D6A1C` and `0x12D6A20`;
- eventually calls `0x4D4E58` with the collected work list, count and matrix/context buffers.

The routine is part of the scene update path; it should not be described as the Scout-specific renderer by itself. The root is the overall scene root, and its object traversal can include different object classes.

## What 0x4DDB1C does

The function beginning at `0x4DDB1C`:
- receives an object/node pointer in EAX and an associated data/context pointer in EDX;
- copies a 12-DWORD transform block from node offset `+0x24` into the per-frame matrix work area;
- pushes matrix/context pointers and child metadata onto a bounded traversal stack;
- recursively/iteratively walks child records and builds 32-byte work entries in global array `0x12BA6D8` (the records include pointer/metadata fields copied from hierarchy entries).

This is a concrete runtime hierarchy walk and matrix-work builder, not a speculative mesh-to-bone mapping.

## Relationship to the Scout 18-channel table

Previously established Scout class-specific opcode-5 registrations:
- class 100 for male Scout files;
- class 150 for female Scout/test files;
- 15 populated values in an 18-slot table, with missing values `[3,4,8]`;
- values in identical order across all seven variants.

The sampler at `0x415810` operates on an instance whose `+0x134` field points to the per-instance channel-state area. It loops 18 rows at 0x14-byte spacing (0x168 total extent), updates per-channel cursors and calls `0x415134` for channel sample/interpolation work.

That confirms the 18-row animation cursor is an instance-level animation system. The current evidence does **not** yet show the exact pointer or method call linking this sampler's updated channel values to the 12-DWORD node transform blocks consumed by `0x4DDB1C`.

## Important separation of evidence

The following pieces now exist and must remain distinct until a direct pointer/data-flow link is established:

1. DPC opcode-5 class-indexed 18-channel registration.
2. Per-instance 18-row animation cursor and interpolation state at object offset `+0x134`.
3. Main frame update traversal at `0x4DF338`.
4. Hierarchy/matrix work builder at `0x4DDB1C`.
5. 32-byte object work-list generation and downstream object preparation at `0x4D4E58`.
6. Scene-render traversal at `0x4E427C`.
7. Software polygon construction/raster pipeline reached from the software rendering branch.

These are now plausible stages of one scene/model pipeline, but the precise hand-off from the Scout animation channels to the hierarchy matrices and then to the Scout-specific geometry remains unproven.

## Next work

Trace the actual calls or vtable entries that invoke `0x415810`, inspect the per-instance `+0x134` state allocation/initialization, and find where those channel values write into the hierarchy's 12-DWORD transform blocks. Then follow the corresponding object/work-list records into the scene renderer. The key test is whether a Scout class-100/150 DPC transform record can be traced to one of the 32-byte entries created by `0x4DDB1C` and then to an A0/B0 polygon object.

No further Pi diagnostic is justified yet. The uploaded executable disassembly and DPC evidence are sufficient for this next pass.
