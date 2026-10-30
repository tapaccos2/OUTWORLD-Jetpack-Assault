# Local Outwars executable probe

The Scout geometry and hierarchy audits have narrowed the remaining uncertainty to the original runtime consumer of the DPC type-16 wrappers and embedded type-0 descriptors. The executable is not committed to this repository. This script inspects the locally installed copy without uploading it.

From the repository root on Linux:

```bash
git pull
bash tools/scout-exe-probe.sh
```

The script searches common locations including `~/Outwars-extracted/outwars.exe`. It tests whether the installed `objdump` can read the Windows PE executable, and prefers the 32-bit MinGW PE-aware version when available. If none is installed, it prints the Debian/Ubuntu package command needed (`binutils-mingw-w64-i686`). To specify a path explicitly:

```bash
bash tools/scout-exe-probe.sh "/full/path/to/outwars.exe"
```

It creates `/tmp/outwars-scout-exe-probe.zip`. Attach that ZIP here. It contains the PE section map, import/relocation data, disassembly around `0x477200–0x478200`, direct references to `0x477680`, references to the two DPC wrapper constants, relevant resource/animation strings, and a PE-aware scan mapping Scout resource strings to virtual addresses and locating code/data references to them. It also records the executable SHA-256 so the analysis is tied to the exact build.

The script is read-only with respect to the executable and does not copy the executable into the repository or upload it.


## First executable probe observations

The first successful PE-aware probe read the exact executable build with SHA-256:

`484c7dc19a6f45e81af6a85e617761e01ec64ea784b17c45f8274fccf8f6a4c3`

The file is reported as PE32 / Intel 80386 with six sections. Its string table contains `scout.dpc`, the Scout variant identifiers `scout_ma`, `scout_fa`, `scout_mj`, `scout_fj`, `scout_md`, and `scout_fd`, plus extensive male/female motion `.mc` names (stand, walk, run, glide, death, and wait sequences). This confirms that the executable build contains explicit resource and motion references relevant to the Scout assets.

The disassembly excerpt begins a routine at VA `0x477680`. The visible prologue iterates a pointer-based list, checks record fields at offsets `+0x0c`, `+0x10`, and `+0x160`, then reads fields from the pointed record at offsets `+0x02`, `+0x10`, and `+0x28`. The excerpt supplied so far ends at the comparison against `0x1394`; it is not enough to identify the routine as the DPC hierarchy or mesh-transform consumer. The generated direct-xref report is empty, and the raw executable contains no literal little-endian occurrence of VA `0x477680`; neither result rules out indirect dispatch or relative references.

**Status:** executable loading/disassembly is now working. The runtime transform semantics are still unresolved. Continue by examining the remainder of `03-disassembly-477200-478200.txt` and then following the routine's indirect callers / data structures before assigning meaning to these offsets.


## Reassessment of address 0x477680

The extended disassembly supplied from `0x477680` shows that this is a 3D proximity/intersection helper, not the Scout part-transform routine. It scans candidate records, validates fields, reads candidate centres from offsets `+0xEC/+0xF0/+0xF4`, performs absolute component/range checks, compares squared distances against a squared radius, and calculates a point/segment projection. A neighbouring routine at `0x4778C0` uses a similar pattern over records with a `0x2C` stride. These operations are consistent with collision, hit-testing, or spatial candidate selection; the exact caller/purpose is not yet proven.

Do not use this routine to infer DPC wrapper or transform semantics.

The next probe stage uses `tools/scan-scout-exe-strings.py` to parse the PE section table, map the file offsets of `scout.dpc`, the `scout_*` variants, and related animation strings to virtual addresses, then search both the full disassembly and raw executable for references to those addresses. This is intended to locate the resource-loading/animation setup path instead of continuing down the spatial-query path.


## Resource-name reference scan: first result

On the executable with SHA-256 `484c7dc19a6f45e81af6a85e617761e01ec64ea784b17c45f8274fccf8f6a4c3`, the scanner maps the resource strings into PE image memory:

