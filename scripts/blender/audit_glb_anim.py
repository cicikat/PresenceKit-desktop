"""What do a GLB's animation channels actually drive? Read-only.

Matters because the runtime performer owns morph weights and a few semantic bones.
A clip that also writes those same properties fights it — and `selectIdleClip`
falls back to the first clip when none is named `idle`, so a stray shape-key
animation can end up driving the character.

Usage: python audit_glb_anim.py <file.glb>
"""
import json
import struct
import sys


def read_gltf_json(path):
    with open(path, "rb") as f:
        magic, _, _ = struct.unpack("<III", f.read(12))
        if magic != 0x46546C67:
            raise SystemExit("not a GLB file")
        while True:
            head = f.read(8)
            if len(head) < 8:
                raise SystemExit("no JSON chunk")
            length, ctype = struct.unpack("<II", head)
            data = f.read(length)
            if ctype == 0x4E4F534A:
                return json.loads(data.decode("utf-8"))


def main():
    g = read_gltf_json(sys.argv[1])
    nodes = g.get("nodes", [])
    out = []
    for a in g.get("animations", []):
        paths = {}
        targets = set()
        for ch in a.get("channels", []):
            t = ch.get("target", {})
            p = t.get("path", "?")
            paths[p] = paths.get(p, 0) + 1
            ni = t.get("node")
            if ni is not None and ni < len(nodes):
                targets.add(nodes[ni].get("name", f"node{ni}"))
        out.append({
            "name": a.get("name"),
            "channels": len(a.get("channels", [])),
            "paths": paths,
            "target_count": len(targets),
            "targets_sample": sorted(targets)[:12],
        })
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
