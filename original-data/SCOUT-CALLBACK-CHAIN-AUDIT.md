# Scout callback descriptor-chain audit

Date: 2026-10-31  
Input: uploaded `scout-callback-chain.json`, generated from all seven Scout DPC variants.

## Results

The audit found **16 callback records in each of the seven variants** (112 records total): eight mesh-side and eight paired-side. Every record has byte-zero opcode 2, selecting executable callback `0x4DFEF3`; every record has count `+0x10 = 1`. Each `+0x14` pointer resolves to a type-16 list record, and the callback's read at list-element `+8` resolves to an embedded descriptor beginning with `0x0000FF00`.

This is a consistent structural match between the Scout data and callback opcode 2. It demonstrates the same record shape and the exact pointer chain the callback follows. It does **not**, by itself, prove the parser invokes the callback on every one of these 112 records at runtime.

## Mesh-side versus paired-side descriptor targets

The list records distinguish the two roles:

- mesh side: type-16 class 0; first DWORDs `0x00002710, 0`; descriptor +4 resolves to file offset `0x28` in the inspected male and female examples;
- paired side: type-16 class 34; first DWORDs `0x00225510, 0x00002710`; descriptor +4 resolves to per-part offsets such as `0x60`, `0x2c8`, and `0x2e8`.

The descriptor's +8 field is another relocated pointer value that does not resolve inside the DPC file under the file's relocation base. The descriptor's +12 field is a further local pointer. These are reported as raw structure, not assigned meanings.

## Relationship to the existing geometry exporter

The existing exporter resolves the **type-2 +20 wrapper chain** to recover the shared coordinate pool at file offset `0x28`. The new callback audit follows a different chain: **type-2 +16 count / +20 pointer (record offsets +0x10/+0x14) → type-16 list element +8 → embedded descriptor**. Do not conflate these paths.

The mesh-side callback descriptors point to `0x28`, matching the exporter's shared coordinate-pool base. Paired-side callback descriptors point to other local offsets. This is a useful lead, but it is not yet evidence that those paired-side offsets are attachment transforms, local vertex arrays, or bone data.

## Conclusion

The opcode-2 callback is collecting pointers to embedded descriptors, not directly performing the matrix operations seen in callback opcode 5. The callback's output table may be a descriptor-registration/lookup structure. Its six-DWORD output layout still needs to be mapped to the later runtime consumers before it can safely drive model assembly.

**Exporter status:** unchanged. No guessed transforms or geometry-base changes are justified by this audit.

## Next probe

Run `tools/inspect-scout-callback-descriptor-targets.mjs` against all seven variants. It dumps the bytes at descriptor +4 targets and reports descriptor +8/+12 pointer fields. Compare those target regions with the known coordinate and face-record structures. This will establish whether the paired-side targets are data arrays, embedded metadata, or another resource class before modifying the GLB exporter.


## Executable relocation semantics for descriptor pointers (2026-10-31)

A full read of executable dispatcher `0x4DD470` corrects the earlier description of descriptor +8 as merely a non-local raw pointer:

- The dispatcher selects its relocation case using byte zero.
- Case 0 begins at `0x4DD4BC`. It relocates the DWORDs at record offsets `+4`, `+8`, and `+12` against the supplied relocation base, adds the loaded-resource base held in global `0x12B3970`, and marks byte +1 as `0xFE` so the record is not relocated twice.
- The Scout embedded descriptor begins with `0x0000FF00`, so it selects case 0. Its +8 pointer is therefore actively relocated by the game; it is not an opaque field ignored by the loader.

For `scout_mj.dpc`, the header relocation base is `0x80019C40` and descriptor +8 is `0x8009B578`. The relative target is:

`0x8009B578 - 0x80019C40 = 0x81938`.

The DPC is 37,792 bytes (`0x93A0`), so this target is outside the extracted DPC. The units archive inventory places `scout_mj.dpc` at archive offset 936,816; adding `0x81938` gives candidate archive offset 1,467,560 (`0x1664A8`). The archive inventory places that address inside `combat_fa.tpc`, at offset `+0x3CD9` from that resource's start.

That archive-offset correspondence is a **candidate cross-resource mapping**, not yet proof that the runtime loader maps the entire archive contiguously or that the bytes at the target are meaningful Scout metadata. The actual bytes at the target and the corresponding female-layout target still need inspection. Do not interpret this pointer as a transform or alter the exporter on this evidence alone.

## Updated next probe

Inspect the units archive bytes at the candidate target (`0x1664A8`) and compare them with the same relative pointer in the other Scout variants. In parallel, trace the loader's allocation/base arguments around `0x48C6A8`, `0x48C8A8`, and `0x48CA20` to establish whether the relocation base is a resource-local pointer into one contiguous archive buffer. Only then classify the +8 field and look for its consumer.
