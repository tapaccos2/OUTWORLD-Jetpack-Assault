#!/usr/bin/env bash
# Targeted follow-up: resolve the DPC callback's record-type branches and the six-property path.
# Usage: bash tools/scout-exe-transform-paths.sh [path/to/outwars.exe] [output-dir]
set -euo pipefail

EXE="${1:-}"
OUT="${2:-/tmp/outwars-scout-transform-paths}"
if [[ -z "$EXE" ]]; then
  for candidate in "$PWD/outwars.exe" "$HOME/Outwars-extracted/outwars.exe" "$HOME/Documents/Outwars-extracted/outwars.exe" "$HOME/Downloads/outwars.exe"; do
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
  echo "OUTWARS SCOUT TRANSFORM-PATH FOLLOW-UP"
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
  dump "DPC CALLBACK TYPE DISPATCH TABLE" 0x4dfcac 0x4dfce4
  dump "DPC CALLBACK TYPE-1 HELPER" 0x4df940 0x4dfa30
  dump "DPC CALLBACK RECORD TYPE RESOLVER" 0x4e59a0 0x4e5a20
  dump "SIX-PROPERTY WRAPPER AND CORE HANDLER" 0x426700 0x426820
  dump "PROPERTY VALUE WRITER" 0x426470 0x426530
  dump "PROPERTY LOOKUP / TABLE HELPER" 0x477890 0x477930
  dump "CALLBACK MATRIX AND TRANSFORM HELPERS A" 0x4c5440 0x4c56c0
  dump "CALLBACK MATRIX AND TRANSFORM HELPERS B" 0x4c57a0 0x4c5860
  dump "CALLBACK MATRIX AND TRANSFORM HELPERS C" 0x4c5a70 0x4c5b40
  dump "CALLBACK MATRIX AND TRANSFORM HELPERS D" 0x4c65b0 0x4c6710
  dump "DISPATCHER SECONDARY HANDLER A" 0x4e1a80 0x4e1b50
  dump "DISPATCHER SECONDARY HANDLER B" 0x4e3230 0x4e32d0
  dump "CALLBACK ENTRY CALLSITE A" 0x420a40 0x420aa0
  dump "CALLBACK ENTRY CALLSITE B" 0x4221d0 0x422240

  echo "========== RAW POINTER OCCURRENCES =========="
  python3 - "$EXE" <<'PY'
import struct, sys
from pathlib import Path
data = Path(sys.argv[1]).read_bytes()
targets = (0x4DF970, 0x4E59C8, 0x42671C, 0x42649C, 0x4778C0,
           0x4C6610, 0x4C57DC, 0x4C5500, 0x4C5AA0, 0x4C65D9,
           0x4E1AD8, 0x4E3260, 0x4DFCE4)
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
