# Scout executable follow-up 21 — callback branch map and property staging

## Input report

`REPORT(20261031-072303).txt`, executable SHA-256:

`484c7dc19a6f45e81af6a85e617761e01ec64ea784b17c45f8274fccf8f6a4c3`

## Confirmed new structure: six-property staging

The dispatcher routes IDs `0x1019–0x101E` through `0x42140D` into `0x42693C`, which reaches the handler at `0x42671C`.

The visible handler begins a bounded table at `0x647920`, count at `0x64791C`, with a maximum count of `0x37` (55). Its index calculation is `index * 0x2C`, so each staged record is 44 bytes. The handler writes:
- +0: source pointer (ESI)
- +0x0C and +0x0E: WORD values from CX
- +0x10: another WORD from the saved stack argument
- +0x14: sign-extended BX
- +0x1C, +0x20, +0x24: three DWORDs copied from the EDI source
- +0x28: validity/active byte, repeatedly set to 1

It also records a byte at global `0x647939`, calls `0x4B6AC4` with values extracted from high bytes, and has special handling for source record IDs `0x0FA0` and `0x0FA1`. In those cases it follows a pointer at source +0x10, branches on its first byte, and copies either +0x28 or +0x10 into the staged +0x14 field. The handler continues past the earlier report's cutoff; its remaining behavior has not yet been examined.

This 44-byte property staging table is distinct from the 24-byte callback working table at `0x12D6C74`. No link between either table and Scout's DPC mesh records has yet been proven.

## Callback jump table

The callback dispatch table at `0x4DFCAC` contains 14 DWORD targets:

`4DFDE1, 4DFE56, 4DFEF3, 4DFF99, 4E006D, 4E0130, 4E0494, 4E04A2, 4E023A, 4E0253, 4E04A2, 4E02E7, 4E0399, 4E023A`.

These are branch destinations, not semantic labels. The prior probe did not dump each destination in isolation, so record-type meanings cannot yet be assigned. Follow-up 21 captures all branch bodies.

## Correction to earlier interpretation

The routine at `0x4E59C8` is not a record-type resolver. Its visible code iterates a count at `[ESI+0x10]`, indexes records through a byte at +2, masks a byte at record +0x15, and ORs a 3-bit rolling value into DWORD +0x14. It appears to distribute/update packed per-record flag bits; exact semantics remain open.

The routine at `0x4E59A0` is a separate caller/loop that calls the fixed-point 3×3 transform routine at `0x4C6610` for records in a 0x20-byte-stride destination and a 0x14-byte-stride source. This is concrete matrix processing in the same code region, but the source/destination structures still need tracing back to Scout DPC entries.

## Next investigation

`tools/scout-exe-transform-deep.sh` captures:
- all 14 callback branch destinations;
- the complete six-property handler and property writer;
- the full property-record scan routine;
- fixed-point matrix multiplication helpers;
- the callback helper/registry and secondary position setters;
- the record-link consumer and dispatcher switch;
- raw executable occurrences for the relevant entry addresses.

The objective is to determine which callback branch constructs the matrix inputs and whether those inputs are sourced from Scout DPC type-2 records. Until that is shown, no exporter transform change is justified.
