#!/usr/bin/env bash
# Focused second-pass analysis using the existing full disassembly.
# Usage: bash tools/scout-exe-followup.sh [path/to/outwars.exe] [probe-dir] [output-dir]
set -euo pipefail

EXE="${1:-}"
PROBE="${2:-/tmp/outwars-scout-exe-probe}"
OUT="${3:-/tmp/outwars-scout-exe-followup}"

# Match the executable search used by the original probe.
if [[ -z "$EXE" ]]; then
  for candidate in \
    "$PWD/outwars.exe" \
    "$PWD/../Outwars-extracted/outwars.exe" \
    "$HOME/Outwars-extracted/outwars.exe" \
    "$HOME/Documents/Outwars-extracted/outwars.exe" \
    "$HOME/Downloads/outwars.exe"; do
    if [[ -f "$candidate" ]]; then EXE="$candidate"; break; fi
  done
fi

if [[ -z "$EXE" || ! -f "$EXE" ]]; then
  echo "Could not find outwars.exe automatically." >&2
  echo "Pass the path explicitly:" >&2
  echo '  bash tools/scout-exe-followup.sh "/home/your-user/Outwars-extracted/outwars.exe"' >&2
  echo 'Or locate it with:' >&2
  echo '  find "$HOME" -type f -iname outwars.exe -print -quit' >&2
  exit 2
fi
if [[ ! -f "$PROBE/04-full-code-disassembly.txt" ]]; then
  echo "Full disassembly not found: $PROBE/04-full-code-disassembly.txt" >&2
  exit 2
fi

OBJDUMP=""
for candidate in i686-w64-mingw32-objdump x86_64-w64-mingw32-objdump objdump; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -f "$EXE" >/dev/null 2>&1; then
    OBJDUMP="$(command -v "$candidate")"
    break
  fi
done
if [[ -z "$OBJDUMP" ]]; then
  echo "No PE-capable objdump found. Install binutils-mingw-w64-i686." >&2
  exit 3
fi

mkdir -p "$OUT"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "$SCRIPT_DIR/scan-scout-exe-strings.py" \
  "$EXE" "$PROBE/04-full-code-disassembly.txt" \
  "$OUT/10-resource-string-references.txt"

"$OBJDUMP" -d -Mintel --start-address=0x486700 --stop-address=0x486900 "$EXE" \
  > "$OUT/11-scout-dpc-loader-context.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x48ce40 --stop-address=0x48d220 "$EXE" \
  > "$OUT/12-generic-dpc-loader-context.txt" 2>&1

"$OBJDUMP" -d -Mintel --start-address=0x48d200 --stop-address=0x48d380 "$EXE" \
  > "$OUT/13-generic-dpc-loader-tail.txt" 2>&1

# Focused follow-on: trace the filename collection routine and the functions it calls.
"$OBJDUMP" -d -Mintel --start-address=0x48ced4 --stop-address=0x48d2d8 "$EXE" \
  > "$OUT/16-dpc-name-collection-routine.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x48d380 --stop-address=0x48d810 "$EXE" \
  > "$OUT/17-dpc-resource-open-follow-on.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4ce100 --stop-address=0x4ce260 "$EXE" \
  > "$OUT/23-low-level-file-reader-4ce158.txt" 2>&1

# Extend the open/redirect paths beyond the previously truncated windows.
"$OBJDUMP" -d -Mintel --start-address=0x4ce240 --stop-address=0x4ce360 "$EXE" \
  > "$OUT/27-low-level-file-reader-tail.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4ce080 --stop-address=0x4ce158 "$EXE" \
  > "$OUT/28-virtual-file-open-helper.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4cd5c0 --stop-address=0x4cd640 "$EXE" \
  > "$OUT/29-virtual-file-lookup-helper.txt" 2>&1

# Trace the resource-loader setup/caller and the allocation/data helpers it reaches.
"$OBJDUMP" -d -Mintel --start-address=0x48c6a8 --stop-address=0x48c890 "$EXE" \
  > "$OUT/30-resource-loader-caller-48c6a8.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x48c890 --stop-address=0x48cd40 "$EXE" \
  > "$OUT/34-resource-loader-record-loops.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4220c0 --stop-address=0x422900 "$EXE" \
  > "$OUT/35-callee-422170-resource-record-parser.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4df820 --stop-address=0x4df910 "$EXE" \
  > "$OUT/39-callee-4df84c-resource-table-setup.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4dd430 --stop-address=0x4dd540 "$EXE" \
  > "$OUT/40-callee-4dd470-record-lookup.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4dfca0 --stop-address=0x4dfd90 "$EXE" \
  > "$OUT/41-callee-4dfce4-record-dispatch.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4c5d80 --stop-address=0x4c5e10 "$EXE" \
  > "$OUT/44-callee-4c5db0-three-component-helper.txt" 2>&1