- `scout.dpc` is at VA `0x522677`; the full disassembly contains one immediate code reference at `0x48679D`.
- The generic format string `%s.dpc` is at VA `0x523423`; it is pushed at five code locations: `0x48CE78`, `0x48CE90`, `0x48CEC0`, `0x48CFE2`, and `0x48D172`.
- The six variant-name strings are in `DGROUP` and each has one raw pointer occurrence in `DGROUP`, with no direct disassembly immediate reference. Their pointer slots form three male/female pairs: `scout_ma/scout_fa` at file offsets `0x117B68/0x117B6C`, `scout_mj/scout_fj` at `0x117B90/0x117B94`, and `scout_md/scout_fd` at `0x117BB8/0x117BBC`. The three pairs are each `0x28` bytes apart. This is consistent with a data-driven variant table (possibly three fixed records with adjacent male/female name pointers), but the record meaning and consumers are not proven yet.
- The scan also finds the generic DPC filename format string at five code sites. This is a stronger path for locating filename construction than searching for each variant name as an immediate instruction operand.

These are reference locations, not yet proof of the function calls that open or parse the DPC file. The next inspection captures the disassembly around `0x486700–0x486900` and `0x48CE40–0x48D220`, while the updated scanner also searches for code references to the six variant pointer slots themselves.

For a focused second pass (reuses the existing full disassembly and does not repeat the expensive whole-file disassembly), run:

```bash
git pull
bash tools/scout-exe-followup.sh
```

The command prints one combined report to the terminal and saves it at `/tmp/outwars-scout-exe-followup/REPORT.txt`.


## Follow-up report: static DPC names and variant selection path

The follow-up report for the same executable build confirms two separate paths that were previously only suspected.

### Fixed DPC resource-name setup at 0x486720

The code at `0x486720` copies six null-terminated strings from the executable's `DGROUP` string area into fixed runtime buffers. The known entries include:

| Source string | Destination buffer |
|---|---:|
| `scout.dpc` | `0xA000C4` |
| `defenderWmortar.dpc` | `0xA001F0` |
| `walkingBabyAssassin.dpc` | `0xA0031C` |
| `laborer.dpc` | `0xA00448` |
| `flyingAssassin.dpc` | `0xA00574` |

The destination addresses are spaced by `0x12C` bytes. A sixth string is copied from source VA `0x522671` to `0x009FF620`; its name has not yet been identified from this excerpt. The code copies bytes until a null terminator; this is string-table setup, not proof that the DPC files are opened or parsed at this point.

### Generic DPC filename construction and variant pointer table

The code at `0x48CE71` and its neighbouring branches reads pointers from the table based at VA `0x529D60`, then passes a selected basename with the `%s.dpc` format string (VA `0x523423`) to helper `0x4EE38A`. This is consistent with constructing DPC filenames from a selected basename; the exact helper signature has not yet been independently verified.

The three Scout male/female pairs are found at pointer-table indexes 2/3, 12/13, and 22/23 respectively:

- Indexes 2/3: `scout_ma` / `scout_fa`
- Indexes 12/13: `scout_mj` / `scout_fj`
- Indexes 22/23: `scout_md` / `scout_fd`

That ten-entry spacing is real. It suggests three parallel sets of ten name pointers, each containing five male/female pairs. The purpose of the three sets and the semantics of suffixes `a`, `j`, and `d` are still unknown.

A second routine around `0x48CFB0–0x48D21D` iterates entity-like records, calculates a table index from packed record bytes, chooses a DPC basename from the pointer table, and stores unique names in records with a `0x12C`-byte stride. This is strong evidence for a data-driven DPC resource-selection/collection stage. It is not yet evidence of the mesh transform or hierarchy traversal.

### Current interpretation

We have now located executable code that selects DPC basenames and gathers the required DPC resource names. This is materially closer to the loader path than the earlier spatial helper at `0x477680`. The next analysis should decode the complete pointer table, identify direct callers of the collection routines, and trace the subsequent consumer of the gathered DPC filename list into the actual DPC parser.


