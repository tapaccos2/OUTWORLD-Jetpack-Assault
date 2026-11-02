# Scout executable follow-up 25 — eight-object update table and selector arithmetic correction

Date: 2026-11-02
Executable SHA-256: `484c7dc19a6f45e81af6a85e617761e01ec64ea784b17c45f8274fccf8f6a4c3`

## Executive result

The new class-6 trace confirms an eight-entry runtime object-update table at base `0x12d7374`, with a `0x24`-byte stride. For each active entry, the updater obtains the target pointer at entry+`0x14`, then updates the target's rotation and position-related fields. This is a concrete object-update path, but it has not yet been joined to the nine extracted Scout geometry owners.

This report also corrects the selector arithmetic described in follow-up 24. The `0x514d15` sequence extracts bits 11–13 of the source low word, not bits 11–15. The selector therefore cannot be equated with the three-bit tag written into bits 13–15 by `0x4e59c8`.

## 1. Eight-entry object-update table — 0x4e40a5

The updater starts with:

```asm
mov ebx, 0x12d7374
xor ecx, ecx
...
inc ecx
add ebx, 0x24
cmp ecx, 8
```

It processes eight records at:

`0x12d7374 + (index * 0x24)`, for index 0 through 7.

For each record:
- DWORD [entry+`0x18] is tested against zero; zero skips the entry.
- DWORD [entry+`0x14] supplies the target object pointer.
- Three per-entry WORD values at `0x12d7380 + index*0x24`, `+2`, and `+4` are added to target offsets `+0xe4`, `+0xe6`, and `+0xe8`.
- The routine then calls `0x4c5db0` with the target's `+0xe4` region and a matrix-related region at target+`0xb4`.
- The entry's first three DWORD values are added to target offsets `+0xec`, `+0xf0`, and `+0xf4`.

The executable contains a second, structurally similar eight-entry update loop beginning at `0x4e4d5e`.

This confirms an eight-object runtime update mechanism with per-entry pointers and active gating. It does not prove that index 0–7 corresponds to a particular Scout body or glider mesh.

## 2. Initialization evidence — 0x4e3fd0 and 0x4e405c

The initializer at `0x4e3fd0` iterates in `0x24)-byte steps and calls `0x4cc988`, `0x4cc83c`, and `0x4cca30`. It writes pointer values into the region beginning at `0x12d7388`, using the same `0x24)-byte step as the updater's pointer field.

The setup at `0x4e405c` establishes two fixed structure addresses:
- `0x12d777c = 0x12d7494`
- `0x12d7780 = 0x12d7608`

It initializes both through `0x4cc850` and stores the first address at the second structure's `+0x14).

The later path at `0x4e4b73` writes a pointer into the structure at `0x12d7608 + 0x160`, then clears fields `+0x18`, `+0x1c`, and `+0x20` on the structure at `0x12d7494`.

These are object/structure initialization facts. The pointer values and table entries have not been correlated with the Scout's nine geometry descriptors.

## 3. Correction: 0x514d15 selector arithmetic

The consumer sequence is:

```asm
mov ecx, [esi+0x20]
and ecx, 0xffff
mov edx, [esi+0x24]
shl ecx, 2
and edx, 0xffff
shr cx, 0x0d
and ecx, 0xffff
add ecx, ecx
shr edx, cl
and edx, 1
```

Because `shr cx,0x0d` operates on the low 16 bits after the two-bit left shift, the resulting selector is:

`((low16([esi+0x20]) << 2) & 0xffff) >> 13`

which simplifies to:

`(low16([esi+0x20]) >> 11) & 7`.

That selector is doubled and used to choose one bit from the low WORD at `[esi+0x24]`.

By contrast, `0x4e59c8` writes its rolling three-bit value into bits 13–15 of DWORD `[record+0x14]`. The two operations are not equivalent: they read different bit ranges. A possible pointer alias between `[esi+0x20]` and `[record+0x14]` remains unproven, and even under that hypothetical alias only bit 13 overlaps the fields.

Accordingly, follow-up 24's shorthand suggestion that the state consumer uses the same three-bit tag as its selector should not be relied on. It is not established by the current disassembly.

## 4. What is still missing

The evidence now separates these structures rather than conflating them:

1. The DPC preparation helper's rolling tag write at `0x4e59c8`.
2. The eight-entry object-update table at `0x12d7374).
3. The separate eight-entry keyed Direct3D transform lookup, which returns a pointer from its keyed entry and passes it to `SetTransform`.
4. The active-object spatial record path at `0x4e32a0`, which consumes an object pointer through global `0x12d7368` and its `+0x160) field.

The missing proof is a pointer/dataflow chain that identifies the same object or sub-object at all relevant stages and ties it to an exact DPC geometry descriptor/owner.

## Export decision

No GLB placement is changed in this follow-up. The current browser demo remains an experimental static reconstruction.

The close-out gates remain:
- 9/9 exact geometry descriptor links;
- 0/8 proven opcode-5 transform ownership links in the prior close-out analysis;
- 32 matrix hypotheses tested against eight reference points, with placement unresolved.

A new assembly should be published only after the eight-entry runtime target pointers (or the Direct3D keyed transform pointers) are tied to the nine actual Scout geometry owners and the result passes the reference-point and visual checks.