# The previous windows cut off the dispatcher and fixed-point rotation helper.
# Capture the complete callback body, every branch target, and its trig primitive.
"$OBJDUMP" -d -Mintel --start-address=0x4dfce4 --stop-address=0x4dff80 "$EXE" \
  > "$OUT/45-callee-4dfce4-record-dispatch-full.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x420f00 --stop-address=0x422100 "$EXE" \
  > "$OUT/46-record-handler-branch-targets.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4c5db0 --stop-address=0x4c5e80 "$EXE" \
  > "$OUT/47-three-component-rotation-matrix-helper-full.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4c5440 --stop-address=0x4c54c0 "$EXE" \
  > "$OUT/48-fixed-point-trig-helper.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x490360 --stop-address=0x490430 "$EXE" \
  > "$OUT/49-record-callback-validation-helper.txt" 2>&1

# Find raw PE data/code references to transform setters and their registration targets.
python3 - "$EXE" "$OUT/50-raw-transform-handler-pointer-xrefs.txt" <<'PY'
import struct
import sys
from pathlib import Path

exe, destination = map(Path, sys.argv[1:3])
data = exe.read_bytes()
targets = (
    0x420B00, 0x420F86, 0x42107B, 0x42140D, 0x42169C, 0x42183C,
    0x421BAA, 0x4220C0, 0x422170, 0x422278, 0x4222A8, 0x4222F0,
    0x422300, 0x422310, 0x422332, 0x42237C, 0x42244C, 0x422554,
    0x422654, 0x42269C, 0x422754, 0x4C5440, 0x4C5DB0,
)
with destination.open("w") as out:
    out.write("RAW LITTLE-ENDIAN VA OCCURRENCES FOR TRANSFORM / DPC HANDLER ROUTINES\\n")
    out.write("Executable: {}\\n".format(exe))
    for va in targets:
        needle = struct.pack("<I", va)
        positions = []
        start = 0
        while True:
            pos = data.find(needle, start)
            if pos < 0:
                break
            positions.append(pos)
            start = pos + 1
        out.write("\\nVA 0x{:08X}: {} raw occurrence(s)\\n".format(va, len(positions)))
        for pos in positions:
            lo, hi = max(0, pos - 8), min(len(data), pos + 12)
            out.write("  file+0x{:X}: {}\\n".format(pos, data[lo:hi].hex(" ")))
PY
"$OBJDUMP" -d -Mintel --start-address=0x420af0 --stop-address=0x420c50 "$EXE" \
  > "$OUT/42-record-handler-table-region-disassembly.txt" 2>&1
"$OBJDUMP" -s -j BEGTEXT --start-address=0x420b00 --stop-address=0x420b60 "$EXE" \
  > "$OUT/43-record-handler-table-raw-bytes.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4ce640 --stop-address=0x4ce780 "$EXE" \
  > "$OUT/36-file-size-and-read-helper.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4ceec0 --stop-address=0x4cef50 "$EXE" \
  > "$OUT/37-resource-path-string-helper.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4ce020 --stop-address=0x4ce0a4 "$EXE" \
  > "$OUT/38-virtual-resource-mode-setup.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x420960 --stop-address=0x420a30 "$EXE" \
  > "$OUT/31-callee-4209a0.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4fed80 --stop-address=0x4fee20 "$EXE" \
  > "$OUT/32-callee-4fedb8.txt" 2>&1

# Locate all static references to global buffers and arrays used by the DPC/TPC path.
python3 - "$PROBE/04-full-code-disassembly.txt" "$OUT/33-resource-buffer-xrefs.txt" <<'PY'
import sys
from pathlib import Path

source, destination = map(Path, sys.argv[1:3])
needles = (
    "0xa0472c", "0xb8472c",
    "0x12888f8", "0x12888fc", "0x1288900", "0x1288904",
    "0x1288908", "0x1288918",
    "0xf84733", "0xf84734", "0xf84735",
    "0x12b3970",
)
lines = source.read_text(errors="replace").splitlines()
with destination.open("w") as out:
    out.write("STATIC XREFS TO DPC/TPC GLOBAL BUFFERS AND PARSED RECORD ARRAYS\n")
    out.write("Source: " + str(source) + "\n")
    for number, line in enumerate(lines, 1):
        low = line.lower()
        found = [needle for needle in needles if needle in low]
        if found:
            out.write("{}: [{}] {}\n".format(number, ", ".join(found), line))
PY
"$OBJDUMP" -d -Mintel --start-address=0x4cd6a0 --stop-address=0x4cd7c0 "$EXE" \
  > "$OUT/24-io-redirect-helpers.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4dd420 --stop-address=0x4dd440 "$EXE" \
  > "$OUT/25-global-resource-pointer-setter.txt" 2>&1

