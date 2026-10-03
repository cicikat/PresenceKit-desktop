"""Mark hair chain roots with phys_chain=1 for runtime spring-bone physics.

Rigify exports both ORG- (original metarig) and DEF- (deform) bones. Only DEF-*
actually drive the mesh, so we mark DEF- chain roots, not ORG-. The runtime
collectSpringChains() walks bones with userData.phys_chain === 1 and follows
their first Bone child at each level until a leaf (no more Bone children).

Strategy: find every DEF-hair_* that has a Bone child but whose parent (if any)
is NOT a DEF-hair_*. That's a chain root. Mark it with a custom property
phys_chain=1, using default spring params (runtime will merge with settings).

Usage: blender -b <in.blend> -P mark_hair_physics.py -- <out.blend>
"""
import bpy
import sys

def main():
    # Blender passes everything after -- as sys.argv to the script.
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("usage: blender -b in.blend -P mark_hair_physics.py -- out.blend")
    out_path = argv[0]

    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not armatures:
        raise SystemExit("no armature found")
    arm = max(armatures, key=lambda o: len(o.data.bones))
    print(f"[mark] primary armature: {arm.name} ({len(arm.data.bones)} bones)")

    # Identify chain roots: DEF-hair_* with a Bone child, whose parent is not DEF-hair_*.
    hair_bones = {b for b in arm.data.bones if b.name.startswith("DEF-hair")}
    print(f"[mark] DEF-hair* bones: {len(hair_bones)}")

    def first_bone_child(b):
        # A Blender Bone's .children are other Bones (not Objects), so any child is already a Bone.
        return b.children[0] if b.children else None

    roots = []
    for b in hair_bones:
        if not first_bone_child(b):
            continue  # leaf or childless, not a root
        parent = b.parent
        if parent and parent in hair_bones:
            continue  # mid-chain
        roots.append(b)

    print(f"[mark] identified chain roots: {len(roots)}")
    for r in sorted(roots, key=lambda b: b.name)[:40]:
        print(f"  {r.name}")

    # Mark each root's pose bone with phys_chain=1 (custom property).
    for r in roots:
        pb = arm.pose.bones.get(r.name)
        if not pb:
            print(f"[mark] WARNING: no pose bone for {r.name}")
            continue
        pb["phys_chain"] = 1
        # Optional: embed default params as Blender extras (runtime reads these too).
        # pb["phys_stiffness"] = 0.15
        # pb["phys_damping"] = 0.85
        # pb["phys_gravity"] = 0.3

    print(f"[mark] marked {len(roots)} roots with phys_chain=1")
    bpy.ops.wm.save_as_mainfile(filepath=out_path, copy=True)
    print(f"[mark] saved: {out_path}")


if __name__ == "__main__":
    main()
