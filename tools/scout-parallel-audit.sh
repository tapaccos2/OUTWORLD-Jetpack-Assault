#!/usr/bin/env bash
# One-run parallel Scout investigation. All persistent output is under scout-logs/.
# Usage: bash tools/scout-parallel-audit.sh [/path/to/outwars.exe]
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
LOG_ROOT="$REPO_ROOT/scout-logs"
OUT="$LOG_ROOT/scout-parallel-audit"
ZIP="$LOG_ROOT/scout-parallel-audit.zip"
EXPECTED_EXE="722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2"

EXE=""
if [[ $# -gt 0 ]]; then EXE="$1"; fi
if [[ -z "$EXE" ]]; then
  for candidate in "$HOME/Outwars-extracted/outwars.exe" "$HOME/Documents/Outwars-extracted/outwars.exe" "$HOME/Downloads/outwars.exe" "$REPO_ROOT/outwars.exe"; do
    if [[ -f "$candidate" ]]; then EXE="$candidate"; break; fi
  done
fi
if [[ -z "$EXE" || ! -f "$EXE" ]]; then
  echo "Cannot find outwars.exe. Pass its full path as the first argument." >&2
  exit 2
fi
EXE="$(realpath "$EXE")"

for tool in node python3 zip sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 3; }
done
for file in \
  "$REPO_ROOT/original-data/units.ff" \
  "$REPO_ROOT/original-data/motion.ff" \
  "$SCRIPT_DIR/scout-renderer-backend-probe.sh" \
  "$SCRIPT_DIR/scout-transform-slot-audit.mjs" \
  "$SCRIPT_DIR/scout-finalize.mjs" \
  "$SCRIPT_DIR/compare-scout-variants.mjs" \
  "$SCRIPT_DIR/inspect-scout-transform-records.mjs" \
  "$SCRIPT_DIR/inspect-tpc-records.mjs" \
  "$SCRIPT_DIR/decode-tpc-palette-textures.mjs" \
  "$SCRIPT_DIR/inspect-motion-catalog.mjs" \
  "$SCRIPT_DIR/analyze-motion-channels.mjs" \
  "$SCRIPT_DIR/inspect-motion-format.mjs" \
  "$SCRIPT_DIR/extract-ff-resources.mjs"; do
  [[ -f "$file" ]] || { echo "Required project file missing: $file" >&2; exit 4; }
done

ACTUAL_EXE="$(sha256sum "$EXE" | awk '{print $1}')"
if [[ "$ACTUAL_EXE" != "$EXPECTED_EXE" ]]; then
  echo "Executable build mismatch; refusing to combine reports from different builds." >&2
  echo "Expected: $EXPECTED_EXE" >&2
  echo "Found:    $ACTUAL_EXE" >&2
  exit 5
fi

mkdir -p "$LOG_ROOT"
rm -rf -- "$OUT"
rm -f -- "$ZIP"
mkdir -p "$OUT"/{logs,renderer,transforms,geometry,materials,animation,correlation,work}
LOGS="$OUT/logs"
WORK="$OUT/work"
UNITS_DIR="$WORK/extracted/units"
MOTION_DIR="$WORK/extracted/motion"

echo "OUTWARS SCOUT PARALLEL AUDIT"
echo "Executable SHA256: $ACTUAL_EXE"
echo "All persistent output: $OUT"
echo "One final ZIP will be produced."

OBJDUMP=""
for candidate in i686-w64-mingw32-objdump x86_64-w64-mingw32-objdump objdump; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -f "$EXE" >/dev/null 2>&1; then
    OBJDUMP="$(command -v "$candidate")"
    break
  fi
done
if [[ -z "$OBJDUMP" ]]; then
  echo "No PE-capable objdump found. Install binutils-mingw-w64-i686." >&2
  exit 6
fi
export OBJDUMP

echo "[1/4] Renderer/backend evidence..."
if bash "$SCRIPT_DIR/scout-renderer-backend-probe.sh" "$EXE" > "$LOGS/01-renderer-probe.log" 2>&1; then
  cp -a "$LOG_ROOT/renderer-backend-probe" "$OUT/renderer/backend-probe"
  "$OBJDUMP" -d -Mintel --start-address=0x4b94d1 --stop-address=0x4b9811 "$EXE" > "$OUT/renderer/mode-config-and-option-dispatch.asm.txt" 2>&1
  "$OBJDUMP" -d -Mintel --start-address=0x4ee628 --stop-address=0x4eea85 "$EXE" > "$OUT/renderer/directdraw-direct3d-initialisation.asm.txt" 2>&1
  "$OBJDUMP" -d -Mintel --start-address=0x4eea85 --stop-address=0x4ef680 "$EXE" > "$OUT/renderer/renderer-api-consumers.asm.txt" 2>&1
  "$OBJDUMP" -d -Mintel --start-address=0x4dba5f --stop-address=0x4dbb60 "$EXE" > "$OUT/renderer/direct3d-transform-loop.asm.txt" 2>&1
  "$OBJDUMP" -d -Mintel --start-address=0x414c20 --stop-address=0x415860 "$EXE" > "$OUT/renderer/class-indexed-opcode5-slot-path.asm.txt" 2>&1
  "$OBJDUMP" -d -Mintel --start-address=0x4e4060 --stop-address=0x4e4e20 "$EXE" > "$OUT/renderer/runtime-eight-entry-update-path.asm.txt" 2>&1
  "$OBJDUMP" -d -Mintel --start-address=0x4dfce4 --stop-address=0x4e05f0 "$EXE" > "$OUT/renderer/dpc-callback-interpreter-and-matrix-stack.asm.txt" 2>&1
  echo PASS > "$LOGS/01-renderer-probe.status"
else
  echo FAILED > "$LOGS/01-renderer-probe.status"
fi

cat > "$OUT/renderer/RENDERER-PATH-TRIAGE.md" <<'EOF'
# Renderer path evidence

The executable imports DirectDrawCreate and DirectDrawEnumerateA from DDRAW.dll.
Direct3D methods are not ordinary static imports; the executable also imports
dynamic library/function resolution and uses DirectDraw/COM interface patterns.

The option handler uses global 0xF8D294. Renderer initialisation branches using
global 0x1355BB4. The Direct3D render loop at 0x4DBA5F iterates eight transform
entries and calls a device vtable method at [device+0x68] at 0x4DBAF2; the prior
audit identifies that call as SetTransform on the Direct3D route.

The bundle captures the graphics option handler, DirectDraw/Direct3D setup,
renderer API consumers, Direct3D transform loop, class-indexed opcode-5 slot
path, eight-entry update path and DPC callback/matrix code.

LIMIT: this proves a DirectDraw path and a conditional Direct3D path. It does
not prove the unchecked route uses a CPU triangle rasteriser. The actual
vertex/triangle consumer for that mode remains to be identified.
EOF

echo "[2/4] Transform table audit and source archive extraction..."
(
  node "$SCRIPT_DIR/scout-transform-slot-audit.mjs" --exe "$EXE" > "$LOGS/02-transform-slot-audit.log" 2>&1
  echo "$?" > "$LOGS/02-transform-slot-audit.exit"
) &
PID_SLOT=$!
(
  node "$SCRIPT_DIR/extract-ff-resources.mjs" "$REPO_ROOT/original-data/units.ff" "$REPO_ROOT/original-data/motion.ff" --out "$WORK/extracted" > "$LOGS/03-archive-extraction.log" 2>&1
  echo "$?" > "$LOGS/03-archive-extraction.exit"
) &
PID_EXTRACT=$!
wait "$PID_SLOT"
SLOT_RC="$(cat "$LOGS/02-transform-slot-audit.exit" 2>/dev/null || echo 99)"
wait "$PID_EXTRACT"
EXTRACT_RC="$(cat "$LOGS/03-archive-extraction.exit" 2>/dev/null || echo 99)"
if [[ -d "$LOG_ROOT/scout-transform-slot-audit" ]]; then
  cp -a "$LOG_ROOT/scout-transform-slot-audit" "$OUT/transforms/slot-audit"
fi
echo "$SLOT_RC" > "$LOGS/02-transform-slot-audit.status"
echo "$EXTRACT_RC" > "$LOGS/03-archive-extraction.status"

if [[ "$EXTRACT_RC" == "0" && -d "$UNITS_DIR" && -d "$MOTION_DIR" ]]; then
  echo "[3/4] Geometry, textures and animation running concurrently..."

  (
    RC=0
    node "$SCRIPT_DIR/scout-finalize.mjs" "$REPO_ROOT/original-data/units.ff" "$OUT/geometry/scout-final" --exe "$EXE" > "$LOGS/04-scout-finalizer.log" 2>&1 || RC=1
    node "$SCRIPT_DIR/compare-scout-variants.mjs" "$UNITS_DIR" "$OUT/geometry/SCOUT-VARIANT-COMPARISON.json" > "$LOGS/05-scout-variant-comparison.log" 2>&1 || RC=1
    find "$UNITS_DIR" -maxdepth 1 -type f -iname 'scout*.dpc' -print0 | xargs -0 node "$SCRIPT_DIR/inspect-scout-transform-records.mjs" > "$OUT/geometry/ALL-SCOUT-OPCODE5-TRANSFORM-RECORDS.json" 2> "$LOGS/06-all-variant-opcode5-scan.log" || RC=1
    echo "$RC" > "$LOGS/04-06-geometry-branch.status"
  ) &
  PID_GEOMETRY=$!

  (
    RC=0
    COUNT=0
    while IFS= read -r -d '' TPC; do
      STEM="$(basename "$TPC" .tpc)"
      node "$SCRIPT_DIR/inspect-tpc-records.mjs" "$TPC" "$OUT/materials/$STEM-records.json" >> "$LOGS/07-tpc-inspection.log" 2>&1 || RC=1
      node "$SCRIPT_DIR/decode-tpc-palette-textures.mjs" "$TPC" "$OUT/materials/$STEM" >> "$LOGS/08-tpc-decoding.log" 2>&1 || RC=1
      COUNT=$((COUNT + 1))
    done < <(find "$UNITS_DIR" -maxdepth 1 -type f -iname 'scout*.tpc' -print0)
    echo "$COUNT" > "$OUT/materials/SCOUT-TPC-FILE-COUNT.txt"
    if [[ "$COUNT" -eq 0 ]]; then
      echo "No scout-named TPC files were found in units.ff." > "$OUT/materials/NO-SCOUT-TPC-FILES.txt"
      RC=1
    fi
    echo "$RC" > "$LOGS/07-08-materials-branch.status"
  ) &
  PID_MATERIALS=$!

  (
    RC=0
    MC_COUNT="$(find "$MOTION_DIR" -maxdepth 1 -type f -iname '*.mc' | wc -l)"
    if [[ "$MC_COUNT" -gt 0 ]]; then
      node "$SCRIPT_DIR/inspect-motion-catalog.mjs" "$MOTION_DIR" "$OUT/animation/MOTION-CATALOG.json" > "$LOGS/09-motion-catalogue.log" 2>&1 || RC=1
      node "$SCRIPT_DIR/analyze-motion-channels.mjs" "$MOTION_DIR" "$OUT/animation/MOTION-CHANNEL-PROFILE.json" > "$LOGS/10-motion-channel-profile.log" 2>&1 || RC=1
      find "$MOTION_DIR" -maxdepth 1 -type f -iname '*.mc' -print0 | xargs -0 node "$SCRIPT_DIR/inspect-motion-format.mjs" > "$OUT/animation/MOTION-FORMAT.json" 2> "$LOGS/11-motion-frame-format.log" || RC=1
    else
      echo "No MC files were found in motion.ff." > "$OUT/animation/NO-MC-FILES.txt"
      RC=1
    fi
    echo "$MC_COUNT" > "$OUT/animation/MOTION-FILE-COUNT.txt"
    echo "$RC" > "$LOGS/09-11-animation-branch.status"
  ) &
  PID_ANIMATION=$!

  wait "$PID_GEOMETRY"
  wait "$PID_MATERIALS"
  wait "$PID_ANIMATION"

  # Compare DPC class-100 slot IDs to MC channels only after both reports exist.
  python3 - "$UNITS_DIR" "$OUT/transforms/SCOUT-DPC-TRANSFORM-SLOT-CATALOG.json" "$OUT/animation/MOTION-CATALOG.json" "$OUT/animation/MOTION-CHANNEL-PROFILE.json" "$OUT/correlation/SLOT-MOTION-CORRELATION.json" "$OUT/materials/DPC-TEXTURE-STRING-REFERENCES.json" <<'PY'
import sys, json, hashlib
from pathlib import Path
units, slot_out, catalog_path, profile_path, corr_out, refs_out = map(Path, sys.argv[1:])
def sha(data): return hashlib.sha256(data).hexdigest()
variants = []
for file in sorted(units.glob('scout*.dpc')):
    data = file.read_bytes()
    if len(data) < 40 or data[:4] != b'DCPM' or data[4] != 0x43: continue
    base = int.from_bytes(data[12:16], 'little')
    def u16(o): return int.from_bytes(data[o:o+2], 'little')
    def i32(o): return int.from_bytes(data[o:o+4], 'little', signed=True)
    def ptr(o):
        if o < 0 or o+4 > len(data): return None
        value = int.from_bytes(data[o:o+4], 'little'); target = value-base
        return target if value >= base and 0 <= target < len(data)-3 else None
    records, slots = [], {}
    for offset in range(0, len(data)-0x3c+1):
        if data[offset] != 5: continue
        count = data[offset+0x36]
        if count < 1 or count > 32: continue
        children, valid = [], True
        for index in range(count):
            target = ptr(offset+0x38+index*4)
            if target is None: valid=False; break
            children.append({'offset':hex(target),'opcode':data[target],'classWord':u16(target+2)})
        if not valid or u16(offset+2) != 100: continue
        slot = u16(offset+0x34)
        row = {'offset':hex(offset),'slotWordPlus34':slot,'children':children,
               'position':[i32(offset+0x28),i32(offset+0x2c),i32(offset+0x30)],
               'matrix':[i32(offset+4+i*4) for i in range(9)]}
        records.append(row); slots.setdefault(slot,[]).append(row['offset'])
    variants.append({'file':file.name,'sha256':sha(data),'bytes':len(data),
                     'class100RecordCount':len(records),
                     'slotValues':[{'slot':k,'count':len(v),'records':v} for k,v in sorted(slots.items())],
                     'invalidOrDuplicateSlots':[{'slot':k,'count':len(v)} for k,v in sorted(slots.items()) if k<1 or k>18 or len(v)>1],
                     'records':records})
all_ids = sorted({r['slotWordPlus34'] for v in variants for r in v['records']})
slot_catalog = {'variantCount':len(variants),'distinctClass100SlotValues':all_ids,'variants':variants,
                'interpretation':'Registration keys only; this scan does not assign a mesh or bone identity.'}
slot_out.write_text(json.dumps(slot_catalog,indent=2)+'\n')
catalog = json.loads(catalog_path.read_text())
profile = json.loads(profile_path.read_text())
stats = catalog.get('slotStatistics',[]); activity = profile.get('slotSummary',[])
rows = []
for i in range(19):
    rows.append({'motionSlotZeroBased':i,'DPCSlotEqualToIndex':i in all_ids,
                 'DPCSlotOneBasedToIndex':i+1 in all_ids,
                 'fieldRanges':stats[i].get('fieldRanges') if i<len(stats) else None,
                 'activity':activity[i].get('totalFrameTransitions') if i<len(activity) else None,
                 'components':activity[i].get('components') if i<len(activity) else None})
corr = {'DPCSlotValues':all_ids,'MCEntriesPerFrame':catalog.get('summary',{}).get('entryCount'),
        'MCDecodedFrames':catalog.get('summary',{}).get('decodedFrames'),
        'mappingAlternatives':['DPC slot ID equals zero-based MC index','DPC slot ID minus one equals zero-based MC index'],
        'rows':rows,'conclusion':'Numeric alignment only; this does not prove bone names or mesh ownership.'}
corr_out.write_text(json.dumps(corr,indent=2)+'\n')
references = []
for file in sorted(units.glob('scout*.dpc')):
    data=file.read_bytes(); found=[]; start=None
    for i in range(len(data)+1):
        value=data[i] if i<len(data) else 0
        if 32<=value<=126:
            if start is None: start=i
        elif start is not None:
            if i-start>=5:
                candidate=data[start:i].decode('ascii','replace')
                if '.tpc' in candidate.lower() or 'texture' in candidate.lower() or 'material' in candidate.lower():
                    found.append({'offset':hex(start),'value':candidate})
            start=None
    references.append({'file':file.name,'references':found})
refs_out.write_text(json.dumps(references,indent=2)+'\n')
print(json.dumps({'variants':len(variants),'class100SlotValues':all_ids},indent=2))
PY
  echo "$?" > "$LOGS/12-correlation.exit"
else
  echo "Archive extraction failed; dependent workstreams were not started." > "$OUT/EXTRACTION-FAILED.txt"
fi

if [[ -d "$LOG_ROOT/scout-transform-slot-audit" ]]; then
  cp -a "$LOG_ROOT/scout-transform-slot-audit" "$OUT/transforms/slot-audit-final"
fi
rm -rf -- "$LOG_ROOT/renderer-backend-probe" "$LOG_ROOT/scout-transform-slot-audit" "$WORK"
rm -f -- "$LOG_ROOT/renderer-backend-probe.zip" "$LOG_ROOT/scout-transform-slot-audit.zip" "$OUT/geometry/scout-final.zip"

{
  echo "Executable SHA256: $ACTUAL_EXE"
  echo "units.ff SHA256: $(sha256sum "$REPO_ROOT/original-data/units.ff" | awk '{print $1}')"
  echo "motion.ff SHA256: $(sha256sum "$REPO_ROOT/original-data/motion.ff" | awk '{print $1}')"
  echo "Generated: $(date -Is)"
  echo
  echo "TASK STATUSES"
  for f in "$LOGS"/*.status "$LOGS"/*.exit; do
    [[ -f "$f" ]] || continue
    printf '%s: ' "$(basename "$f")"; cat "$f"
  done
  echo
  echo "BUNDLE CONTENTS"
  find "$OUT" -type f ! -name FILE-INVENTORY.txt -printf '%P %s bytes\n' | sort
} > "$OUT/FILE-INVENTORY.txt"

cat > "$OUT/SCOUT-PARALLEL-AUDIT-REPORT.md" <<'EOF'
# Outwars Scout parallel audit

This is one combined evidence bundle. Four investigations run concurrently
after shared archive extraction:

1. Geometry and transforms: static finalizer, cross-variant comparison,
   opcode-5 record scans and class-100 slot table audit.
2. Renderer: graphics imports, mode switch, DirectDraw/Direct3D initialisation,
   COM-style renderer consumers, D3D transform loop and DPC callback matrix path.
3. Textures/materials: all scout-named TPC records, RGB555 palettes and decoded
   indexed PNGs, plus printable TPC/material references in Scout DPC files.
4. Animation: all MC frame containers, 152-byte frame checks, 19 channel
   activity/range profiles and DPC-slot versus MC-index comparisons.

## Verified baseline
The static candidate has nine sections (root plus eight submeshes), 390
referenced vertices and 230 triangles. Structural validation does not prove
correct assembly or final placement.

## Limits retained
- DirectDraw setup does not alone prove a CPU triangle rasteriser.
- Class-100 slot IDs are registration keys, not proven bone or mesh names.
- Numeric DPC-slot/MC-channel alignment is correlation, not ownership proof.
- TPC decoding does not establish UV or texture-to-mesh assignments.
- No candidate GLB is promoted to final without verified transform ownership,
  composed matrices and visual validation.

All reports, decoded preview images and stdout/stderr logs are under this folder.
Upload only scout-logs/scout-parallel-audit.zip.
EOF

find "$OUT" -type f -name '*.zip' -delete
(cd "$LOG_ROOT" && zip -qr "$ZIP" "$(basename "$OUT")")
if [[ ! -s "$ZIP" ]]; then echo "Combined evidence ZIP was not created." >&2; exit 7; fi
echo
echo "SCOUT PARALLEL AUDIT COMPLETE"
echo "Single bundle: $ZIP"
echo "Report: $OUT/SCOUT-PARALLEL-AUDIT-REPORT.md"
echo "Logs and reports: $OUT/"
