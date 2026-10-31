#!/usr/bin/env bash
# Bridge the Scout DPC parser, callback record dispatcher and runtime transform path.
# Usage: bash tools/scout-exe-transform-bridge.sh /path/to/outwars.exe [output-dir]
set -euo pipefail
EXE="${1:-}"
OUT="${2:-/tmp/outwars-scout-transform-bridge}"
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
  echo "OUTWARS SCOUT DPC-TO-TRANSFORM BRIDGE"
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
  # Callback setup, dispatch, shared epilogue and record interpretation.
  dump "CALLBACK INITIALIZATION AND PRE-DISPATCH" 0x4dfc80 0x4dfde1
  dump "CALLBACK COMMON LOOP AND DISPATCH TAIL" 0x4e04a0 0x4e06a0
  # Both parser-to-callback call paths and the parser record dispatch.
  dump "PARSER CALLSITE A" 0x4209f0 0x420b00
  dump "PARSER CALLSITE B" 0x4221a0 0x422290
  dump "DPC RECORD PARSER" 0x422170 0x4222d0
  dump "RECORD RELOCATION / TYPE SWITCH" 0x4dd470 0x4dd700
  # Runtime object registration and the six-property path around its caller.
  dump "RUNTIME OBJECT RECORD REGISTRATION" 0x422300 0x422430
  dump "RUNTIME OBJECT CONSTRUCTION AND TRANSFORM" 0x422430 0x4227c0
  dump "SIX-PROPERTY DISPATCHER CALLER" 0x4213b0 0x421470
  dump "TRANSFORM RECORD CONSUMER" 0x4e3260 0x4e3460
  echo "========== DIRECT CALL REFERENCES =========="
  "$OBJDUMP" -d -Mintel "$EXE" 2>&1 | grep -Ei 'call[[:space:]].*(0x4dfce4|0x4dfd88|0x4e0130|0x4c6610|0x4c5aa0|0x422754|0x422654|0x42269c|0x422278|0x4222a8)' || true
} > "$OUT/REPORT.txt"
echo "Created: $OUT/REPORT.txt"
