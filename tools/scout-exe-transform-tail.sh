#!/usr/bin/env bash
# Minimal follow-up for the Scout transform investigation.
# Usage: bash tools/scout-exe-transform-tail.sh [path/to/outwars.exe] [output-dir]
set -euo pipefail

EXE="${1:-}"
OUT="${2:-/tmp/outwars-scout-transform-tail}"

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
  echo "Could not find outwars.exe. Pass its path as the first argument." >&2
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
{
  echo "OUTWARS SCOUT TRANSFORM-TAIL FOLLOW-UP"
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
  dump "FULL DPC CALLBACK INCLUDING TAIL" 0x4dfce4 0x4e0580
  dump "DPC HANDLER DISPATCHER" 0x420af0 0x420c50
  dump "RUNTIME OBJECT TABLE REGISTRATION TAIL" 0x422554 0x422720
  dump "SIX-FIELD PROPERTY HANDLER" 0x426900 0x426b20
  dump "SMALL PROPERTY-RANGE HANDLER" 0x416e70 0x416f50
  dump "DPC POSITION/ROTATION SETTERS" 0x422260 0x422340
  dump "DPC OBJECT REGISTRATION AND LINKS" 0x422332 0x422560
  dump "COMBINED ACTOR TRANSFORM" 0x433080 0x433170
  dump "DIRECT CALLER OF COMBINED ACTOR TRANSFORM" 0x41cd50 0x41cfb0

  echo "========== RAW POINTER OCCURRENCES =========="
  python3 - "$EXE" <<'PY'
import struct, sys
from pathlib import Path
data = Path(sys.argv[1]).read_bytes()
targets = (0x416E90, 0x420B00, 0x422278, 0x4222A8, 0x42244C,
           0x422554, 0x42693C, 0x433090, 0x4E04B0)
for va in targets:
    needle = struct.pack("<I", va)
    offsets, pos = [], 0
    while True:
        pos = data.find(needle, pos)
        if pos < 0: break
        offsets.append(pos)
        pos += 1
    print(f"VA 0x{va:08X}: {len(offsets)} raw occurrence(s)")
    for off in offsets:
        lo, hi = max(0, off - 8), min(len(data), off + 12)
        print(f"  file+0x{off:X}: {data[lo:hi].hex(' ')}")
PY
} > "$OUT/REPORT.txt"

echo "Created: $OUT/REPORT.txt"
