#!/usr/bin/env python3
"""Map Scout resource strings to PE VAs and find executable/data references."""
from __future__ import annotations
import pathlib
import re
import struct
import sys

if len(sys.argv) != 4:
    raise SystemExit("usage: scan-scout-exe-strings.py EXE DISASSEMBLY OUTPUT")

exe_path, dis_path, out_path = map(pathlib.Path, sys.argv[1:])
data = exe_path.read_bytes()
dis_lines = dis_path.read_text(encoding="utf-8", errors="replace").splitlines()

pe = struct.unpack_from("<I", data, 0x3C)[0]
if data[pe:pe + 4] != b"PE\0\0":
    raise SystemExit("Not a PE executable")
nsec = struct.unpack_from("<H", data, pe + 6)[0]
optsz = struct.unpack_from("<H", data, pe + 20)[0]
opt = pe + 24
magic = struct.unpack_from("<H", data, opt)[0]
if magic == 0x10B:
    image_base = struct.unpack_from("<I", data, opt + 28)[0]
elif magic == 0x20B:
    image_base = struct.unpack_from("<Q", data, opt + 24)[0]
else:
    raise SystemExit(f"Unsupported PE optional-header magic: {magic:#x}")

sections = []
sec_off = opt + optsz
for i in range(nsec):
    p = sec_off + i * 40
    name = data[p:p + 8].split(b"\0", 1)[0].decode("ascii", "replace")
    vsize, rva, raw_size, raw_ptr = struct.unpack_from("<IIII", data, p + 8)
    sections.append((name, rva, vsize, raw_ptr, raw_size))

targets = [
    b"scout.dpc", b"defenderWmortar.dpc", b"walkingBabyAssassin.dpc",
    b"laborer.dpc", b"flyingAssassin.dpc", b"scout_ma", b"scout_fa",
    b"scout_mj", b"scout_fj", b"scout_md", b"scout_fd",
    b"%s.dpc", b"ANIMATION", b"ORUNANIMATION"
]
lines = [
    f"Executable: {exe_path}",
    f"Image base: 0x{image_base:X}",
    f"PE sections: {nsec}",
    "For each resource string: mapped VA, disassembly immediate references, raw VA-pointer occurrences.",
    ""
]

for target in targets:
    start = 0
    occurrences = []
    while True:
        off = data.find(target, start)
        if off < 0:
            break
        occurrences.append(off)
        start = off + 1

    for off in occurrences:
        sec = next((x for x in sections if x[3] <= off < x[3] + x[4]), None)
        label = target.decode("ascii", "replace")
        if sec is None:
            lines.append(f"{label} file+0x{off:X}: no section mapping")
            continue

        name, rva, _vsize, raw_ptr, _raw_size = sec
        va = image_base + rva + off - raw_ptr
        va_hex = f"{va:x}"
        rx = re.compile(r"(?i)(?<![0-9a-f])0x0*" + re.escape(va_hex) + r"(?![0-9a-f])")
        code_hits = [(i, line) for i, line in enumerate(dis_lines) if rx.search(line)]

        pointer = struct.pack("<I", va & 0xFFFFFFFF)
        ptr_offsets = []
        pos = 0
        while True:
            pos = data.find(pointer, pos)
            if pos < 0:
                break
            ptr_offsets.append(pos)
            pos += 1

        lines.append(f"{label} file+0x{off:X} -> section {name}, VA 0x{va:X}")
        lines.append(f"  disassembly references: {len(code_hits)}")
        for _i, line in code_hits[:30]:
            lines.append(f"    {line.rstrip()}")
        lines.append(f"  raw pointer occurrences: {len(ptr_offsets)}")
        for p in ptr_offsets[:50]:
            owner_sec = next((x for x in sections if x[3] <= p < x[3] + x[4]), None)
            owner = owner_sec[0] if owner_sec else "headers/unknown"
            if owner_sec:
                owner_name, owner_rva, _owner_vsize, owner_raw, _owner_size = owner_sec
                slot_va = image_base + owner_rva + p - owner_raw
                lines.append(f"    file+0x{p:X} ({owner}) -> pointer-slot VA 0x{slot_va:X}")
                if owner_name == "DGROUP":
                    slot_hex = f"{slot_va:x}"
                    slot_rx = re.compile(r"(?i)(?<![0-9a-f])0x0*" + re.escape(slot_hex) + r"(?![0-9a-f])")
                    slot_refs = [line for line in dis_lines if slot_rx.search(line)]
                    lines.append(f"      code references to pointer slot: {len(slot_refs)}")
                    for line in slot_refs[:20]:
                        lines.append(f"        {line.rstrip()}")
                left, right = max(0, p - 16), min(len(data), p + 20)
                lines.append(f"      surrounding bytes [{left:#x}:{right:#x}]: {data[left:right].hex(' ')}")
            else:
                lines.append(f"    file+0x{p:X} ({owner})")
        lines.append("")

out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
