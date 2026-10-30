#!/usr/bin/env bash
# One-run Outwars executable probe for Scout DPC/render path investigation.
# Usage: bash tools/scout-exe-probe.sh [path/to/outwars.exe] [output-directory]
set -euo pipefail

EXE="${1:-}"
OUT="${2:-/tmp/outwars-scout-exe-probe}"

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
  echo "Could not find outwars.exe automatically."
  echo "Run: find \"\$HOME\" -type f -iname outwars.exe -print -quit"
  echo "Then pass the returned path to this script."
  exit 2
fi

for tool in file sha256sum strings python3; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Required tool missing: $tool"
    echo "On Debian/Ubuntu install binutils (objdump, strings) and file."
    exit 3
  }
done

# Select a GNU objdump that actually understands this Windows PE executable.
# The host's generic objdump may have been built without PE/COFF support.
OBJDUMP=""
for candidate in i686-w64-mingw32-objdump x86_64-w64-mingw32-objdump objdump; do
  if command -v "$candidate" >/dev/null 2>&1 &&
     "$candidate" -f "$EXE" >/dev/null 2>&1; then
    OBJDUMP="$(command -v "$candidate")"
    break
  fi
done
if [[ -z "$OBJDUMP" ]]; then
  echo "No installed objdump can read this PE32 executable."
  echo "On Debian/Ubuntu, install the 32-bit MinGW binutils:"
  echo "  sudo apt-get update && sudo apt-get install -y binutils-mingw-w64-i686"
  echo "Then rerun this script."
  exit 4
fi
echo "Using PE-capable disassembler: $OBJDUMP"

mkdir -p "$OUT"
EXE="$(realpath "$EXE")"

{
  echo "OUTWARS SCOUT EXECUTABLE PROBE"
  echo "Date: $(date -Is)"
  echo "Executable: $EXE"
  echo
  file "$EXE"
  sha256sum "$EXE"
  echo
  echo "=== PE file format ==="
  "$OBJDUMP" -f "$EXE"
  echo
  echo "=== PE sections / virtual-to-file mapping ==="
  "$OBJDUMP" -h "$EXE"
} > "$OUT/00-file-and-sections.txt" 2>&1

"$OBJDUMP" -x "$EXE" > "$OUT/01-pe-headers-imports.txt" 2>&1
"$OBJDUMP" -r "$EXE" > "$OUT/02-relocations.txt" 2>&1 || true

# Include the previously investigated address, with surrounding code.
"$OBJDUMP" -d -Mintel --start-address=0x477200 --stop-address=0x478200 "$EXE" \
  > "$OUT/03-disassembly-477200-478200.txt" 2>&1 || true

# Full code-section disassembly for caller references and constants.
"$OBJDUMP" -d -Mintel "$EXE" > "$OUT/04-full-code-disassembly.txt" 2>&1

# Focused disassembly of the direct scout.dpc loader reference and generic
# "%s.dpc" resource-name call sites found by the string-reference scan.
"$OBJDUMP" -d -Mintel --start-address=0x486700 --stop-address=0x486900 "$EXE" \
  > "$OUT/11-scout-dpc-loader-context.txt" 2>&1
"$OBJDUMP" -d -Mintel --start-address=0x48ce40 --stop-address=0x48d220 "$EXE" \
  > "$OUT/12-generic-dpc-loader-context.txt" 2>&1

grep -n -B 8 -A 8 -E '(^|[^[:xdigit:]])0x0*477680([^[:xdigit:]]|$)|call[[:space:]]+0x0*477680|jmp[[:space:]]+0x0*477680' \
  "$OUT/04-full-code-disassembly.txt" > "$OUT/05-xrefs-to-477680.txt" || true

HEX_10000="$(printf '%x' 10000)"
HEX_2250000="$(printf '%x' 2250000)"
grep -n -i -E "0x0*${HEX_10000}|0x0*${HEX_2250000}" \
  "$OUT/04-full-code-disassembly.txt" > "$OUT/06-wrapper-constant-references.txt" || true

strings -a -n 3 -t x "$EXE" > "$OUT/07-all-strings.txt"
grep -i -E '\.(dpc|mc|tpc|tga|pcx)|scout|mesh|bone|anim|transform|matrix|render|armour|armor' \
  "$OUT/07-all-strings.txt" > "$OUT/08-relevant-strings.txt" || true

python3 - "$EXE" "$OUT/09-raw-address-hits.txt" <<'PY'
import pathlib, struct, sys
exe = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
data = exe.read_bytes()
target = struct.pack("<I", 0x477680)
hits = []
start = 0
while True:
    pos = data.find(target, start)
    if pos < 0:
        break
    hits.append(pos)
    start = pos + 1
out.write_text(
    "Target VA: 0x477680\n"
    f"Little-endian byte pattern: {target.hex(' ')}\n"
    f"Occurrences: {len(hits)}\n"
    + "".join(f"file_offset=0x{p:X} ({p})\n" for p in hits),
    encoding="utf-8"
)
PY

python3 "$(dirname "$0")/scan-scout-exe-strings.py" "$EXE" "$OUT/04-full-code-disassembly.txt" "$OUT/10-resource-string-references.txt"

{
  echo "=== Probe summary ==="
  echo "Executable: $EXE"
  echo "SHA256: $(sha256sum "$EXE" | awk '{print $1}')"
  echo
  echo "=== Relevant files ==="
  find "$OUT" -maxdepth 1 -type f -printf '%f %s bytes\n' | sort
  echo
  echo "=== Disassembly around 0x477680 ==="
  sed -n '1,260p' "$OUT/03-disassembly-477200-478200.txt"
  echo
  echo "=== Direct xrefs to 0x477680 ==="
  cat "$OUT/05-xrefs-to-477680.txt"
  echo
  echo "=== Wrapper constant references ==="
  sed -n '1,160p' "$OUT/06-wrapper-constant-references.txt"
  echo
  echo "=== Relevant strings ==="
  sed -n '1,220p' "$OUT/08-relevant-strings.txt"
  echo
  echo "=== Raw address byte-pattern hits ==="
  cat "$OUT/09-raw-address-hits.txt"
  echo
  echo "=== Scout resource string references ==="
  sed -n '1,420p' "$OUT/10-resource-string-references.txt"
  echo
  echo "=== scout.dpc loader context (0x486700) ==="
  cat "$OUT/11-scout-dpc-loader-context.txt"
  echo
  echo "=== generic DPC loader context (0x48CE40) ==="
  cat "$OUT/12-generic-dpc-loader-context.txt"
} > "$OUT/README-REPORT.txt"

if command -v zip >/dev/null 2>&1; then
  (cd "$(dirname "$OUT")" && zip -qr "$(basename "$OUT").zip" "$(basename "$OUT")")
  echo "Created report: $(dirname "$OUT")/$(basename "$OUT").zip"
else
  tar -czf "$OUT.tar.gz" -C "$(dirname "$OUT")" "$(basename "$OUT")"
  echo "Created report: $OUT.tar.gz"
fi
echo "Full report directory: $OUT"
