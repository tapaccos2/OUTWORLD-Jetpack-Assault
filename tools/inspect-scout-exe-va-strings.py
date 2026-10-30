#!/usr/bin/env python3
"""Print null-terminated strings at selected virtual addresses in a PE image."""
from __future__ import annotations
import argparse
import pathlib
import struct

def parse_pe(data: bytes):
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
        raise SystemExit(f"Unsupported PE magic: {magic:#x}")
    sections = []
    sec_off = opt + optsz
    for i in range(nsec):
        p = sec_off + i * 40
        name = data[p:p + 8].split(b"\0", 1)[0].decode("ascii", "replace")
        _vsize, rva, raw_size, raw_ptr = struct.unpack_from("<IIII", data, p + 8)
        sections.append((name, rva, raw_ptr, raw_size))
    return image_base, sections

def va_to_offset(va: int, image_base: int, sections):
    rva = va - image_base
    for name, sec_rva, raw_ptr, raw_size in sections:
        if sec_rva <= rva < sec_rva + raw_size:
            return name, raw_ptr + rva - sec_rva
    return None, None

parser = argparse.ArgumentParser()
parser.add_argument("exe")
parser.add_argument("--addresses", required=True,
                    help="comma-separated virtual addresses, e.g. 0x52334d,0x52342a")
parser.add_argument("--limit", type=int, default=160)
args = parser.parse_args()

data = pathlib.Path(args.exe).read_bytes()
image_base, sections = parse_pe(data)
for item in args.addresses.split(","):
    va = int(item.strip(), 0)
    section, offset = va_to_offset(va, image_base, sections)
    if offset is None:
        print(f"VA 0x{va:08X}: <unmapped>")
        continue
    end = data.find(b"\0", offset, min(len(data), offset + args.limit))
    if end < 0:
        end = min(len(data), offset + args.limit)
    raw = data[offset:end]
    value = raw.decode("ascii", "backslashreplace")
    print(f"VA 0x{va:08X} ({section}, file+0x{offset:X}): {value!r}")
