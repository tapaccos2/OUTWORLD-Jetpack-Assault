#!/usr/bin/env bash
# One-shot, read-only evidence capture for the Scout runtime attachment/transform investigation.
# Usage:
#   bash tools/scout-reconstruction-capture.sh [outwars.exe] [extracted-ff/units] [output-dir]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXE="${1:-}"
DPC_DIR="${2:-$ROOT/extracted-ff/units}"
OUT="${3:-/tmp/outwars-scout-reconstruction-capture}"

if [[ -z "$EXE" ]]; then
  for candidate in "$HOME/Outwars-extracted/outwars.exe" "$HOME/Documents/Outwars-extracted/outwars.exe" "$ROOT/outwars.exe"; do
    if [[ -f "$candidate" ]]; then EXE="$candidate"; break; fi
  done
fi
if [[ -z "$EXE" || ! -f "$EXE" ]]; then
  echo "Pass the path to outwars.exe as argument 1." >&2
  exit 2
fi
if [[ ! -f "$DPC_DIR/scout_mj.dpc" ]]; then
  echo "Could not find $DPC_DIR/scout_mj.dpc. Pass the extracted units directory as argument 2." >&2
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
  echo "No PE-capable objdump found. Install: sudo apt install binutils-mingw-w64-i686" >&2
  exit 3
fi

mkdir -p "$OUT"
rm -f "$OUT"/*.json "$OUT"/REPORT.txt "$OUT.zip"

DPCS=()
for f in "$DPC_DIR"/scout_*.dpc "$DPC_DIR"/test.dpc; do
  [[ -f "$f" ]] && DPCS+=("$f")
done
if [[ ! " ${DPCS[*]} " =~ " $DPC_DIR/scout_mj.dpc " ]]; then
  DPCS+=("$DPC_DIR/scout_mj.dpc")
fi

{
  echo "OUTWARS SCOUT RECONSTRUCTION CAPTURE"
  echo "Date: $(date -Is)"
  echo "Repo: $ROOT"
  echo "Executable: $EXE"
  echo "Executable SHA256: $(sha256sum "$EXE" | awk '{print $1}')"
  echo "Objdump: $OBJDUMP"
  echo "DPC directory: $DPC_DIR"
  echo
  echo "========== DPC INPUTS =========="
  for f in "${DPCS[@]}"; do
    echo "$(basename "$f")  bytes=$(stat -c %s "$f")  sha256=$(sha256sum "$f" | awk '{print $1}')"
  done
  echo
  dump() {
    local title="$1" start="$2" stop="$3"
    echo "========== $title ($start-$stop) =========="
    "$OBJDUMP" -d -Mintel --start-address="$start" --stop-address="$stop" "$EXE" 2>&1
    echo
  }
  dump "DPC PROPERTY HANDLER ROUTING" 0x420af0 0x422170
  dump "DPC PARSER AND RUNTIME SETTERS/REGISTRATION" 0x422170 0x422720
  dump "FULL CALLBACK DISPATCH AND ALL OPCODE BRANCHES" 0x4dfce4 0x4e0580
  dump "DPC RELOCATION DISPATCH" 0x4dd470 0x4dda80
  dump "FIXED-POINT ROTATION/MATRIX HELPERS" 0x4c5440 0x4c6710
  dump "RUNTIME TRANSFORM RECORD CONSUMER" 0x4e32a2 0x4e3460
  dump "RESOURCE LOADER/ALLOCATION BASE SETUP" 0x48c6a8 0x48ca60
  echo "========== RAW EXECUTABLE POINTER OCCURRENCES =========="
  python3 - "$EXE" <<'PY'
import struct, sys
from pathlib import Path
data = Path(sys.argv[1]).read_bytes()
targets = (0x420B00,0x422170,0x422278,0x4222A8,0x422332,0x42244C,
           0x422554,0x422654,0x42269C,0x422754,0x42671C,0x42693C,
           0x433090,0x437C80,0x4C5DB0,0x4C6610,0x4DFCE4,0x4DFEF3,
           0x4E0130,0x4E32A2)
for va in targets:
    needle=struct.pack("<I",va); hits=[]; p=0
    while True:
        p=data.find(needle,p)
        if p<0: break
        hits.append(p); p+=1
    print(f"VA 0x{va:08X}: {len(hits)} occurrence(s)")
    for p in hits[:30]:
        print(f"  file+0x{p:X}: {data[max(0,p-8):min(len(data),p+12)].hex(' ')}")
PY
} > "$OUT/REPORT.txt"

# Structural scans across every available Scout DPC variant; no source assets are modified.
node "$ROOT/tools/inspect-scout-callback-records.mjs" "${DPCS[@]}" > "$OUT/callback-records.json"
node "$ROOT/tools/inspect-scout-callback-descriptor-targets.mjs" "${DPCS[@]}" > "$OUT/callback-descriptor-targets.json"
node "$ROOT/tools/inspect-scout-transform-records.mjs" "${DPCS[@]}" > "$OUT/transform-record-candidates.json"
node "$ROOT/tools/audit-scout-transform-attachments.mjs" "$DPC_DIR/scout_mj.dpc" "$OUT/transform-attachment-graph.json"
node "$ROOT/tools/inspect-scout-part-graph.mjs" "$DPC_DIR/scout_mj.dpc" "$OUT/male-part-graph.json"

# Bundle reports only. The executable and original DPC files are never copied.
python3 - "$OUT" "$OUT.zip" <<'PY'
import sys, zipfile
from pathlib import Path
folder, archive = Path(sys.argv[1]), Path(sys.argv[2])
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for p in sorted(folder.iterdir()):
        if p.is_file() and p != archive:
            z.write(p, p.name)
print(f"Created {archive} ({archive.stat().st_size} bytes)")
PY
