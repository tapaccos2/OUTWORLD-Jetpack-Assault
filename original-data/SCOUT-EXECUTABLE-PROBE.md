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
