"""Verify that physics-marked bones actually drive mesh vertices.

Checks:
1. Which bones have phys_chain=1 in their extras
2. For each marked bone, walk its chain and collect all bones
3. For each chain bone, find which meshes/vertices it influences (via skin weights)
4. Report chains that mark bones but don't deform any mesh → broken physics

Usage: python verify_physics_chains.py <file.glb>
"""
import json
import struct
import sys

def read_gltf_json(path):
    with open(path, "rb") as f:
        magic, _, _ = struct.unpack("<III", f.read(12))
        if magic != 0x46546C67:
            raise SystemExit("not a GLB")
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

    # Find all joints across all skins
    all_joints = set()
    for skin in g.get("skins", []):
        all_joints.update(skin.get("joints", []))

    # Find marked chain roots
    marked = []
    for i in all_joints:
        n = nodes[i]
        extras = n.get("extras") or {}
        if extras.get("phys_chain") == 1:
            marked.append({"idx": i, "name": n.get("name"), "extras": extras})

    print(f"Found {len(marked)} bones with phys_chain=1:")
    for m in marked:
        print(f"  [{m['idx']}] {m['name']}")

    # For each marked root, walk its chain (first Bone child at each level)
    def first_bone_child(node_idx):
        for child_idx in nodes[node_idx].get("children", []):
            if child_idx in all_joints:
                return child_idx
        return None

    chains = []
    for root in marked:
        chain = [root["idx"]]
        cur = root["idx"]
        while True:
            nxt = first_bone_child(cur)
            if nxt is None:
                break
            chain.append(nxt)
            cur = nxt
        chains.append({"root": root["name"], "bones": chain})

    print(f"\n{len(chains)} chains collected:")
    for ch in chains:
        names = [nodes[b].get("name", f"#{b}") for b in ch["bones"]]
        print(f"  {ch['root']}: {len(ch['bones'])} bones")
        if len(names) <= 6:
            print(f"    {' -> '.join(names)}")
        else:
            print(f"    {' -> '.join(names[:3])} ... {' -> '.join(names[-2:])}")

    # Now check which meshes each chain bone influences
    print("\n=== Checking which meshes each chain deforms ===")
    for ch in chains:
        influenced_meshes = set()
        for bone_idx in ch["bones"]:
            # A bone influences a mesh if it appears in that mesh's skin's joints
            for skin_idx, skin in enumerate(g.get("skins", [])):
                if bone_idx in skin.get("joints", []):
                    # Find meshes that use this skin
                    for node_idx, node in enumerate(nodes):
                        if node.get("skin") == skin_idx and "mesh" in node:
                            mesh_name = g["meshes"][node["mesh"]].get("name", f"mesh{node['mesh']}")
                            influenced_meshes.add(mesh_name)

        print(f"\n{ch['root']} ({len(ch['bones'])} bones):")
        if influenced_meshes:
            print(f"  OK deforms: {', '.join(sorted(influenced_meshes))}")
        else:
            print(f"  WARNING: chain does not deform any mesh! Physics will run but have no visual effect.")

if __name__ == "__main__":
    main()
