#!/usr/bin/env bash
# Read-only Outwars renderer/backend probe. All output stays inside the repo.
# Usage: bash tools/scout-renderer-backend-probe.sh [path/to/outwars.exe]
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
LOG_ROOT="$REPO_ROOT/scout-logs"
OUT="$LOG_ROOT/renderer-backend-probe"
ZIP="$LOG_ROOT/renderer-backend-probe.zip"
EXE=""
if [[ $# -gt 0 ]]; then EXE="$1"; fi

if [[ -z "$EXE" ]]; then
  for candidate in \
    "$REPO_ROOT/outwars.exe" \
    "$REPO_ROOT/../Outwars-extracted/outwars.exe" \
    "$HOME/Outwars-extracted/outwars.exe" \
    "$HOME/Documents/Outwars-extracted/outwars.exe" \
    "$HOME/Downloads/outwars.exe"; do
    if [[ -f "$candidate" ]]; then EXE="$candidate"; break; fi
  done
fi
if [[ -z "$EXE" || ! -f "$EXE" ]]; then
  echo "Could not find outwars.exe. Pass its full path as the first argument." >&2
  echo "Repository: $REPO_ROOT" >&2
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
  echo "No PE-capable objdump found. Install: sudo apt-get install -y binutils-mingw-w64-i686" >&2
  exit 3
fi
for tool in python3 strings zip sha256sum file; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 4; }
done
EXE="$(realpath "$EXE")"
mkdir -p "$LOG_ROOT"
# Keep one canonical output set. Remove only this probe's previous generated files.
rm -rf -- "$OUT"
rm -f -- "$ZIP"
mkdir -p "$OUT"

{
  echo "OUTWARS RENDERER BACKEND PROBE"
  echo "Date: $(date -Is)"
  echo "Executable: $EXE"
  echo "SHA256: $(sha256sum "$EXE" | awk '{print $1}')"
  echo "Objdump: $OBJDUMP"
  echo
  file "$EXE"
  echo
  echo "===== PE FORMAT / SECTIONS / IMPORTS ====="
  "$OBJDUMP" -f "$EXE"
  "$OBJDUMP" -h "$EXE"
  "$OBJDUMP" -p "$EXE"
} > "$OUT/00-identity-and-imports.txt" 2>&1

"$OBJDUMP" -d -Mintel "$EXE" > "$OUT/01-full-disassembly.txt" 2>&1
strings -a -n 3 -t x "$EXE" > "$OUT/02-strings.txt"
grep -i -E 'direct3d|directdraw|ddraw|d3dim|d3drm|hardware|accelerat|display|graphics|render|raster|device|driver|surface|vertex|polygon|texture|fog' \
  "$OUT/02-strings.txt" > "$OUT/03-graphics-strings.txt" || true

{
  for spec in \
    "D3D_RENDER_LOOP 0x4db900 0x4dbc80" \
    "D3D_TRANSFORM_LOOKUP_HELPERS 0x4f5a80 0x4f6300" \
    "FIXED_POINT_MATRIX_HELPERS 0x4c5500 0x4c6710" \
    "SCOUT_SLOT_STATE_CONSUMER 0x514c80 0x514fc9"; do
    read -r label start stop <<< "$spec"
    echo "===== $label ($start-$stop) ====="
    "$OBJDUMP" -d -Mintel --start-address="$start" --stop-address="$stop" "$EXE" 2>&1
    echo
  done
} > "$OUT/04-known-renderer-ranges.txt"

python3 - "$EXE" "$OUT/01-full-disassembly.txt" "$OUT/05-import-callsite-map.txt" <<'PY'
import pathlib, struct, re, sys
exe, disasm, dest = map(pathlib.Path, sys.argv[1:])
data = exe.read_bytes()
def cstr(off, limit=512):
    if off is None or off < 0 or off >= len(data): return '<unmapped>'
    end = data.find(b'\0', off, min(len(data), off + limit))
    if end < 0: end = min(len(data), off + limit)
    return data[off:end].decode('ascii', 'replace')
pe = struct.unpack_from('<I', data, 0x3c)[0]
if data[pe:pe+4] != b'PE\0\0': raise SystemExit('Not a PE executable')
nsec = struct.unpack_from('<H', data, pe+6)[0]
optsz = struct.unpack_from('<H', data, pe+20)[0]
opt = pe+24
magic = struct.unpack_from('<H', data, opt)[0]
if magic == 0x10b:
    image_base = struct.unpack_from('<I', data, opt+28)[0]; dd=opt+96; width=4; ordinal_mask=0x80000000
elif magic == 0x20b:
    image_base = struct.unpack_from('<Q', data, opt+24)[0]; dd=opt+112; width=8; ordinal_mask=0x8000000000000000
else: raise SystemExit(f'Unsupported optional header {magic:#x}')
sections=[]
for i in range(nsec):
    p=opt+optsz+i*40
    name=data[p:p+8].split(b'\0',1)[0].decode('ascii','replace')
    vsize,rva,raw_size,raw_ptr=struct.unpack_from('<IIII',data,p+8)
    sections.append((name,rva,max(vsize,raw_size),raw_ptr,raw_size))
def rva_off(rva):
    for _name,srva,span,rptr,rsize in sections:
        if srva <= rva < srva+span:
            delta=rva-srva
            if delta < rsize: return rptr+delta
    return None
imp_rva, _imp_size = struct.unpack_from('<II',data,dd+8)
imp_off=rva_off(imp_rva); imports=[]
if imp_off is not None:
    pos=imp_off
    while pos+20 <= len(data):
        oft,_ts,_chain,name_rva,first=struct.unpack_from('<IIIII',data,pos)
        if not any((oft,name_rva,first)): break
        dll=cstr(rva_off(name_rva)); thunk=rva_off(oft or first); idx=0
        while thunk is not None:
            q=thunk+idx*width
            if q+width > len(data): break
            value=int.from_bytes(data[q:q+width],'little')
            if value == 0: break
            if value & ordinal_mask: sym=f'ordinal_{value & 0xffff}'
            else:
                ibn=rva_off(value); sym=cstr(ibn+2 if ibn is not None else None)
            imports.append((image_base+first+idx*width,dll,sym)); idx+=1
        pos+=20
lines=pathlib.Path(disasm).read_text(errors='replace').splitlines()
out=[f'Executable: {exe}',f'Image base: 0x{image_base:X}','','ALL IMPORTS (graphics-related entries marked [GRAPHICS])']
graphics=re.compile(r'ddraw|d3d|glide|opengl|gdi|user32',re.I)
for va,dll,sym in imports:
    out.append(f"{'[GRAPHICS] ' if graphics.search(dll+' '+sym) else ''}0x{va:08X}  {dll}!{sym}")
out += ['', 'REFERENCES TO GRAPHICS-RELATED IAT SLOTS']
for va,dll,sym in imports:
    if not graphics.search(dll+' '+sym): continue
    pat=re.compile(r'(?i)0x0*'+format(va,'x')+r'\b')
    hits=[(i,line) for i,line in enumerate(lines) if pat.search(line)]
    out.append(f'\n-- {dll}!{sym} IAT=0x{va:X}, {len(hits)} disassembly reference(s) --')
    for i,_line in hits[:80]: out.extend(lines[max(0,i-3):min(len(lines),i+4)])
pathlib.Path(dest).write_text('\n'.join(out)+'\n')
PY

{
  echo "OUTWARS RENDERER BACKEND SUMMARY"
  echo "Executable: $EXE"
  echo "SHA256: $(sha256sum "$EXE" | awk '{print $1}')"
  echo
  echo "===== GRAPHICS IMPORTS / CALLSITES ====="
  grep -i -E '\[GRAPHICS\]|REFERENCES TO GRAPHICS|ddraw|d3d|glide|opengl|DirectDraw|Direct3D' "$OUT/05-import-callsite-map.txt" | head -n 600 || true
  echo
  echo "===== GRAPHICS-RELATED STRINGS ====="
  cat "$OUT/03-graphics-strings.txt"
  echo
  echo "===== KNOWN RENDERER ADDRESS WINDOWS ====="
  cat "$OUT/04-known-renderer-ranges.txt"
} > "$OUT/README-REPORT.txt"

(cd "$LOG_ROOT" && zip -qr "$ZIP" "$(basename "$OUT")")
echo "Repository: $REPO_ROOT"
echo "Logs: $OUT/"
echo "Archive: $ZIP"
echo "Executable SHA256: $(sha256sum "$EXE" | awk '{print $1}')"