## Follow-up report 2: complete variant table and next loader boundary

The next uploaded report decoded all 40 DWORD positions around VA `0x529D60`. The first 30 entries are three contiguous ten-entry banks. Each bank is ordered as five unit classes, with male then female names within each class:

| Class index | First bank (base `0x529D60`) | Second bank (base `0x529D88`) | Third bank (base `0x529DB0`) |
|---:|---|---|---|
| 0 | `inf_ma / inf_fa` | `inf_ma / inf_fa` | `inf_ma / inf_fa` |
| 1 | `scout_ma / scout_fa` | `scout_mj / scout_fj` | `scout_md / scout_fd` |
| 2 | `combat_ma / combat_fa` | `combat_mj / combat_fj` | `combat_md / combat_fd` |
| 3 | `assault_ma / assault_fa` | `assault_mj / assault_fj` | `assault_md / assault_fd` |
| 4 | `dread_ma / dread_fa` | `dread_mj / dread_fj` | `dread_md / dread_fd` |

The remaining ten DWORD positions from the original 40-entry inspection are not part of the table: they do not map to valid strings and are adjacent data. The table itself therefore has 30 meaningful entries, not 40. The follow-up probe now decodes exactly 30 entries.

The filename-formatting code combines two small indices as `2 * classIndex + sexIndex`, then chooses one of the three banks. Its branches select the second bank for selector value 0, the third bank for selector value 1, and the first bank for other values. This confirms the table's paired ordering and a three-way bank selector. The semantics of the selector values and the suffixes `a`, `j`, and `d` remain unconfirmed; do not name them as armour, jetpack, difficulty, or other guessed meanings.

### Unique-name collection

