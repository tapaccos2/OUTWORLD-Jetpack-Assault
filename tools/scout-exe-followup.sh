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
} > "$OUT/REPORT.txt"

echo "Created: $OUT/REPORT.txt"
cat "$OUT/REPORT.txt"