python3 "$SCRIPT_DIR/inspect-scout-exe-imports.py" "$EXE" \
  --addresses 0x1410630,0x1410638,0x141066c,0x14106b0,0x14106b8,0x14106d0,0x14106dc \
  > "$OUT/26-import-address-resolution.txt"
"$OBJDUMP" -d -Mintel --start-address=0x4dd380 --stop-address=0x4dd4c0 "$EXE" \
  > "$OUT/18-callee-4dd420.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x4ce620 --stop-address=0x4ce780 "$EXE" \
  > "$OUT/19-callee-4ce6c8.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x455540 --stop-address=0x4555c0 "$EXE" \
  > "$OUT/20-callee-455578.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x500aa0 --stop-address=0x500b50 "$EXE" \
  > "$OUT/21-callee-500ae9.txt" 2>&1

python3 "$SCRIPT_DIR/inspect-scout-exe-va-strings.py" "$EXE" \
  --addresses 0x52334d,0x523423,0x52342a,0x52342e,0x523434,0x523438 \
  > "$OUT/22-formatted-resource-strings.txt"

python3 "$SCRIPT_DIR/inspect-scout-exe-pointer-table.py" "$EXE" \
  --start 0x529d60 --count 30 --label "DPC variant/resource pointer table" \
  > "$OUT/14-dpc-pointer-table.txt"

python3 "$SCRIPT_DIR/scan-scout-exe-callers.py" \
  "$PROBE/04-full-code-disassembly.txt" \
  --targets "0x486720,0x48ce71,0x48ce89,0x48cea1,0x48ced4,0x48cfb0,0x4ee38a,0x500ae9,0x4dd420,0x4ce6c8,0x4ce158,0x4cd6cc,0x4cd760,0x455578,0x48d3aa,0x4843d4,0x4209a0,0x4fedb8,0x4ce0a4,0x4cd5e8,0x422170,0x4ce674,0x4ce6c8,0x4ceefb,0x4d3be8,0x4ce044,0x4df84c,0x4dd470,0x4dfce4,0x420b00,0x4cc988,0x4cc83c,0x435970,0x4cc9d0,0x422278,0x4222a8,0x4222f0,0x422300,0x422310,0x422554,0x4225f0,0x422654,0x42269c,0x4226fc,0x422728,0x422754,0x4c5db0" \
  --context 16 \
  > "$OUT/15-loader-callers.txt"

