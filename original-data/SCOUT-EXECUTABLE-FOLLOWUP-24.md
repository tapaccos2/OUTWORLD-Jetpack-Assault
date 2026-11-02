# Scout executable follow-up 24 — slot tags versus render transforms

Date: 2026-11-02
Executable SHA-256: `484c7dc19a6f45e81af6a85e617761e01ec64ea784b17c45f8274fccf8f6a4c3`
DPC SHA-256 (close-out bundle): `05887eae665ec9eb7da64420d549e239d23c0a81e3b27eae4f77ac655df58758`

## Result

**The modulo-8 values written by 0x4e59c8 are not proven attachment-transform indices. Do not use them as GLB placement transforms.**

The executable evidence now shows three separate mechanisms:

1. DPC callback preparation writes a rolling 3-bit value into records.
2. A state-selection routine consumes a 3-bit value to select one bit from a packed per-slot state word.
3. The Direct3D render path separately looks up transform pointers from an eight-entry object table and calls SetTransform.

The missing work is a pointer/dataflow join across these mechanisms, not another attempt to guess the placement of the meshes.

## 1. DPC preparation write — 0x4e59c8

The routine is called from callback handler 0x4dfde1. It reads:
- the payload count from [descriptor+0x10];
- the record-array pointer from [descriptor+0x0c];
- the rolling seed from global 0x12d7370.

For each record, it follows the variable stride encoded by BYTE [record+2], then performs:

```asm
and byte [record+0x15], 0x1f
and ecx, 7
shl ecx, 13
or  [record+0x14], ecx
```

The seed increments and wraps modulo eight. The callback simulation in the close-out report recorded 838 tag writes across its processed work items: slots 0–5 appeared 105 times each and slots 6–7 appeared 104 times each. These are execution-simulation counts, not proof of geometry ownership.

## 2. State-selection consumer — 0x514d15

The disassembly in `scout-object-slot-bridge.txt` shows this code:

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
cmp edx, 1
```

The effective selector is derived from bits 11–15 of the low WORD at [esi+0x20], then doubled to select one bit position in the low WORD at [esi+0x24]. This is a packed state-bit test. It is not a matrix load or transform-pointer lookup.

There is a possible layout relationship: if ESI points 0x0C bytes before a record processed by 0x4e59c8, then [esi+0x20] aliases [record+0x14]. The available trace does not yet prove that pointer relationship or establish that this state-selection path assigns geometry transforms. Therefore the tag-to-state interpretation is supported, but the exact DPC pointer alias remains to be verified.

## 3. Separate Direct3D transform lookup

The renderer loop around 0x4dba5f iterates an index from 0 through 7. For a non-null keyed entry it calls:
- 0x4f5b44 to find a matching table entry by its key at candidate+0x0c;
- 0x4f617c as an additional slot/index check;
- 0x4f5c88 to retrieve the transform pointer at candidate+0x00.

The returned pointer is passed to the Direct3D device's SetTransform method through the device vtable at [device+0x68] (call site 0x4dbaf2).

This proves that the Direct3D path uses an eight-entry keyed transform table. It does **not** prove that the table keys are populated from the tag written by 0x4e59c8.

## 4. Other runtime transform data is also separate

Routine 0x4e32a2 reads the active object pointer at global 0x12d7368, checks its +0x160 field, and emits 0x1c-byte records to the buffer at 0x52d28c. Its later path calls the fixed-point matrix helper 0x4c6610.

The updater around 0x4e40a5 loops over eight records starting at 0x12d7374 with stride 0x24 and applies three rotation components to the object pointer stored at each record+0x14. This is an eight-entry rotation/position update structure, but the current evidence does not join its entries to the nine Scout geometry sections or to the DPC slot tags.

## 5. Required joins before changing the exporter

1. Recover the caller/dataflow into the 0x514c80–0x514d6e state-selection routine and prove whether its ESI-based record is the same memory as the 0x4e59c8-tagged DPC record.
2. Find the population path for the per-object table at object+0x2c28, including the origin of each candidate+0x0c key and candidate+0x00 transform pointer.
3. Correlate the class-6 object at object+0x160 and its 0x52d28c matrix records with the actual nine Scout geometry descriptor/face-stream pairs.
4. Only then test the resulting transforms against the eight supplied reference points and require a unique, visually coherent candidate.

## Export decision

No placement changes are made in this follow-up. Keep the current browser demo labelled as an experimental static reconstruction. The close-out gate remains:
- 9/9 geometry descriptor links;
- 0/8 opcode-5 transform ownership links in the prior close-out analysis;
- placement unresolved.

A new GLB should only be published after a transform-to-geometry join is evidenced and the assembled result passes reference-point and visual validation.