The routine beginning around `0x48CED4` calls a predicate at `0x455578`, chooses a DPC basename, formats it with `%s.dpc`, and iterates records at `0x12C)-byte spacing. It invokes `0x500AE9` after calculating string lengths, then increments a count and advances to the next record. This structure is consistent with checking whether a generated filename is already present and collecting unique DPC names. That is a strong static interpretation, but the exact compare helper contract and list structure still need confirmation from the callee body.

### New boundary found after name collection

At approximately `0x48D3B0`, the follow-on code formats two additional strings, calls `0x4DD420`, then calls `0x4CE6C8` with a global destination at `0xB8472C`. It reads the first DWORD from that destination and compares it with `0x4D504354` (bytes `54 43 50 4D`, ASCII `TCPM`). This is the strongest lead so far for the hand-off from selected resource names into a file/data reader or parser. It is not yet proven to be the DPC parser: the two callee bodies and the referenced format strings have not yet been decoded.

### Next targeted probe

The enhanced `tools/scout-exe-followup.sh` now reuses the existing full disassembly and adds only focused windows for:
- the `0x48CED4–0x48D2D8` name-collection routine;
- the follow-on at `0x48D380–0x48D600`;
- callees around `0x4DD420`, `0x4CE6C8`, `0x455578`, and `0x500AE9`;
- exact strings referenced at VAs `0x52334D`, `0x523423`, `0x52342A`, `0x52342E`, `0x523434`, and `0x523438`.

The command now saves the report to `/tmp/outwars-scout-exe-followup/REPORT.txt` without dumping hundreds of kilobytes to the terminal. After `git pull`, run:

```bash
bash tools/scout-exe-followup.sh
```

Then upload `/tmp/outwars-scout-exe-followup/REPORT.txt` directly. The original full PE disassembly is reused; the expensive full probe is not repeated.


## Follow-up report 3: DPC/TPC path construction and file-access wrapper

The latest uploaded report adds useful detail about the hand-off from filename collection to resource reading.

### Exact format strings at the new boundary

The string inspector confirms these literals:

- VA `0x52342A`: `DPC`
- VA `0x52342E`: `%s.%s`
- VA `0x523434`: `TPC`
- VA `0x523438`: `%s.%s`

The code around `0x48D3A8` uses these format strings to construct two extension-qualified paths from the selected base name. Thus this path handles both DPC and TPC resources. The TPC role is likely associated texture data, but its exact format/content has not yet been confirmed.

### Helper classifications corrected

- `0x500AE9` is now identified from its body as a case-insensitive byte-string comparator. It folds ASCII uppercase letters to lowercase before comparing and returns zero when the strings match (or when the compared string terminates together). That confirms the duplicate-name check in the collection routine.
- `0x4DD420`, when disassembled from its exact entry address, is a tiny global-pointer setter: it stores the incoming EAX value at `0x12B3970` and returns. It is not the file parser.
- `0x4CE6C8` is a file-read wrapper. The resolved imports identify IAT slot `0x14106B0` as `KERNEL32.dll!ReadFile` and `0x1410630` as `KERNEL32.dll!CloseHandle`. In the ordinary path, it passes the file handle, destination buffer, byte count, and bytes-read output to `ReadFile`, then closes the handle. When the custom-I/O globals indicate a redirected file, it instead reads through the mapped-file helpers at `0x4CD760` and closes through `0x4CD6CC`.
- The DPC/TPC loader compares the DWORD at the destination against `0x4D504354` (bytes `54 43 50 4D`, ASCII `TCPM`) and checks the following field against `0x43`. However, the call immediately before this comparison passes a byte count of `1` through `0x4CE6C8` to `ReadFile`. Therefore the code comparison is confirmed, but it is not yet established that this read populated the full four-byte value; it may rely on a previous buffer state or a separate initialization path. Treat this as an unresolved read-length/header inconsistency, not a verified four-byte file-header read.

### Next probe now prepared

The follow-up script has been extended (without repeating full disassembly) to:
- dump the complete loader routine through `0x48D810`, rather than stopping mid-way at `0x48D600`;
- disassemble the lower-level helper at `0x4CE158`;
- inspect the adjacent custom-I/O helpers at `0x4CD6CC` and `0x4CD760`;
- disassemble `0x4DD420` from its actual entry boundary;
- resolve import-table slots `0x1410630`, `0x14106B0`, and `0x14106B8` to DLL/API names.

The new import inspector is `tools/inspect-scout-exe-imports.py`. The workflow syntax-checks it. To collect the next report, run:

```bash
git pull
bash tools/scout-exe-followup.sh
```

The full result remains saved at `/tmp/outwars-scout-exe-followup/REPORT.txt` and is no longer printed to the terminal.

**Remaining blocker:** this is now a credible path into the DPC/TPC resource reader, but the complete format parser, graph-to-transform conversion, and actual per-part transform semantics are still not proven.


## Follow-up report 4: resolved Win32 I/O and a read-length inconsistency

The latest follow-up report resolves the operating-system imports and clarifies the ordinary file path versus the optional redirected-I/O path.

### Ordinary file open/read path

The import-table resolver identifies these IAT entries:

- `0x1410630`: `KERNEL32.dll!CloseHandle`
- `0x1410638`: `KERNEL32.dll!CreateFileA`
- `0x14106B0`: `KERNEL32.dll!ReadFile`
- `0x14106B8`: `KERNEL32.dll!SetFilePointer`

At `0x4CE158`, the ordinary path calls `CreateFileA` with the generated path, `GENERIC_READ` (`0x80000000`), share mode 0, null security/template arguments, `OPEN_EXISTING` (3), and flags `0x10000080`. The function first checks global `0xFA347C`; when that custom-I/O state is present, it attempts a virtual-file lookup before falling through to the ordinary Win32 open path.

The wrapper at `0x4CE6C8` calls `0x4CE158`, then calls `ReadFile` in the ordinary path and `CloseHandle` for cleanup. In the redirected path, it uses `0x4CD760` to copy from a mapped in-memory resource and `0x4CD6CC` for its close/release operation. The helper checks the requested range against the mapped resource size and advances its current offset when data is copied.

### Read-length question resolved: the value 1 is not the byte count

The apparent one-byte read was a calling-convention misinterpretation. The call sites push `1` as a stack argument to `0x4CE6C8`, but this value is not passed to `ReadFile` as its byte count.

The wrapper at `0x4CE6C8` calls `0x4CE158` with a pointer to a local DWORD. The file-open helper stores the result of `GetFileSize` (IAT `0x141066C`) through that pointer. On return, `0x4CE6C8` loads that local DWORD into `ECX` and passes it as `ReadFile`'s `nNumberOfBytesToRead` argument. The wrapper then returns the number of bytes actually read. This is visible in the consecutive instructions at `0x4CE6D7–0x4CE722` and `0x4CE332–0x4CE345`.

Therefore the `.TPC` call at `0x48D3F4–0x48D3FE` reads the file-size amount into the destination buffer before checking the `TCPM` signature and the following `0x43` field. The later `.DPC` read likewise requests the full size through this wrapper. The earlier interpretation of the pushed `1` as a one-byte read was incorrect.

### TPC record parsing observations

After the `TCPM` and `0x43` comparisons, the visible routine iterates records and builds a 256-entry WORD lookup sequence, using zero values as a sentinel condition. It then processes a packed 16-bit sequence over a `0x300`-byte region and extracts three masked/shifted byte values into adjacent arrays at `0xF84733`, `0xF84734`, and `0xF84735`. This is consistent with packed texture or colour data processing, but the exact channel order and format semantics are not established.

The repeated parser-like routine at `0x48D62C` performs the same initial magic and field comparisons against a supplied buffer. This suggests the code has both a file-reading entry path and a buffer-processing entry path, but their complete caller relationship still needs to be established.

### Next targeted probe

The follow-up script now adds disassembly windows for:

- the tail of `0x4CE158` (`0x4CE240–0x4CE360`);
- the custom/virtual-file lookup helpers around `0x4CE080` and `0x4CD5C0`;
- the loader setup caller at `0x48C6A8`;
- callees `0x4209A0` and `0x4FEDB8`;
- static references to the DPC/TPC global buffers, parsed-record fields, and palette/channel arrays.

These are focused additions to the existing report; the full executable disassembly is reused. Run:

```bash
git pull
bash tools/scout-exe-followup.sh
```

Then upload the regenerated `/tmp/outwars-scout-exe-followup/REPORT.txt`.

**Current blocker:** the TPC/DPC resource-reading and initial record-processing path is becoming clearer, but this still does not identify the runtime consumer of Scout attachment wrappers or prove the per-part transforms. The mesh assembly remains unresolved.


## Follow-up report 5: full-file reads confirmed and DPC record parser boundary found

The new report resolves the apparent read-length inconsistency and reveals a more useful continuation of the model-resource loader.

### File-size/read contract

The call at `0x4CE6DB` passes a pointer to a local DWORD into `0x4CE158`. On the normal Win32 path, the open helper calls `GetFileSize` and writes the returned size through that pointer. Back in `0x4CE6C8`, the wrapper loads this local size into `ECX` and passes it to `ReadFile` as the requested byte count. The wrapper returns the actual bytes-read value.

Consequently, the stack argument `1` at the TPC/DPC call sites is not a one-byte read request. Its precise meaning within the helper's other options is not assigned here, but it is not the `ReadFile` byte count. The `TCPM` header and following `0x43` comparison are performed after the resource contents have been read into memory. This corrects the previous follow-up note.

### Main resource loader continues into record loops

The routine at `0x48C6A8` builds a `.TPC` path and a `.DPC` path, reads resource data, and then continues beyond the originally inspected `0x48C890` boundary.

After its call to `0x4209A0`, the code loads a count from object offset `+0x13C` and a record-list pointer from `+0x144`. It iterates records at a `0x12C` stride. For each record it constructs a resource path, reads that file through `0x4CE6C8`, and calls `0x422170`. A second loop later reads and processes another list whose count is at `+0x140`, again using `0x12C)-byte record spacing and calling `0x422170`.

