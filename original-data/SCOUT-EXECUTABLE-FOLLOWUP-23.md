# Scout executable follow-up 23 — DPC callback opcode bridge

Date: 2026-10-31
Executable SHA-256: `484c7dc19a6f45e81af6a85e617761e01ec64ea784b17c45f8274fccf8f6a4c3`
Source report: `REPORT(20261031-073004).txt`

## Important correction: callback dispatch byte is not the DPC class

The callback at `0x4DFCE4` dispatches using **record byte +0**, through the 14-entry table at `0x4DFCAC`. The WORD at `+2` is separately copied/read as a record class/type value. These are two independent fields.

This matters because the Scout DPC exporter validates type-2 nodes as `byte[0] == 2` and `WORD[+2] == class`. Therefore, if one of those type-2 nodes is passed to this callback, it selects callback table entry 2, target `0x4DFEF3`. It is incorrect to call callback table entry 2 a "DPC type-2 handler" without retaining this distinction: it is a byte-zero opcode handler that happens to receive records whose class WORD may also be 2.

## Callback entry 2: `0x4DFEF3`

Observed behavior:
- Saves the record pointer from stack argument `[esp+0x60]`.
- Reads its WORD at `+2` into the working class value.
- Reads a DWORD from record `+0x10` and treats it as a loop bound.
- Reads a pointer from record `+0x14`; each iteration advances through that pointed structure in 4-byte steps.
- For each element it reads a DWORD at element `+8` and writes six DWORDs into a 24-byte-stride working entry at global base `0x12D6C74`.
- Updates the working-entry count at `0x12D6C78`.

This is materially different from the matrix-building callback branch at `0x4E0130` (byte-zero opcode 5). The latter reads a 3x3 matrix at record `+4`, adds values at `+0x28/+0x2C/+0x30` to the current position, and calls matrix helpers `0x4C6610`, `0x4C57DC`, and `0x4C5AA0`.

## Parser path and what it proves

The DPC parser at `0x422170` validates the `DCPM` signature and version `0x43`, then invokes relocation handling (`0x4DD470`) and callback `0x4DFCE4` from its record-processing loop at `0x4221E7–0x422202`. A second callsite exists at `0x420A53–0x420A70`.

The callback prelude at `0x4DFCE4` snapshots 12 DWORDs of global callback state, copies the incoming record/arguments into a 24-byte working entry, then iterates entries and dispatches by byte zero. This establishes a parser-to-callback route, but the current disassembly does not yet prove that each of the eight Scout mesh nodes reaches the callback with the expected incoming pointer and arguments. The next test must verify that on actual Scout DPC bytes.

## Runtime transform consumer

The routine at `0x4E32A2` reads the active object pointer from `0x12D7368`, requires its `+0x160` field to be non-null, then writes a 28-byte record into a global buffer based at `0x52D28C`. Its later path recognizes a record whose byte `+7` is 1 and whose high byte of DWORD `+2` is `0xFE`, then calls `0x4C6610` using a matrix at record `+0x10`. This is a concrete runtime matrix consumer. The current evidence still does not link this runtime record to the Scout DPC's type-2 mesh/paired nodes.

## Next required proof

Do not alter the GLB exporter yet. For each of the eight Scout type-2 nodes across all seven DPC variants, inspect:
1. byte +0 (callback opcode) and WORD +2 (DPC class);
2. raw values at +8 through +0x40;
3. all pointer fields after relocation, especially +0x10/+0x14 and +0x14/+0x18 candidates;
4. whether the parser callback actually receives that node as its record pointer;
5. whether its callback-produced 24-byte working entries are later consumed by the runtime transform path.

Only after that correlation is established should we translate the executable transform into the geometry exporter.

## Key addresses

| Address | Established role |
|---|---|
| `0x422170` | DPC parser |
| `0x4DD470` | relocation / pointer-fixup dispatch by byte zero |
| `0x4DFCE4` | callback prelude and opcode dispatcher |
| `0x4DFCAC` | 14-entry callback target table |
| `0x4DFEF3` | callback opcode 2 |
| `0x4E0130` | callback opcode 5; matrix/position operation |
| `0x12D6C74` | 24-byte callback working-entry base |
| `0x12D6C78` | callback working-entry count |
| `0x4E32A2` | runtime transform-record consumer |
| `0x4C6610` | fixed-point 3x3 matrix multiply |
