#!/usr/bin/env python3
"""Export Scout body and glider assemblies from the corrected runtime callback report."""
import argparse, collections, hashlib, json, os, struct
import numpy as np
from PIL import Image
import trimesh

def read_records(blob, x):
    p = int(x["payloadTarget"], 16)
    out = []
    for _ in range(int(x["payloadCount"])):
        if p + 4 > len(blob):
            break
        cls = struct.unpack_from("<H", blob, p + 2)[0]
        stride = (cls & 255) * 4
        if stride < 24 or p + stride > len(blob):
            break
        if cls in (0x090c, 0x090d):
            inds = struct.unpack_from("<4H", blob, p + 4)
            uv = struct.unpack_from("<8H", blob, p + 0x1c)
            tid = struct.unpack_from("<I", blob, p + 0x2c)[0] & 255
            out.append((cls, inds, uv, tid))
        elif cls == 0x070b:
            inds = struct.unpack_from("<3H", blob, p + 4)
            uv = struct.unpack_from("<6H", blob, p + 0x1c)
            tid = struct.unpack_from("<I", blob, p + 0x28)[0] & 255
            out.append((cls, inds, uv, tid))
        p += stride
    return out

def make_anchor_map(report):
    events = {e["record"]: e for e in report.get("callbackRun", {}).get("events", []) if e.get("runId") == 0}
    anchors = collections.defaultdict(list)
    for link in report.get("geometry", {}).get("links", []):
        anchor = link.get("ownerAnchor")
        if not anchor:
            continue
        for key in ("meshNode", "transformNode"):
            event = events.get(link.get(key))
            if event and event.get("children"):
                anchors[int(event["children"][0], 16)].append(anchor)
    return anchors

def export_scene(name, execs, blob, textures, root_matrix, anchors, outdir, mode, scale):
    scene = trimesh.Scene()
    included, omitted = set(), []
    triangles = 0
    texture_faces = collections.Counter()
    for x in execs:
        d = int(x["descriptor"], 16)
        path = x.get("transformPath") or []
        records = read_records(blob, x)
        if not records:
            continue
        if mode == "body" and (not path):
            continue
        if mode == "glider" and path:
            continue
        if mode == "body":
            records = [r for r in records if r[3] in (2, 3)]
        if not records:
            continue
        coord = int(x["coordinateTarget"], 16)
        max_index = max(i for _, inds, _, _ in records for i in inds)
        # These six small effect descriptors reference a separate, unresolved
        # shared-index pool; do not misread the payload tail as vertex data.
        if max_index > 100 and coord in (0x1490, 0x14b8, 0x1508):
            omitted.append({"descriptor": hex(d), "coordinateTarget": hex(coord), "maxIndex": max_index, "reason": "unresolved effect/index pool"})
            continue
        if coord + (max_index + 1) * 8 > len(blob):
            omitted.append({"descriptor": hex(d), "coordinateTarget": hex(coord), "maxIndex": max_index, "reason": "vertex range exceeds DPC"})
            continue
        local = np.array([struct.unpack_from("<hhh", blob, coord + i * 8) for i in range(max_index + 1)], dtype=float)
        if path:
            matrix = np.array(path[-1]["worldMatrixCandidate"], dtype=float).reshape(3, 3)
            position = np.array(x["position"], dtype=float)
            instances = [position]
        else:
            matrix = root_matrix
            instances = [np.array(a, dtype=float) for a in anchors.get(d, [])] or [np.zeros(3)]
        positions_base = local @ matrix.T
        for position in instances:
            positions = (positions_base + position) * scale
            groups = collections.defaultdict(list)
            for cls, inds, uv, tid in records:
                if tid in textures:
                    groups[tid].append((cls, inds, uv))
            for tid, facespecs in groups.items():
                image = textures[tid]
                width, height = image.size
                vertices, uvs, faces = [], [], []
                for cls, inds, uv in facespecs:
                    n = 3 if cls == 0x070b else 4
                    base = len(vertices)
                    for j in range(n):
                        vertices.append(positions[inds[j]])
                        uvs.append((uv[2*j] / width, 1.0 - uv[2*j+1] / height))
                    if n == 3:
                        faces.append([base, base+1, base+2])
                    else:
                        faces.extend([[base, base+1, base+2], [base, base+2, base+3]])
                if not faces:
                    continue
                material = trimesh.visual.material.PBRMaterial(
                    name=f"scout_texture_{tid+1}", baseColorTexture=image,
                    metallicFactor=0.0, roughnessFactor=1.0,
                    alphaMode="BLEND", doubleSided=True
                )
                visual = trimesh.visual.texture.TextureVisuals(uv=np.array(uvs), material=material)
                mesh = trimesh.Trimesh(vertices=np.array(vertices), faces=np.array(faces), visual=visual, process=False)
                scene.add_geometry(mesh, node_name=f"{d:04x}_{tid}_{len(included)}", geom_name=f"{d:04x}_texture_{tid+1}")
                triangles += len(faces)
                texture_faces[tid] += len(faces)
        included.add(d)
    out = os.path.join(outdir, f"scout-{name}.glb")
    scene.export(out)
    return {
        "file": os.path.basename(out), "descriptors": len(included),
        "descriptorOffsets": [hex(x) for x in sorted(included)],
        "geometryNodes": len(scene.geometry), "triangles": triangles,
        "textureTriangleCounts": {str(k): v for k, v in sorted(texture_faces.items())},
        "bounds": scene.bounds.tolist() if scene.bounds is not None else None,
        "omitted": omitted
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dpc", required=True)
    ap.add_argument("--runtime-json", required=True)
    ap.add_argument("--textures", required=True, help="directory containing texture-01.png ... texture-06.png")
    ap.add_argument("--out", required=True)
    ap.add_argument("--scale", type=float, default=1/16)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    blob = open(args.dpc, "rb").read()
    report = json.load(open(args.runtime_json, encoding="utf-8"))
    execs = [x for x in report["descriptorExecutions"] if x.get("seedRecord") == "0x9368" and x.get("runId") == 0]
    if not execs:
        raise SystemExit("No Scout root descriptor executions found for seed 0x9368/run 0")
    root_path = next((x["transformPath"] for x in execs if x.get("transformPath")), None)
    if not root_path:
        raise SystemExit("No root transform matrix found")
    root_matrix = np.array(root_path[0]["worldMatrixCandidate"], dtype=float).reshape(3, 3)
    textures = {
        i: Image.open(os.path.join(args.textures, f"texture-{i+1:02}.png")).convert("RGBA")
        for i in range(6)
        if os.path.exists(os.path.join(args.textures, f"texture-{i+1:02}.png"))
    }
    anchors = make_anchor_map(report)
    results = {
        "body": export_scene("body", execs, blob, textures, root_matrix, anchors, args.out, "body", args.scale),
        "glider": export_scene("glider", execs, blob, textures, root_matrix, anchors, args.out, "glider", args.scale),
        "full": export_scene("full", execs, blob, textures, root_matrix, anchors, args.out, "full", args.scale)
    }
    results["source"] = {
        "dpc": os.path.basename(args.dpc),
        "dpcSha256": hashlib.sha256(blob).hexdigest(),
        "runtimeJson": os.path.basename(args.runtime_json),
        "scale": args.scale,
        "translationComposition": "worldPosition = parentMatrix * localTranslation + parentPosition"
    }
    with open(os.path.join(args.out, "scout-export-report.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
