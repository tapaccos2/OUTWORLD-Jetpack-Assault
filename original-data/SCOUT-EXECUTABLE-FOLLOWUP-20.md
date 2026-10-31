# Scout executable follow-up 20 — callback type paths and six-property handler

## Source report

Based on `REPORT(20261031-072039).txt`, executable SHA-256:

`484c7dc19a6f45e81af6a85e617761e01ec64ea784b17c45f8274fccf8f6a4c3`

The report is the focused transform-tail probe, 89,847 bytes, with the complete callback disassembly through `0x4E0580`.

## Confirmed callback behavior

The callback at `0x4DFCE4` initializes/maintains a global working table at `0x12D6C74`, with count at `0x12D6C78`. Entries are 24 bytes (six DWORDs). It snapshots an existing entry, then dispatches on the leading byte of the current record through a jump table at `0x4DFCAC`.

The visible callback tail shows multiple record-type branches that emit one or more 24-byte entries. Depending on the branch, source data is read from fixed offsets or pointer arrays, and values are combined with the current six-DWORD state. Other branches apply signed shifts/scaling and/or add three-component offsets. The table is therefore a parser/intermediate-state structure, not yet proven to be the final runtime object table or a direct list of mesh transforms.

One branch checks record byte `+0x12` and calls `0x4DF970` when it equals 1. The record-type dispatch table and helper bodies need decoding before assigning semantic names to these branches.

## Six-property path

Dispatcher `0x420B00` routes property IDs `0x1019–0x101E` to `0x42140D`. That branch sets count `ECX=6`, stride `EBX=0xA0`, sets `EAX=ESI`, `EDX=EBP`, pushes 1, and calls `0x42693C`.

The current report shows `0x42693C` as a wrapper: it extracts/sign-extends arguments and calls `0x42671C`. The actual six-property semantics therefore cannot be named from the wrapper alone. The next probe must capture `0x42671C`, its downstream writer `0x42649C`, and the lookup helper `0x4778C0`.

## Transform context

The runtime-object setters remain independently confirmed:
- `0x422278` writes three DWORD position values to runtime-object offsets `+0xEC,+0xF0,+0xF4`.
- `0x4222A8` writes three WORD rotation values to `+0xE4,+0xE6,+0xE8` and rebuilds the matrix at `+0xB4`.
- `0x422754` constructs/registers a runtime object and initializes these transform fields.

No direct link has yet been established from callback table entries or property IDs `0x1019–0x101E` to those setters for Scout records. Do not reinterpret the six properties as position/rotation until the next probe proves it.

## Next probe

`tools/scout-exe-transform-paths.sh` captures:
- the callback's record-type jump table;
- the type-1 helper and record-type resolver;
- the six-property core handler and property writer;
- callback matrix/transform helpers and secondary dispatcher handlers;
- both callback entry callsites;
- raw executable occurrences of the relevant function addresses.

The aim is to decode record types and property semantics, then establish whether either path reaches the runtime-object transform setters. Until that connection is demonstrated, the Scout DPC hierarchy and transform mapping remain unresolved.