This is a substantially better lead into the DPC resource/object parser than the TPC colour conversion helper. It is not yet proof that `0x422170` calculates the Scout attachment transforms, nor are the record-list roles or the helper's full structure decoded.

### Texture path kept separate

The TPC processing code builds a 256-entry WORD lookup table and writes three component arrays at `0xF84733`, `0xF84734`, and `0xF84735`. The 16-bit pixel processing extracts masked component fields. This remains texture/pixel decoding evidence and should not be conflated with the type-16 DPC attachment-wrapper hierarchy.

### Next targeted probe

The follow-up script now adds focused disassembly for:

- the continuation of `0x48C6A8` through `0x48CD40`, including both resource-record loops;
- the callee at `0x422170`, reached for each record;
- the file-size/read helper at `0x4CE674–0x4CE780`;
- resource path string handling around `0x4CEEC0–0x4CEF50`;
- virtual-resource mode setup around `0x4CE020–0x4CE0A4`;
- callers of `0x422170`, `0x4CE674`, `0x4CE6C8`, and related setup helpers.

The next run reuses the original full disassembly; it does not repeat the expensive whole-file analysis:

```bash
git pull
bash tools/scout-exe-followup.sh
```

Then upload the regenerated `/tmp/outwars-scout-exe-followup/REPORT.txt`.

