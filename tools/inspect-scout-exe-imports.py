#!/usr/bin/env python3
"""Resolve selected PE32/PE32+ import-address-table slots to imported API names."""
from __future__ import annotations
import argparse
import pathlib
import struct

def read_c_string(data: bytes, off: int, limit: int = 512) -> str:
    end = data.find(b"\0", off, min(len(data), off + limit))
    if end < 0:
        end = min(len(data), off + limit)
    return data[off:end].decode("ascii", "replace")

def parse_pe(data: bytes):
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe:pe + 4] != b"PE\0\0":
        raise SystemExit("Not a PE executable")
    nsec = struct.unpack_from("<H", data, pe + 6)[0]
    opt_size = struct.unpack_from("<H", data, pe + 20)[0]
    opt = pe + 24
    magic = struct.unpack_from("<H", data, opt)[0]
    if magic == 0x10B:
        image_base = struct.unpack_from("<I", data, opt + 28)[0]
        dd = opt + 96
        width, ordinal_mask = 4, 0x80000000
    elif magic == 0x20B:
        image_base = struct.unpack_from("<Q", data, opt + 24)[0]
        dd = opt + 112
        width, ordinal_mask = 8, 0x8000000000000000
    else:
        raise SystemExit(f"Unsupported PE optional-header magic {magic:#x}")
    import_rva, import_size = struct.unpack_from("<II", data, dd + 8)

    sections = []
    sec_off = opt + opt_size
    for i in range(nsec):
        p = sec_off + i * 40
        name = data[p:p + 8].split(b"\0", 1)[0].decode("ascii", "replace")
        vsize, rva, raw_size, raw_ptr = struct.unpack_from("<IIII", data, p + 8)
        sections.append((name, rva, max(vsize, raw_size), raw_ptr, raw_size))

    def rva_to_offset(rva: int):
        for _name, sec_rva, span, raw_ptr, raw_size in sections:
            if sec_rva <= rva < sec_rva + span:
                delta = rva - sec_rva
                if delta < raw_size:
                    return raw_ptr + delta
        return None

    if not import_rva:
        raise SystemExit("PE has no import directory")
    imp_off = rva_to_offset(import_rva)
    if imp_off is None:
        raise SystemExit("Import directory RVA is not file-backed")

    imports = []
    desc = imp_off
    while desc + 20 <= len(data):
        oft, _timestamp, _chain, name_rva, first_thunk = struct.unpack_from("<IIIII", data, desc)
        if not any((oft, name_rva, first_thunk)):
            break
        name_off = rva_to_offset(name_rva)
        dll = read_c_string(data, name_off) if name_off is not None else "<bad dll name>"
        thunk_rva = oft or first_thunk
        thunk_off = rva_to_offset(thunk_rva)
        index = 0
        while thunk_off is not None:
            pos = thunk_off + index * width
            if pos + width > len(data):
                break
            value = int.from_bytes(data[pos:pos + width], "little")
            if value == 0:
                break
            iat_va = image_base + first_thunk + index * width
            if value & ordinal_mask:
                symbol = f"ordinal_{value & 0xffff}"
            else:
                ibn_off = rva_to_offset(value)
                symbol = read_c_string(data, ibn_off + 2) if ibn_off is not None else "<bad import name>"
            imports.append((iat_va, dll, symbol))
            index += 1
        desc += 20
    return image_base, imports

parser = argparse.ArgumentParser()
parser.add_argument("exe")
parser.add_argument("--addresses", default="0x1410630,0x14106b0,0x14106b8",
                    help="comma-separated IAT virtual addresses")
args = parser.parse_args()
requested = {int(x.strip(), 0) for x in args.addresses.split(",") if x.strip()}
data = pathlib.Path(args.exe).read_bytes()
image_base, imports = parse_pe(data)
print(f"Image base: 0x{image_base:X}")
print("Requested IAT slots:")
for address in sorted(requested):
    hits = [x for x in imports if x[0] == address]
    if not hits:
        print(f"  0x{address:08X}: <no import resolved at this slot>")
    for va, dll, symbol in hits:
        print(f"  0x{va:08X}: {dll}!{symbol}")
print("\nFile/resource-related imports:")
keywords = ("CreateFile", "ReadFile", "CloseHandle", "GetFileSize", "SetFilePointer",
            "MapViewOfFile", "UnmapViewOfFile", "CreateFileMapping", "GetFileType",
            "GetLastError", "GetFileAttributes", "FindFirstFile", "FindNextFile")
for va, dll, symbol in imports:
    if any(k.lower() in symbol.lower() for k in keywords):
        print(f"  0x{va:08X}: {dll}!{symbol}")
