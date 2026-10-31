#!/usr/bin/env bash
# OUTWARS Scout: consolidated executable investigation report
# Version: 1.0.0
# Usage: bash tools/scout-full-diagnostic.sh /path/to/outwars.exe [output-dir]
# Produces one report containing the complete known DPC/runtime path, broad
# surrounding routines, and whole-executable xrefs to every known pivot.
set -euo pipefail
EXE="${1:-}"
OUT="${2:-$PWD/scout-full-diagnostic}"
if [[ -z "$EXE" ]]; then
  for candidate in "$PWD/outwars.exe" "$HOME/Outwars-extracted/outwars.exe" "$HOME/Documents/Outwars-extracted/outwars.exe" "$HOME/Downloads/outwars.exe"; do
    [[ -f "$candidate" ]] && EXE="$candidate" && break
  done
fi
[[ -n "$EXE" && -f "$EXE" ]] || { echo "Pass the path to outwars.exe" >&2; exit 2; }
OBJDUMP=""
for candidate in i686-w64-mingw32-objdump x86_64-w64-mingw32-objdump objdump; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -f "$EXE" >/dev/null 2>&1; then OBJDUMP="$(command -v "$candidate")"; break; fi
done
[[ -n "$OBJDUMP" ]] || { echo "No PE-capable objdump found" >&2; exit 3; }
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
"$OBJDUMP" -d -Mintel "$EXE" > "$TMP/all-disassembly.txt" 2>&1
{
  echo "OUTWARS SCOUT FULL DIAGNOSTIC v1.0.0"
  echo "Executable: $EXE"
  echo "SHA256: $(sha256sum "$EXE" | awk '{print $1}')"
  echo "Disassembler: $OBJDUMP"
  echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo
  echo "========== PE SECTIONS / HEADERS =========="
  "$OBJDUMP" -h "$EXE" 2>&1
  "$OBJDUMP" -p "$EXE" 2>&1 | grep -Ei 'ImageBase|AddressOfEntryPoint|SectionAlignment|FileAlignment|Subsystem|DLL Name' || true
  echo
  dump() {
    local title="$1" start="$2" stop="$3"
    echo "========== $title ($start-$stop) =========="
    "$OBJDUMP" -d -Mintel --start-address="$start" --stop-address="$stop" "$EXE" 2>&1
    echo
  }
  # Parser, property dispatch, record handlers, object creation and registration.
  dump "DPC PARSER AND PROPERTY DISPATCH FULL CONTEXT" 0x41f000 0x423000
  dump "RUNTIME OBJECT FACTORY / TABLE INITIALISATION" 0x426000 0x428000
  dump "EIGHT-SLOT TABLE CONSUMERS A" 0x42e800 0x42fa00
  dump "EIGHT-SLOT TABLE CONSUMERS B" 0x430f00 0x431800
  dump "EIGHT-SLOT TABLE CONSUMERS C" 0x433a00 0x435700
  dump "EIGHT-SLOT ADDRESS HELPER" 0x46e000 0x46e800
  # DPC callback setup, transform record construction, composition and consumer.
  dump "DPC RECORD RELOCATION / CALLBACK PREPARATION" 0x4dd000 0x4de000
  dump "CALLBACK STATE / OPCODE DISPATCH / TRANSFORM STACK" 0x4df000 0x4e0800
  dump "FULL TRANSFORM RECORD CONSUMER" 0x4e3000 0x4e4100
  # Matrix and vector helpers used by the callback.
  dump "MATRIX / VECTOR ARITHMETIC HELPERS" 0x4c5400 0x4c6800
  echo "========== WHOLE-EXECUTABLE CALL XREFS TO KNOWN FUNCTIONS =========="
  grep -Ei 'call[[:space:]].*(0x420b00|0x422170|0x422278|0x4222a8|0x422332|0x422554|0x46e4c0|0x4c5500|0x4c57dc|0x4c5aa0|0x4c6610|0x4df86c|0x4dfce4|0x4dfd88|0x4e0130|0x4e3260)' "$TMP/all-disassembly.txt" || true
  echo
  echo "========== WHOLE-EXECUTABLE REFERENCES TO TABLE BASE / STRIDE =========="
  grep -Ei '0x72365c|0x48e4|72365c|48e4' "$TMP/all-disassembly.txt" || true
  echo
  echo "========== WHOLE-EXECUTABLE REFERENCES TO RUNTIME OBJECT FIELDS =========="
  grep -Ei '\[(e[a-z]{2}|[a-z]{3})\+0x(0?b4|0?e4|0?e6|0?e8|0?ec|0?f0|0?f4|0?104|0?108|0?160)\]|0x(0?b4|0?e4|0?e6|0?e8|0?ec|0?f0|0?f4|0?104|0?108|0?160)' "$TMP/all-disassembly.txt" || true
  echo
  echo "========== WHOLE-EXECUTABLE REFERENCES TO GLOBAL TRANSFORM STATE =========="
  grep -Ei '0x12d6a(40|44|48|4c|50|54|5c)|0x12d6c(3c|40|44|48|4c|50|54|58|5c|60|64|68|6c|70|74|78|7c)|0x52d2(18|1c|20|8c)|0x647538' "$TMP/all-disassembly.txt" || true
  echo
  echo "========== ALL DIRECT CALLS IN THE PARSER / TRANSFORM WINDOWS =========="
  grep -E '^[[:space:]]*[0-9a-f]+:.*call' "$TMP/all-disassembly.txt" | awk 'strtonum("0x" substr($1,1,length($1)-1)) >= 0x41f000 && strtonum("0x" substr($1,1,length($1)-1)) < 0x423000 {print}' 2>/dev/null || true
  echo
  echo "========== DIAGNOSTIC NOTES =========="
  echo "This report consolidates known code paths and static cross-references; it cannot infer runtime object values not present in the executable."
  echo "No exporter transforms are applied or recommended by this script."
} > "$OUT/REPORT.txt"
echo "Created: $OUT/REPORT.txt"