**Current best lead:** follow `0x422170` and its callees. It is invoked while the loader iterates the DPC-associated resource records, so it may expose the runtime record interpretation needed to connect the extracted DPC graph to part placement. That is a hypothesis to test, not a confirmed transform routine.

## Follow-up report 6: DPC pointer relocation and typed-record handlers

The latest uploaded report contains the first disassembly of the routine reached from the resource-record loops at `0x48CA20` and `0x48CBE3`.

### What 0x422170 actually does

The routine at `0x422170` is a DPC-format record parser, not a direct Scout attachment-transform calculator.

Its visible operations are:

- It checks the first DWORD against `0x4D504344` (little-endian bytes `44 43 50 4D`, i.e. `DCPM`) and checks the next DWORD against `0x43`.
- It reads header offsets and calculates the location of a DWORD pointer table.
- It walks that table, converts file-relative offsets into in-memory addresses based on the resource base, and writes the relocated addresses back into the buffer.
- For records whose 16-bit type field at `+2` is in the range 1–9, it calls `0x4DD470` and then `0x4DFCE4`, passing a handler-table base at `0x420B00`.
- Other record-type values take an allocation/initialization path involving `0x4CC988`, `0x4CC83C`, `0x435970`, and `0x4CC9D0`.

This establishes that the loader is resolving a pointer-based typed-record format in memory. It does not establish that the record types correspond to Scout mesh nodes or that the parser itself computes attachment transforms.

### Vector-like object setters found beside the parser

The same disassembly window exposes a cluster of adjacent routines that write three-component values into fields of allocated objects:

- `0x422278` copies three DWORDs into object fields `+0xEC`, `+0xF0`, and `+0xF4`.
- `0x4222A8` copies three WORDs into `+0xE4`, `+0xE6`, and `+0xE8`, then calls `0x4C5DB0` with those fields and another object vector at `+0xB4`.
- `0x422654` and `0x42269C` perform related three-component field writes through a global record table.
- `0x422754` stores three DWORD values and three WORD values into global arrays, then allocates or updates an associated record.

These are credible candidates for typed object-property handlers because they are in the parser's local code region and manipulate three-component fields. The available disassembly does not yet map the `0x420B00` dispatch-table entries to these routines, nor prove that the fields are positions, rotations, or attachment transforms.

### Next targeted probe

The focused follow-up script now adds disassembly for:

- `0x4DF84C`, `0x4DD470`, and `0x4DFCE4`;
- the handler-table region around `0x420B00`, both as disassembly and raw bytes;
- `0x4C5DB0`, called by the three-WORD component setter;
- caller scans for the adjacent setter/record routines and their allocation helpers.

This reuses the existing full disassembly. After pulling the latest script, run:

