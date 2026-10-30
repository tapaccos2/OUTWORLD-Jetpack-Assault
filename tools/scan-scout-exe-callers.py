#!/usr/bin/env python3
"""Find direct branches to executable routines and show nearby instructions."""
from __future__ import annotations
import argparse
import pathlib
import re

parser = argparse.ArgumentParser()
parser.add_argument("disassembly")
parser.add_argument("--targets", default="0x486720,0x48ce71,0x48ce89,0x48cea1,0x48ced4,0x48cfb0,0x4ee38a,0x500ae9")
parser.add_argument("--context", type=int, default=12)
args = parser.parse_args()

lines = pathlib.Path(args.disassembly).read_text(encoding="utf-8", errors="replace").splitlines()
targets = [t.strip().lower() for t in args.targets.split(",") if t.strip()]
seen = set()
for target in targets:
    pattern = re.compile(r"(?i)\b(?:call|jmp|j[a-z]{1,2})\s+(?:DWORD PTR\s+)?"+re.escape(target)+r"\b")
    matches = [i for i, line in enumerate(lines) if pattern.search(line)]
    print(f"\n===== Direct references to {target}: {len(matches)} =====")
    for i in matches:
        start = max(0, i - args.context)
        end = min(len(lines), i + args.context + 1)
        key = (target, start, end)
        if key in seen:
            continue
        seen.add(key)
        for j in range(start, end):
            prefix = ">>" if j == i else "  "
            print(f"{prefix} {lines[j]}")
