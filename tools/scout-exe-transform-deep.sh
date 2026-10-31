#!/usr/bin/env bash
# Resolve callback record branches and the complete six-property staging path.
# Usage: bash tools/scout-exe-transform-deep.sh [path/to/outwars.exe] [output-dir]
set -euo pipefail
EXE="${1:-}"
OUT="${2:-/tmp/outwars-scout-transform-deep}"
if [[ -z "$EXE" ]]; then
  for candidate in "$PWD/outwars.exe" "$HOME/Outwars-extracted/outwars.exe" "$HOME/Documents/Outwars-extracted/outwars.exe" "$HOME/Downloads/outwars.exe"; do
    if [[ -f "$candidate" ]]; then EXE="$candidate"; break; fi
  done
fi
if [[ -z "$EXE" || ! -f "$EXE" ]]; then echo "Pass the path to outwars.exe." >&2; exit 2; fi
OBJDUMP=""
for candidate in i686-w64-mingw32-objdump x86_64-w64-mingw32-objdump objdump; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -f "$EXE" >/dev/null 2>&1; then OBJDUMP="$(command -v "$candidate")"; break; fi
done
if [[ -z "$OBJDUMP" ]]; then echo "No PE-capable objdump found." >&2; exit 3; fi
mkdir -p "$OUT"
{
  echo "OUTWARS SCOUT TRANSFORM-DEEP FOLLOW-UP"
  echo "Executable: $EXE"
  echo "SHA256: $(sha256sum "$EXE" | awk '{print $1}')"
  echo "PE disassembler: $OBJDUMP"
  echo
  dump() {
    local title="$1" start="$2" stop="$3"
    echo "========== $title ($start-$stop) =========="
    "$OBJDUMP" -d -Mintel --start-address="$start" --stop-address="$stop" "$EXE" 2>&1
    echo
  }
  dump "CALLBACK BRANCH 00" 0x4dfde1 0x4dfe56
  dump "CALLBACK BRANCH 01" 0x4dfe56 0x4dfef3
  dump "CALLBACK BRANCH 02" 0x4dfef3 0x4dff99
  dump "CALLBACK BRANCH 03" 0x4dff99 0x4e006d
  dump "CALLBACK BRANCH 04" 0x4e006d 0x4e0130
  dump "CALLBACK BRANCH 05" 0x4e0130 0x4e023a
  dump "CALLBACK BRANCH 06" 0x4e023a 0x4e0253
  dump "CALLBACK BRANCH 07" 0x4e0253 0x4e02e7
  dump "CALLBACK BRANCH 08" 0x4e02e7 0x4e0399
  dump "CALLBACK BRANCH 09" 0x4e0399 0x4e0494
  dump "CALLBACK BRANCH 10" 0x4e0494 0x4e04a2
  dump "CALLBACK BRANCH 11" 0x4e04a2 0x4e0580
  dump "SIX-PROPERTY HANDLER COMPLETE" 0x42671c 0x426940
  dump "PROPERTY WRITER COMPLETE" 0x42649c 0x4265e0
  dump "PROPERTY RECORD SCAN COMPLETE" 0x4778c0 0x477aa0
  dump "FIXED-POINT MATRIX MULTIPLY A" 0x4c5818 0x4c58b0
  dump "FIXED-POINT MATRIX MULTIPLY B" 0x4c5aa0 0x4c5c30
  dump "FIXED-POINT MATRIX MULTIPLY C" 0x4c6610 0x4c6684
  dump "FIXED-POINT MATRIX MULTIPLY D" 0x4c6684 0x4c6710
  dump "CALLBACK HELPER / POINTER REGISTRY" 0x4df970 0x4dfb20
  dump "CALLBACK SECONDARY POSITION SETTERS" 0x4e1a98 0x4e1bd0
  dump "RECORD-LINK CONSUMER" 0x4e32a2 0x4e33f0
  dump "CALLBACK DISPATCHER CALLSITE AND SWITCH" 0x420af0 0x420c80
  echo "========== RAW POINTER OCCURRENCES =========="
  python3 - "$EXE" <<'PY'
import struct, sys
from pathlib import Path
data = Path(sys.argv[1]).read_bytes()
targets = (0x4DFDE1,0x4DFE56,0x4DFEF3,0x4DFF99,0x4E006D,0x4E0130,
           0x4E023A,0x4E0253,0x4E02E7,0x4E0399,0x4E0494,0x4E04A2,
           0x42671C,0x42649C,0x4778C0,0x4E59C8,0x4E32A2,0x4E1B40)
for va in targets:
    needle=struct.pack("<I",va); hits=[]; p=0
    while True:
        p=data.find(needle,p)
        if p<0: break
        hits.append(p); p+=1
    print(f"VA 0x{va:08X}: {len(hits)} raw occurrence(s)")
    for p in hits:
        print(f"  file+0x{p:X}: {data[max(0,p-8):min(len(data),p+12)].hex(' ')}")
PY
} > "$OUT/REPORT.txt"
echo "Created: $OUT/REPORT.txt"
