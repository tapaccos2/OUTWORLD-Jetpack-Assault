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
- `0x4CE6C8` is a lower-level file-access wrapper. It calls `0x4CE158`, then uses the returned file context/handle and a data buffer in a path that calls an imported API through IAT slot `0x14106B0`. The call setup strongly resembles a Win32 file read, and another IAT slot `0x1410630` is used in the close/cleanup path. These API names are awaiting import-table resolution.
- The DPC/TPC loader checks the first DWORD of the returned data against `0x4D504354` (bytes `54 43 50 4D`, ASCII bytes `TCPM`) and then checks a further field against `0x43`. This is evidence of binary-header validation, but the full format structure is not yet decoded.

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
