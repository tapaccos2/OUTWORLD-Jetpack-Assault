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

It creates `/tmp/outwars-scout-exe-probe.zip`. Attach that ZIP here. It contains the PE section map, import/relocation data, disassembly around `0x477200–0x478200`, direct references to `0x477680`, references to the two DPC wrapper constants, and relevant resource/animation strings. It also records the executable SHA-256 so the analysis is tied to the exact build.

The script is read-only with respect to the executable and does not copy the executable into the repository or upload it.
