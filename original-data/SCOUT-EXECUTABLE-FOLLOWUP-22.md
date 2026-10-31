# Scout executable follow-up 22 — callback transform path and next bridge probe

Executable analysed: `outwars.exe`  
SHA-256: `484c7dc19a6f45e81af6a85e617761e01ec64ea784b17c45f8274fccf8f6a4c3`  
Source report: `REPORT(20261031-072436).txt`

## New findings

### Callback record dispatch

The callback's common dispatch tail reads the first byte of the record at `[record]`, bounds it to `0..13`, and jumps through the table at `0x4DFCAC`. The table maps the record's first-byte value to the callback branches already dumped in follow-up 21.

This is distinct from the WORD at `record+2`, which the branch handlers also read and preserve in their callback state. Do not conflate the first-byte dispatch class with the WORD identifier at +2.

### Branch 05 is a concrete transform consumer

Callback branch `0x4E0130` is selected by dispatch value 5. It:
- Reads three DWORDs at record offsets `+0x28`, `+0x2C`, and `+0x30`, adding them to the current working position.
- Passes the record matrix beginning at `+4` through fixed-point matrix helpers `0x4C6610` and `0x4C57DC`.
- Uses `0x4C5500` to copy a 3x3 matrix into the global matrix workspace.
- Calls `0x4C5AA0` to combine the local transform with the current transform.
- Iterates a byte-sized child count at `record+0x36`; for each child it reads a DWORD at child-record `+0x38` and writes a 24-byte callback working-table entry.

The matrix helpers perform multiply-accumulate operations followed by arithmetic shift right by 12, i.e. 12-bit fixed-point matrix arithmetic.

This proves the executable has a hierarchical transform-record path. It does **not** yet prove the Scout's DPC type-2 mesh records enter branch 05.

### Branch 02 is a different path

The branch selected by dispatch value 2 reads:
- a count from `record+0x10`;
- a pointer from `record+0x14`;
- then iterates 4-byte entries and reads each referenced item at `+8`.

It writes callback working-table entries but does not call the matrix helpers in the dumped range. The similarity between this record layout and any DPC record must be tested against the actual parser's record pointers, not inferred from offsets alone.

### Other proven structures remain separate

- The six-property staging handler uses a 44-byte record stride at `0x647920`.
- The callback working table uses a 24-byte stride at `0x12D6C74`.
- The matrix transform workspace is separate again.
- No evidence in this report establishes that the 44-byte property records are the DPC mesh records.

## Next investigation

Added `tools/scout-exe-transform-bridge.sh`. It captures:
- callback initialization and common dispatch setup;
- both known parser-to-callback callsites;
- the DPC record parser and relocation/type switch;
- runtime object registration/construction;
- the six-property dispatcher caller;
- the longer record-link consumer path;
- direct call references to the candidate callback, matrix and runtime-transform routines.

Run it against the same executable:

```bash
git pull
bash tools/scout-exe-transform-bridge.sh /home/tapaccos/Outwars-extracted/outwars.exe
```

Upload `/tmp/outwars-scout-transform-bridge/REPORT.txt`.

The next proof target is precise: identify the exact record pointer and first-byte dispatch value at each parser-to-callback call, then determine whether the Scout DPC type-2 records reach the transform-bearing branch or are linked to objects that later consume those transforms. Until that is established, the geometry exporter should remain unchanged.
