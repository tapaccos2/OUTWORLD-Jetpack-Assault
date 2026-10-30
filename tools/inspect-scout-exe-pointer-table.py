#!/usr/bin/env python3
"""Decode a PE pointer table into readable strings."""
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
        raise SystemExit(f"Unsupported PE magic {magic:#x}")
    sections = []
    for i in range(nsec):
        p = opt + optsz + i * 40
        name = data[p:p + 8].split(b"\0", 1)[0].decode("ascii", "replace")
        vsize, rva, raw_size, raw_ptr = struct.unpack_from("<IIII", data, p + 8)
        sections.append((name, rva, vsize, raw_ptr, raw_size))
    return image_base, sections

def va_to_offset(va: int, image_base: int, sections):
    rva = va - image_base
    for name, sec_rva, vsize, raw_ptr, raw_size in sections:
        span = max(vsize, raw_size)
        if sec_rva <= rva < sec_rva + span:
            delta = rva - sec_rva
            if delta >= raw_size:
                return None
            return raw_ptr + delta
    return None

def read_c_string(data: bytes, off: int, limit: int = 256):
    if off is None or off < 0 or off >= len(data):
        return None
    end = data.find(b"\0", off, min(len(data), off + limit))
    if end < 0:
        end = min(len(data), off + limit)
    raw = data[off:end]
    try:
        return raw.decode("ascii")
    except UnicodeDecodeError:
        return raw.decode("latin-1", "replace")

parser = argparse.ArgumentParser()
parser.add_argument("exe")
parser.add_argument("--start", default="0x529d60")
parser.add_argument("--count", type=int, default=40)
parser.add_argument("--label", default="DPC name pointer table")
args = parser.parse_args()

data = pathlib.Path(args.exe).read_bytes()
image_base, sections = parse_pe(data)
start = int(args.start, 0)
print(f"{args.label}: VA 0x{start:X}, {args.count} DWORD entries")
print("slot_va       ptr_value    string")
for i in range(args.count):
    slot_va = start + i * 4
    slot_off = va_to_offset(slot_va, image_base, sections)
    if slot_off is None or slot_off + 4 > len(data):
        print(f"0x{slot_va:08X}  <unmapped>")
        continue
    ptr = struct.unpack_from("<I", data, slot_off)[0]
    str_off = va_to_offset(ptr, image_base, sections)
    value = read_c_string(data, str_off)
    if value is None:
        value = "<not a mapped string>"
    print(f"0x{slot_va:08X}  0x{ptr:08X}  {value}")