```bash
git pull
bash tools/scout-exe-followup.sh
```

Then upload the regenerated `/tmp/outwars-scout-exe-followup/REPORT.txt`.

**Current status:** we have moved past the generic resource-loader boundary and identified the typed-record dispatcher plus a cluster of vector-like property handlers. The dispatch mapping is now the next concrete task. The Scout part assembly and actual attachment transforms remain unresolved.


## Follow-up report 7: executable record handler and rotation-matrix path

The next executable report contains the missing disassembly at `0x420B00` and a more useful interpretation of the three-WORD setter.

### Correction: 0x420B00 is executable handler code, not a data table

The parser at `0x422170` supplies `0x420B00` in `EBX` before calling `0x4DFCE4`. The new disassembly shows that `0x420B00` begins with a normal x86 function prologue (`push esi; push edi; push ebp`), saves its incoming register arguments, calls `0x490388`, and then branches through a decision tree using the incoming `EDI` value. The branch boundaries include `0x834/0x835`, `0xC26`, `0x1019–0x101E`, `0x13C5`, and several ranges around `0x1B64–0x1B89`.

This proves `0x420B00` is code, not an array of function pointers or a raw handler table. The target routines are part of a range-based handler switch. The semantic names of those property IDs and the exact relationship between each branch target and the DPC class IDs are not yet established.

The previous description of `0x420B00` as a handler-table base is therefore withdrawn. It is the address of an executable handler routine passed into the generic processing path. The `0x4DFCE4` excerpt in this report still stops at `0x4DFD90` and does not show the complete routine, so the full callback invocation contract remains open.

### Rotation-matrix construction evidence

The routine at `0x4222A8` copies three 16-bit values from its input into object fields `+0xE4`, `+0xE6`, and `+0xE8`. It then passes the address of that three-WORD block (`object+0xE4`) and the address of another object block (`object+0xB4`) to `0x4C5DB0`.

The disassembly of `0x4C5DB0` shows that it reads the three 16-bit input components separately and calls `0x4C5440` three times, passing each value to the same fixed-point helper. It then performs fixed-point multiply/add operations. Other executable callers use the same `0x4C5DB0` helper after writing three WORDs into a target object's `+0xE4/+0xE6/+0xE8` fields and pass `object+0xB4` as the output block.

This is strong evidence that the three-WORD field is an angle triple and `+0xB4` stores a derived orientation basis/rotation matrix. The final output stores, exact matrix layout, Euler order, and angle units are not present in the truncated `0x4C5DB0` window, so those details must not yet be hard-coded into the exporter.

The adjacent setter at `0x422278` copies three DWORDs into `+0xEC/+0xF0/+0xF4`. These remain a three-component object field; interpreting them as translation is plausible but not independently proven in this report.

### What this changes for Scout reconstruction

We have now identified the executable's fixed-point three-angle-to-orientation-matrix path. That is a genuine transform-system breakthrough, not just another geometry candidate. However, it is not yet proven that the Scout type-16 wrapper values feed `0x4222A8` or that the eight Scout submeshes use this object layout in the same way.

The remaining work is now targeted:

1. Complete the `0x4DFCE4` routine and the `0x4C5DB0` / `0x4C5440` helper bodies.
2. Disassemble the branch targets selected by `0x420B00` and identify the specific route into the three-angle setter.
3. Map the DPC type-2/type-16 hierarchy records to the runtime object fields, then reconstruct parent-child matrix composition and validate the resulting Scout visually.

The focused probe script has been extended to emit these exact windows without repeating the full executable disassembly. After `git pull`, run:

```bash
git pull
bash tools/scout-exe-followup.sh
```

The new report sections are numbered 45–49: full `0x4DFCE4`, the `0x420B00` branch-target block, full `0x4C5DB0`, its fixed-point helper, and the `0x490388` validation helper.

**Status:** runtime rotation construction is now strongly evidenced; Scout attachment-to-object mapping and final assembled-model validation remain incomplete.
