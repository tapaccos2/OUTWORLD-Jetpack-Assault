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
"$OBJDUMP" -d -Mintel --start-address=0x48d380 --stop-address=0x48d600 "$EXE" \
  > "$OUT/17-dpc-resource-open-follow-on.txt" 2>&1
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
  --targets "0x486720,0x48ce71,0x48ce89,0x48cea1,0x48ced4,0x48cfb0,0x4ee38a,0x500ae9,0x4dd420,0x4ce6c8,0x455578,0x48d3aa" \
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
} > "$OUT/REPORT.txt"

echo "Created: $OUT/REPORT.txt"
echo "The full report was saved to disk; it is not printed to the terminal."
echo "New focused sections trace the DPC name collector and its downstream file/resource helpers."
