#!/usr/bin/env bash
# One-run Scout next-stage tester: full prior audit plus software-renderer and class100/150 follow-up.
# Usage: bash tools/scout-next-stage.sh [/path/to/outwars.exe]
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
LOG_ROOT="$REPO_ROOT/scout-logs"
BASE="$LOG_ROOT/scout-parallel-audit"
OUT="$LOG_ROOT/scout-next-stage"
ZIP="$LOG_ROOT/scout-next-stage.zip"
EXPECTED="722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2"
EXE=""
if (( $# > 0 )); then EXE="$1"; fi
if [[ -z "$EXE" ]]; then
  for candidate in "$HOME/Outwars-extracted/outwars.exe" "$HOME/Documents/Outwars-extracted/outwars.exe" "$HOME/Downloads/outwars.exe" "$REPO_ROOT/outwars.exe"; do
    if [[ -f "$candidate" ]]; then EXE="$candidate"; break; fi
  done
fi
[[ -n "$EXE" && -f "$EXE" ]] || { echo "Cannot find outwars.exe. Pass its full path." >&2; exit 2; }
EXE="$(realpath "$EXE")"
for tool in bash node python3 sha256sum zip; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 3; }
done
ACTUAL="$(sha256sum "$EXE" | awk '{print $1}')"
[[ "$ACTUAL" == "$EXPECTED" ]] || {
  echo "Executable build mismatch; refusing to combine reports." >&2
  echo "Expected: $EXPECTED" >&2
  echo "Found:    $ACTUAL" >&2
  exit 4
}
for f in "$REPO_ROOT/original-data/units.ff" "$REPO_ROOT/original-data/motion.ff" \
         "$SCRIPT_DIR/scout-parallel-audit.sh" "$SCRIPT_DIR/scout-next-stage-analysis.py" \
         "$SCRIPT_DIR/extract-ff-resources.mjs"; do
  [[ -f "$f" ]] || { echo "Required project file missing: $f" >&2; exit 5; }
done
mkdir -p "$LOG_ROOT"
rm -rf -- "$OUT"
rm -f -- "$ZIP"
echo "OUTWARS SCOUT NEXT-STAGE TESTER"
echo "Executable SHA256: $ACTUAL"
echo "Running the complete geometry/renderer/material/animation baseline in parallel..."
bash "$SCRIPT_DIR/scout-parallel-audit.sh" "$EXE"
mkdir -p "$OUT/work"
echo "Extracting Scout DPC variants for the class-100 and class-150 slot audit..."
node "$SCRIPT_DIR/extract-ff-resources.mjs" "$REPO_ROOT/original-data/units.ff" --out "$OUT/work/extracted" \
  > "$OUT/EXTRACTION-LOG.txt" 2>&1
UNITS="$OUT/work/extracted/units"
[[ -d "$UNITS" ]] || { echo "Expected extracted units directory missing: $UNITS" >&2; exit 6; }
echo "Running software textured-polygon and all-variant transform analysis..."
python3 "$SCRIPT_DIR/scout-next-stage-analysis.py" \
  --exe "$EXE" --base "$BASE" --units "$UNITS" --out "$OUT"
rm -rf -- "$OUT/work"
{
  echo "Outwars Scout next-stage tester"
  echo "Date: $(date -Is)"
  echo "Executable SHA256: $ACTUAL"
  echo "Baseline: $BASE"
  echo "Supplement: $OUT"
  echo
  echo "Baseline statuses:"
  for f in "$BASE"/logs/*.status; do
    [[ -f "$f" ]] || continue
    printf '%s: ' "$(basename "$f")"
    cat "$f"
  done
  echo
  echo "New outputs:"
  find "$OUT" -type f -printf '%P %s bytes\n' | sort
} > "$OUT/FILE-INVENTORY.txt"
(cd "$LOG_ROOT" && zip -qr "$(basename "$ZIP")" "$(basename "$BASE")" "$(basename "$OUT")")
[[ -s "$ZIP" ]] || { echo "Failed to create consolidated ZIP." >&2; exit 7; }
echo
echo "SCOUT NEXT-STAGE TESTER COMPLETE"
echo "Single upload: $ZIP"
echo "Summary: $OUT/SCOUT-NEXT-STAGE-REPORT.md"
echo "Supplemental renderer findings: $OUT/renderer/SOFTWARE-RENDERER-PIPELINE.md"
