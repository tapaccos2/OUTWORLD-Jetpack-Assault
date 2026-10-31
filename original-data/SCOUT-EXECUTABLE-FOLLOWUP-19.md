# Scout executable follow-up 19: six-property dispatch path

Source: `REPORT(8).txt`, executable SHA-256 `484c7dc19a6f45e81af6a85e617761e01ec64ea784b17c45f8274fccf8f6a4c3`.

## Confirmed dispatch for property IDs 0x1019–0x101E

The DPC callback at `0x420B00` compares the incoming property identifier in EDI. The range `0x1019–0x101E` branches to `0x42140D`. That branch sets up and calls `0x42693C` with:

- EAX = ESI (the current callback/source pointer);
- EDX = EBP (the current property data pointer);
- ECX = 6;
- EBX = `0xA0`;
- one additional stack argument = 1.

This is direct evidence that the six consecutive property IDs are handled through a common six-element property routine, with a `0xA0` stride parameter. It does not by itself identify the six values as position, rotation, or mesh transforms. The callee body at `0x42693C` must be interpreted before assigning meaning.

The focused probe now captures both sides of this call: the small dispatch branch at `0x42140D–0x42142A` and the callee region at `0x426900–0x426B20`. This avoids interpreting the callee without its caller-supplied count, stride, and source pointers.

## Current status

The callback's visible partial body maintains a separate 24-byte-stride parser-state table at `0x12D6C74`. The runtime object table rooted at `0x647578` is a distinct 12-byte-stride table with object pointers at entry `+8`; source-record pointer registration is separate again at `0x647538`. The next pass must establish whether the six-property handler populates one of these runtime structures and whether its data maps to the Scout owner/paired-node records.

The geometry exporter remains unchanged. No transform values or hierarchy edges have been guessed.
