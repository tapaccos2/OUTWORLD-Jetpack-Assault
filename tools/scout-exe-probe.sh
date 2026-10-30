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

for tool in file sha256sum objdump strings python3; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Required tool missing: $tool"
    echo "On Debian/Ubuntu install binutils (objdump, strings) and file."
    exit 3
  }
done

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
  objdump -f "$EXE"
  echo
  echo "=== PE sections / virtual-to-file mapping ==="
  objdump -h "$EXE"
} > "$OUT/00-file-and-sections.txt" 2>&1

objdump -x "$EXE" > "$OUT/01-pe-headers-imports.txt" 2>&1
objdump -r "$EXE" > "$OUT/02-relocations.txt" 2>&1 || true

# Include the previously investigated address, with surrounding code.
objdump -d -Mintel --start-address=0x477200 --stop-address=0x478200 "$EXE" \
  > "$OUT/03-disassembly-477200-478200.txt" 2>&1 || true

# Full code-section disassembly for caller references and constants.
objdump -d -Mintel "$EXE" > "$OUT/04-full-code-disassembly.txt" 2>&1

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
} > "$OUT/README-REPORT.txt"

if command -v zip >/dev/null 2>&1; then
  (cd "$(dirname "$OUT")" && zip -qr "$(basename "$OUT").zip" "$(basename "$OUT")")
  echo "Created report: $(dirname "$OUT")/$(basename "$OUT").zip"
else
  tar -czf "$OUT.tar.gz" -C "$(dirname "$OUT")" "$(basename "$OUT")"
  echo "Created report: $OUT.tar.gz"
fi
echo "Full report directory: $OUT"
