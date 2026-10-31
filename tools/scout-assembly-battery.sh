#!/usr/bin/env bash
# OUTWARS SCOUT ASSEMBLY TEST BATTERY
# Run from the repository root:
#   bash tools/scout-assembly-battery.sh

set -uo pipefail

ROOT="$(pwd)"
OUT="$ROOT/scout-assembly-battery"
TOOLS="$ROOT/tools"
LOG="$OUT/logs/battery.log"

mkdir -p "$OUT"/{geometry,transforms,descriptors,textures,motion,logs}

PASSED=0
FAILED=0
ERRORS=0

pause_exit() {
  echo
  echo "Press ENTER to close."
  read -r _
}

run_test() {
  local label="$1"
  shift
  echo
  echo "------------------------------------------------------------"
  echo "TEST: $label"
  echo "------------------------------------------------------------"
  if "$@" >>"$LOG" 2>&1; then
    echo "PASS: $label"
    PASSED=$((PASSED + 1))
  else
    local code=$?
    echo "FAIL: $label (exit code $code)"
    echo "See $LOG"
    FAILED=$((FAILED + 1))
  fi
}

echo "OUTWARS SCOUT ASSEMBLY TEST BATTERY"
echo "Started: $(date)"
echo "Repository: $ROOT"
echo "Started: $(date)" >"$LOG"

# Confirm that the script was launched from the repository root.
if [[ ! -d "$TOOLS" || ! -d original-data ]]; then
  echo "ERROR: Run this script from the repository root (the folder containing tools/ and original-data/)."
  pause_exit
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed or not in PATH."
  pause_exit
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "ERROR: zip is not installed. Install with: sudo apt install zip"
  pause_exit
  exit 1
fi

REQUIRED_TOOLS=(
  export-dpc-armour-geometry.mjs
  inspect-scout-transform-records.mjs
  inspect-scout-callback-descriptor-targets.mjs
  inspect-tpc-records.mjs
  decode-tpc-palette-textures.mjs
  inspect-motion-catalog.mjs
)

for tool in "${REQUIRED_TOOLS[@]}"; do
  if [[ ! -f "$TOOLS/$tool" ]]; then
    echo "ERROR: Missing required tool: $TOOLS/$tool"
    ERRORS=$((ERRORS + 1))
  fi
done

mapfile -t DPCS < <(find original-data -type f -iname 'scout_*.dpc' | sort)
mapfile -t TPCS < <(find original-data -type f -iname 'scout_*.tpc' | sort)
mapfile -t MCDIRS < <(find original-data -type d -iname 'motion' | sort)

printf '%s\n' "${DPCS[@]}" >"$OUT/dpc-file-list.txt"
printf '%s\n' "${TPCS[@]}" >"$OUT/tpc-file-list.txt"

echo "DPC files found: ${#DPCS[@]}"
echo "TPC files found: ${#TPCS[@]}"
echo "Motion directories found: ${#MCDIRS[@]}"

if [[ ${#DPCS[@]} -eq 0 ]]; then
  echo "ERROR: No Scout DPC files found under original-data."
  echo "Check that you are running this from the repository root."
  pause_exit
  exit 1
fi

# 1. Scan all variants for candidate hierarchical transform records.
run_test "Opcode-5 transform candidate scan"   node "$TOOLS/inspect-scout-transform-records.mjs" "${DPCS[@]}"   >"$OUT/transforms/opcode5-candidates.json"

# 2. Follow all opcode-2 callback descriptor pointer chains.
run_test "Opcode-2 callback descriptor scan"   node "$TOOLS/inspect-scout-callback-descriptor-targets.mjs" "${DPCS[@]}"   >"$OUT/descriptors/callback-descriptors.json"

# 3. Export three geometry interpretations for every DPC variant.
for DPC in "${DPCS[@]}"; do
  NAME="$(basename "$DPC" .dpc)"
  echo
  echo "GEOMETRY VARIANT: $NAME"

  run_test "$NAME shared-pool geometry"     node "$TOOLS/export-dpc-armour-geometry.mjs"     "$DPC" "$OUT/geometry/$NAME-shared.glb"

  run_test "$NAME mesh-reference geometry"     node "$TOOLS/export-dpc-armour-geometry.mjs"     "$DPC" "$OUT/geometry/$NAME-local-reference.glb"     --use-mesh-vertex-reference

  run_test "$NAME reference-point mapping"     node "$TOOLS/export-dpc-armour-geometry.mjs"     "$DPC" "$OUT/geometry/$NAME-point-mapping.glb"     --apply-reference-point-mapping
done

# 4. Inspect and decode every available Scout TPC.
if [[ ${#TPCS[@]} -eq 0 ]]; then
  echo "WARNING: No Scout TPC files found."
else
  for TPC in "${TPCS[@]}"; do
    NAME="$(basename "$TPC" .tpc)"
    TEXTURE_OUT="$OUT/textures/$NAME"
    mkdir -p "$TEXTURE_OUT"

    run_test "$NAME texture record inspection"       node "$TOOLS/inspect-tpc-records.mjs"       "$TPC" "$TEXTURE_OUT/records.json"

    run_test "$NAME texture decoding"       node "$TOOLS/decode-tpc-palette-textures.mjs"       "$TPC" "$TEXTURE_OUT/images"
  done
fi

# 5. Inventory available motion resources.
if [[ ${#MCDIRS[@]} -eq 0 ]]; then
  echo "WARNING: No motion directories found."
else
  for DIR in "${MCDIRS[@]}"; do
    NAME="$(basename "$(dirname "$DIR")")"
    run_test "$NAME motion catalog"       node "$TOOLS/inspect-motion-catalog.mjs"       "$DIR" "$OUT/motion/$NAME-motion-catalog.json"
  done
fi

# 6. Hash source DPC and TPC files for reproducibility.
find original-data -type f \
  \( -iname 'scout_*.dpc' -o -iname 'scout_*.tpc' \) \
  -print0 |
while IFS= read -r -d '' FILE; do
  sha256sum "$FILE"
  stat -c '%s bytes %n' "$FILE"
done >"$OUT/source-integrity.txt"

# 7. Write a concise run summary.
cat >"$OUT/test-summary.txt" <<EOF
OUTWARS SCOUT ASSEMBLY TEST BATTERY

Date: $(date)
Repository: $ROOT
DPC files: ${#DPCS[@]}
TPC files: ${#TPCS[@]}
Motion directories: ${#MCDIRS[@]}

Passed tests: $PASSED
Failed tests: $FAILED
Other errors: $ERRORS

Detailed log: logs/battery.log
Geometry exports: geometry/
Transform candidates: transforms/opcode5-candidates.json
Callback descriptors: descriptors/callback-descriptors.json
Texture results: textures/
Motion results: motion/
Source hashes: source-integrity.txt
EOF

echo
cat "$OUT/test-summary.txt"

# 8. Package all outputs, including partial results if some tests failed.
if zip -qr "$ROOT/scout-assembly-battery.zip" "$(basename "$OUT")"; then
  echo
  echo "PACKAGE CREATED: $ROOT/scout-assembly-battery.zip"
else
  echo "ERROR: ZIP packaging failed."
  ERRORS=$((ERRORS + 1))
fi

echo
echo "============================================================"
echo "BATTERY FINISHED"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Errors: $ERRORS"
echo "Results: $OUT"
echo "============================================================"

pause_exit
