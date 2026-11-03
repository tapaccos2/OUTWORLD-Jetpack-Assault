#!/usr/bin/env python3
"""Supplemental static analysis for the consolidated Outwars Scout audit."""
import argparse, collections, hashlib, json, pathlib, re

EXPECTED = "722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2"

def digest(p):
    h=hashlib.sha256()
    with open(p,"rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""): h.update(b)
    return h.hexdigest()

def disasm_rows(p):
    rx=re.compile(r"^\s*([0-9a-fA-F]+):\s+(?:(?:[0-9a-fA-F]{2})\s+)+(.+?)\s*$")
    out=[]
    for line in p.read_text(errors="replace").splitlines():
        m=rx.match(line)
        if m: out.append((int(m.group(1),16),m.group(2),line))
    return out

def scan_dpc(p):
    b=p.read_bytes()
    if len(b)<36 or b[:4]!=b"DCPM" or b[4]!=0x43: return None
    base=int.from_bytes(b[12:16],"little")
    def u16(o): return int.from_bytes(b[o:o+2],"little") if o+2<=len(b) else None
    def u32(o): return int.from_bytes(b[o:o+4],"little") if o+4<=len(b) else None
    raw=0; records=[]
    for o in range(len(b)-0x3b):
        if b[o]!=5: continue
        raw+=1
        n=b[o+0x36]
        if n<1 or n>32 or o+0x38+n*4>len(b): continue
        children=[]; ok=True
        for j in range(n):
            v=u32(o+0x38+j*4)
            t=v-base if v is not None else -1
            if v is None or v<base or t<0 or t+4>len(b): ok=False; break
            children.append({"offset":hex(t),"opcode":b[t],"classWord":u16(t+2)})
        if ok:
            records.append({"offset":hex(o),"classWord":u16(o+2),"slotWordPlus34":u16(o+0x34),
                "positionPlus28":[int.from_bytes(b[o+x:o+x+4],"little",signed=True) for x in (0x28,0x2c,0x30)],
                "children":children})
    classes=collections.defaultdict(list)
    for r in records: classes[r["classWord"]].append(r)
    class_report={}
    for cls,rr in sorted(classes.items()):
        slots=[x["slotWordPlus34"] for x in rr]
        valid=[x for x in slots if x is not None and 1<=x<=18]
        class_report[str(cls)]={"recordCount":len(rr),"slotValues":slots,
            "missingSlots1To18":[x for x in range(1,19) if x not in valid],
            "duplicates":sorted(x for x,n in collections.Counter(valid).items() if n>1),
            "outOfRange":[x for x in slots if x is None or x<1 or x>18]}
    return {"file":p.name,"sha256":digest(p),"rawOpcode5Occurrences":raw,
            "structurallyPlausibleOpcode5Records":len(records),"classes":class_report,"records":records}

def main():
    a=argparse.ArgumentParser()
    a.add_argument("--exe",required=True); a.add_argument("--base",required=True)
    a.add_argument("--units",required=True); a.add_argument("--out",required=True)
    x=a.parse_args()
    exe,base,units,out=map(pathlib.Path,(x.exe,x.base,x.units,x.out))
    if digest(exe)!=EXPECTED: raise SystemExit("Executable SHA-256 mismatch; refusing to combine builds.")
    dis=base/"renderer/backend-probe/01-full-disassembly.txt"
    if not dis.is_file(): raise SystemExit("Missing full executable disassembly in base audit.")
    out.mkdir(parents=True,exist_ok=True)
    rows=disasm_rows(dis)
    calls=collections.defaultdict(list); globals_=collections.defaultdict(list)
    cr=re.compile(r"\bcall\s+(?:0x)?([0-9a-fA-F]+)\b",re.I)
    watch=("0xf8d294","0x1355bb4","0x1329b14","0x52d3f4","0x52d3ec","0x52d3e8","0x52d3e0","0x52d3e4","0x52d3f8")
    for addr,asm,raw in rows:
        m=cr.search(asm)
        if m: calls[int(m.group(1),16)].append({"at":hex(addr),"asm":asm})
        for g in watch:
            if g in asm.lower(): globals_[g].append({"at":hex(addr),"asm":asm})
    targets=(0x510790,0x510a10,0x510b90,0x4fb8b4,0x4fbde4,0x4f9fc4,0x4fa0a0)
    callmap={hex(t):calls.get(t,[]) for t in targets}
    windows=[
        ("mode-option",0x4b94d1,0x4b9811),("device-mode-setup",0x4ee5ec,0x4ee965),
        ("polygon-object-entry",0x4f9fc4,0x4fa150),("edge-builder",0x4fb8b4,0x4fbde4),
        ("span-and-fill-dispatch",0x4fbde4,0x4fc1f0),("scanline-edge-converter",0x510790,0x510a10),
        ("textured-pixel-fill",0x510a10,0x510c80),("d3d-transform",0x4dba5f,0x4dbb60),
        ("callback-tag-writer",0x4e59c8,0x4e5a80),("unproven-packed-selector",0x514c80,0x514fc9)]
    wd=out/"renderer/disassembly-windows"; wd.mkdir(parents=True,exist_ok=True)
    for name,lo,hi in windows:
        (wd/(name+".asm.txt")).write_text("\n".join(r for addr,asm,r in rows if lo<=addr<hi)+"\n")
    variants=[]
    for p in sorted(units.glob("scout*.dpc")):
        rec=scan_dpc(p)
        if rec: variants.append(rec)
    td=out/"transforms"; td.mkdir(exist_ok=True)
    (td/"ALL-SCOUT-CLASS100-150-SLOT-AUDIT.json").write_text(json.dumps({
        "class100And150Included":True,"variants":variants,
        "interpretation":"The +0x34 field is captured for both class 100 and class 150 opcode-5 records. These are animation registration slots, not mesh labels."
    },indent=2)+"\n")
    anim=base/"animation/MOTION-CATALOG.json"
    if anim.is_file():
        s=json.loads(anim.read_text()).get("summary",{})
        ad=out/"animation"; ad.mkdir(exist_ok=True)
        (ad/"MOTION-CATALOG-CORRECTED-SUMMARY.json").write_text(json.dumps({
            "fileCount":s.get("fileCount"),"decodedFrames":s.get("decodedFrames"),
            "frameStrideBytes":s.get("frameStrideBytes"),"entriesPerFrame":s.get("entriesPerFrame"),
            "entryStrideBytes":s.get("entryStrideBytes"),"fourthWordHex":s.get("fourthWordHex"),
            "countMismatches":s.get("countMismatches"),
            "note":"Uses summary.entriesPerFrame. 19 frame entries vs 18 executable animation cursors is still an unproven alignment."
        },indent=2)+"\n")
    report={
      "executableSha256":EXPECTED,"softwareRenderer":{
        "polygonObjectEntry":"0x4f9fc4","objectTypeByte":"[object+7] == 0xa0",
        "primitiveRecordArray":"0x13a1fc0","primitiveRecordStride":64,"primitiveCount":"byte [object+6]",
        "edgeBuilder":"0x4fb8b4","scanlineEdgeConverter":"0x510790",
        "visibleSpanAndFillDispatch":"0x4fbde4","pixelWriters":["0x510a10","0x510b90"],
        "pixelEvidence":"MMX pixel writer consumes indexed texture bytes, checks 0xff transparency, looks up 16-bit palette words and writes to a software surface based at 0x1329b14.",
        "calls":callmap,"globals":dict(globals_),
        "conclusion":"A CPU software textured-polygon/scanline pipeline is present. It is not yet proven that all scenes or the user's Direct3D-disabled Scout path use it."
      },
      "modeSelection":{"menuOptionGlobal":"0xf8d294","rendererFlagGlobal":"0x1355bb4",
        "flagReferences":globals_.get("0x1355bb4",[]),
        "conclusion":"The renderer flag is explicitly set to 1 or 0 and tested. Its exact dataflow from the menu option and the branch selecting Scout software rendering remain unresolved."},
      "callbackTag":{"writer":"0x4e59c8","writes":"bits 13..15 of DWORD [child+0x14]",
        "candidateSelector":"0x514d15 reads bits from [record+0x20] and a mask at [record+0x24]",
        "status":"UNLINKED: candidate selector has not been proven to consume the writer's field."},
      "scoutGeometryLink":"No exact pointer/vertex/index/transform dataflow yet joins the nine Scout geometry sections to the 64-byte software-raster primitive records.",
      "dpcVariantCount":len(variants)
    }
    (out/"renderer/SOFTWARE-RENDERER-PIPELINE.json").write_text(json.dumps(report,indent=2)+"\n")
    lines=[
      "# Scout software-renderer investigation",
      "",
      "A CPU software textured-polygon and scanline pipeline is confirmed in the executable.",
      "",
      "- 0x4F9FC4 handles a polygon-like object record; byte +7 is checked against 0xA0.",
      "- 0x4FA0A0 iterates a primitive count at byte +6 across 64-byte records beginning at 0x13A1FC0.",
      "- 0x4FB8B4 prepares fixed-point polygon edge data.",
      "- 0x510790 converts polygon edges into scanline coverage.",
      "- 0x4FBDE4 collects visible spans and dispatches to 0x510A10 or 0x510B90.",
      "- 0x510A10 uses MMX, indexed texture bytes, 16-bit palette lookup and a 0xFF transparency check before writing to the software surface.",
      "",
      "This establishes a real CPU textured-polygon raster pipeline, not merely DirectDraw initialisation. It does not yet prove the software path is selected for the user's unchecked Direct3D mode, or that Scout DPC mesh data feeds it.",
      "",
      "The renderer option global 0xF8D294 and a separate renderer flag at 0x1355BB4 are both tracked. The exact dataflow between them is still unresolved.",
      "",
      "The 0x4E59C8 eight-way tag write remains unlinked. 0x514D15 is only a candidate packed selector; it has not been proven to read the exact field written at child+0x14.",
      "",
      "No direct dataflow currently joins Scout's nine exported geometry sections to these 64-byte software-raster primitive records.",
      "",
      "The supplementary DPC report scans all Scout variants, including male class 100 and female class 150, and records their +0x34 slot values."
    ]
    (out/"renderer/SOFTWARE-RENDERER-PIPELINE.md").write_text("\n".join(lines)+"\n")
    status=[]
    for p in sorted((base/"logs").glob("*.status")): status.append(f"- {p.name}: {p.read_text().strip()}")
    summary=[
      "# Scout next-stage consolidated report","",
      f"- Executable SHA-256: {EXPECTED}",
      f"- Scout DPC variants scanned: {len(variants)}",
      f"- Calls to 0x510790: {len(calls.get(0x510790,[]))}",
      f"- Calls to 0x510A10: {len(calls.get(0x510a10,[]))}",
      f"- Calls to 0x510B90: {len(calls.get(0x510b90,[]))}",
      "","## Base task statuses","",*(status or ["- No status files found."]),
      "","## Main result","",
      "The executable contains a CPU software textured-polygon/scanline renderer. The exact code path is retained in renderer/disassembly-windows and summarised in renderer/SOFTWARE-RENDERER-PIPELINE.md.",
      "","## Remaining blockers","",
      "- Direct Scout geometry-to-software-raster input mapping.",
      "- Exact menu-option to renderer-mode branch selection.",
      "- Verified UV and texture/material assignment.",
      "- Verified 18-channel animation / 19-entry MC alignment to the eight geometry sections.",
      "- The eight-way callback tag's actual consumer.",
      "","This bundle includes the previous geometry, texture, animation and renderer evidence. Scout reconstruction is not yet complete."
    ]
    (out/"SCOUT-NEXT-STAGE-REPORT.md").write_text("\n".join(summary)+"\n")
    print(f"PASS: variants={len(variants)}; calls-to-510790={len(calls.get(0x510790,[]))}; report={out/'SCOUT-NEXT-STAGE-REPORT.md'}")

if __name__=="__main__": main()