{
  echo "OUTWARS SCOUT EXECUTABLE FOLLOW-UP"
  echo "Executable: $EXE"
  echo "SHA256: $(sha256sum "$EXE" | awk '{print $1}')"
  echo "PE disassembler: $OBJDUMP"
  echo
  echo "========== RESOURCE STRING AND POINTER-TABLE REFERENCES =========="
  cat "$OUT/10-resource-string-references.txt"
  echo
  echo "========== scout.dpc LOADER CONTEXT: 0x486700 =========="
  cat "$OUT/11-scout-dpc-loader-context.txt"
  echo
  echo "========== GENERIC %s.dpc LOADER CONTEXT: 0x48CE40 =========="
  cat "$OUT/12-generic-dpc-loader-context.txt"
  echo
  echo "========== GENERIC DPC LOADER TAIL: 0x48D200 =========="
  cat "$OUT/13-generic-dpc-loader-tail.txt"
  echo
  echo "========== DPC VARIANT/RESOURCE POINTER TABLE =========="
  cat "$OUT/14-dpc-pointer-table.txt"
  echo
  echo "========== DIRECT REFERENCES / CALLERS =========="
  cat "$OUT/15-loader-callers.txt"
  echo
  echo "========== DPC NAME COLLECTION ROUTINE: 0x48CED4 =========="
  cat "$OUT/16-dpc-name-collection-routine.txt"
  echo
  echo "========== DPC RESOURCE OPEN FOLLOW-ON: 0x48D380 =========="
  cat "$OUT/17-dpc-resource-open-follow-on.txt"
  echo
  echo "========== CALLEE 0x4DD420 =========="
  cat "$OUT/18-callee-4dd420.txt"
  echo
  echo "========== CALLEE 0x4CE6C8 =========="
  cat "$OUT/19-callee-4ce6c8.txt"
  echo
  echo "========== CALLEE 0x455578 =========="
  cat "$OUT/20-callee-455578.txt"
  echo
  echo "========== CALLEE 0x500AE9 =========="
  cat "$OUT/21-callee-500ae9.txt"
  echo
  echo "========== FORMATTED RESOURCE STRING ADDRESSES =========="
  cat "$OUT/22-formatted-resource-strings.txt"
  echo
  echo "========== LOW-LEVEL FILE READER: 0x4CE158 =========="
  cat "$OUT/23-low-level-file-reader-4ce158.txt"
  echo
  echo "========== IO REDIRECT HELPERS =========="
  cat "$OUT/24-io-redirect-helpers.txt"
  echo
  echo "========== GLOBAL RESOURCE POINTER SETTER =========="
  cat "$OUT/25-global-resource-pointer-setter.txt"
  echo
  echo "========== IMPORT ADDRESS TABLE RESOLUTION =========="
  cat "$OUT/26-import-address-resolution.txt"
  echo
  echo "========== LOW-LEVEL FILE-READER TAIL: 0x4CE240 =========="
  cat "$OUT/27-low-level-file-reader-tail.txt"
  echo
  echo "========== VIRTUAL-FILE OPEN HELPER: 0x4CE080 =========="
  cat "$OUT/28-virtual-file-open-helper.txt"
  echo
  echo "========== VIRTUAL-FILE LOOKUP HELPER: 0x4CD5C0 =========="
  cat "$OUT/29-virtual-file-lookup-helper.txt"
  echo
  echo "========== RESOURCE LOADER CALLER: 0x48C6A8 =========="
  cat "$OUT/30-resource-loader-caller-48c6a8.txt"
  echo
  echo "========== CALLEE 0x4209A0 =========="
  cat "$OUT/31-callee-4209a0.txt"
  echo
  echo "========== CALLEE 0x4FEDB8 =========="
  cat "$OUT/32-callee-4fedb8.txt"
  echo
  echo "========== RESOURCE LOADER RECORD LOOPS: 0x48C890 =========="
  cat "$OUT/34-resource-loader-record-loops.txt"
  echo
  echo "========== CALLEE 0x422170: RESOURCE RECORD PARSER =========="
  cat "$OUT/35-callee-422170-resource-record-parser.txt"
  echo
  echo "========== CALLEE 0x4DF84C: RESOURCE TABLE SETUP =========="
  cat "$OUT/39-callee-4df84c-resource-table-setup.txt"
  echo
  echo "========== CALLEE 0x4DD470: RECORD LOOKUP =========="
  cat "$OUT/40-callee-4dd470-record-lookup.txt"
  echo
  echo "========== CALLEE 0x4DFCE4: RECORD DISPATCH =========="
  cat "$OUT/41-callee-4dfce4-record-dispatch.txt"
  echo
  echo "========== RECORD HANDLER TABLE REGION: 0x420AF0 =========="
  cat "$OUT/42-record-handler-table-region-disassembly.txt"
  echo
  echo "========== RECORD HANDLER TABLE RAW BYTES: 0x420B00 =========="
  cat "$OUT/43-record-handler-table-raw-bytes.txt"
  echo
  echo "========== THREE-COMPONENT FIELD HELPER: 0x4C5DB0 =========="
  cat "$OUT/44-callee-4c5db0-three-component-helper.txt"
  echo
  echo "========== FULL RECORD CALLBACK BODY: 0x4DFCE4 =========="
  cat "$OUT/45-callee-4dfce4-record-dispatch-full.txt"
  echo
  echo "========== RECORD CALLBACK BRANCH TARGET ROUTINES =========="
  cat "$OUT/46-record-handler-branch-targets.txt"
  echo
  echo "========== FULL THREE-COMPONENT ROTATION/MATRIX HELPER =========="
  cat "$OUT/47-three-component-rotation-matrix-helper-full.txt"
  echo
  echo "========== FIXED-POINT TRIG HELPER =========="
  cat "$OUT/48-fixed-point-trig-helper.txt"
  echo
  echo "========== RECORD-CALLBACK VALIDATION HELPER =========="
  cat "$OUT/49-record-callback-validation-helper.txt"
  echo
  echo "========== RAW POINTER REFERENCES TO TRANSFORM / DPC HANDLERS =========="
  cat "$OUT/50-raw-transform-handler-pointer-xrefs.txt"
  echo
  echo "========== FILE SIZE / READ HELPER =========="
  cat "$OUT/36-file-size-and-read-helper.txt"
  echo
  echo "========== RESOURCE PATH STRING HELPER =========="
  cat "$OUT/37-resource-path-string-helper.txt"
  echo
  echo "========== VIRTUAL RESOURCE MODE SETUP =========="
  cat "$OUT/38-virtual-resource-mode-setup.txt"
  echo
  echo "========== RESOURCE BUFFER / RECORD ARRAY XREFS =========="
  cat "$OUT/33-resource-buffer-xrefs.txt"
} > "$OUT/REPORT.txt"

echo "Created: $OUT/REPORT.txt"
echo "The full report was saved to disk; it is not printed to the terminal."
echo "New focused sections trace the DPC name collector and its downstream file/resource helpers."
