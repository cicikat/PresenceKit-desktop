"""Read-only audit of a character .blend against the runtime's rig contract.

Run:  blender -b <file.blend> -P audit_rig.py
Writes nothing; prints a report between AUDIT-BEGIN/AUDIT-END markers.

Checks what src/shared/character/humanoid.ts and standingPose.ts actually need:
role-resolvable bone names, eye bones (both required for bone gaze), morph key
names against the documented standard, bone scale sanity and left/right sides.
"""
import bpy
import json
from mathutils import Vector

# Mirrors ROLE_CANDIDATES in src/shared/character/humanoid.ts (lowercased compare).
CANDIDATES = {
    "head": ["def-spine.006", "def-spine.005", "def-head", "head", "mixamorighead", "head.x"],
    "neck": ["def-spine.004", "def-neck", "neck", "mixamorigneck", "neck.x"],
    "chest": ["def-spine.003", "def-spine.002", "chest", "upperchest", "spine.003", "mixamorigspine2", "spine_02.x", "spine_03.x"],
    "spine": ["def-spine.001", "def-spine", "spine", "mixamorigspine", "spine_01.x"],
    "hips": ["def-hips", "def-pelvis", "hips", "pelvis", "mixamorighips", "root.x", "c_root.x"],
    "shoulderL": ["def-shoulder.l", "shoulder.l", "def-clavicle.l", "leftshoulder", "mixamorigleftshoulder"],
    "shoulderR": ["def-shoulder.r", "shoulder.r", "def-clavicle.r", "rightshoulder", "mixamorigrightshoulder"],
    "upperArmL": ["def-upper_arm.l", "upper_arm.l", "leftarm", "mixamorigleftarm", "arm_stretch.l", "arm.l"],
    "upperArmR": ["def-upper_arm.r", "upper_arm.r", "rightarm", "mixamorigrightarm", "arm_stretch.r", "arm.r"],
    "lowerArmL": ["def-forearm.l", "forearm.l", "leftforearm", "mixamorigleftforearm", "forearm_stretch.l", "forearm.l"],
    "lowerArmR": ["def-forearm.r", "forearm.r", "rightforearm", "mixamorigrightforearm", "forearm_stretch.r", "forearm.r"],
    "handL": ["def-hand.l", "hand.l", "lefthand", "mixamoriglefthand"],
    "handR": ["def-hand.r", "hand.r", "righthand", "mixamorigrighthand"],
    "upperLegL": ["def-thigh.l", "thigh.l", "leftupleg", "mixamorigleftupleg", "thigh_stretch.l"],
    "upperLegR": ["def-thigh.r", "thigh.r", "rightupleg", "mixamorigrightupleg", "thigh_stretch.r"],
    "lowerLegL": ["def-shin.l", "shin.l", "leftleg", "mixamorigleftleg", "leg_stretch.l", "leg.l"],
    "lowerLegR": ["def-shin.r", "shin.r", "rightleg", "mixamorigrightleg", "leg_stretch.r", "leg.r"],
    "footL": ["def-foot.l", "foot.l", "leftfoot", "mixamorigleftfoot"],
    "footR": ["def-foot.r", "foot.r", "rightfoot", "mixamorigrightfoot"],
    "toesL": ["def-toe.l", "toe.l", "lefttoebase", "mixamoriglefttoebase", "toes_01.l", "toes.l"],
    "toesR": ["def-toe.r", "toe.r", "righttoebase", "mixamorigrighttoebase", "toes_01.r", "toes.r"],
    "leftEye": ["def-eye.l", "eye.l", "lefteye", "mixamoriglefteye", "c_eye.l"],
    "rightEye": ["def-eye.r", "eye.r", "righteye", "mixamorigrighteye", "c_eye.r"],
}

STANDING_REQUIRED = ["hips", "spine", "chest", "head", "upperArmL", "lowerArmL", "upperArmR", "lowerArmR"]
LEG_ROLES = ["upperLegL", "lowerLegL", "footL", "upperLegR", "lowerLegR", "footR"]

# Documented standard morph names (docs/人类说明书/room-model-import-guide.md §3).
EXPR_KEYS = ["smile", "sad", "angry", "surprised", "shy", "blink", "browUp", "browDown"]
IDLE_KEYS = ["mouthOpen", "hairSway", "hairSwayLeft", "hairSwayRight"]
GAZE_KEYS = ["eyeLookLeft", "eyeLookRight", "eyeLookUp", "eyeLookDown"]

out = {}

# --- armatures -------------------------------------------------------------
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
out["armatures"] = [
    {"name": o.name, "bones": len(o.data.bones), "scale": list(o.scale), "visible": not o.hide_get()}
    for o in armatures
]

arm = max(armatures, key=lambda o: len(o.data.bones)) if armatures else None
out["primary_armature"] = arm.name if arm else None

if arm:
    bones = {b.name: b for b in arm.data.bones}
    lower = {}
    for name in bones:
        lower.setdefault(name.lower(), name)

    resolved = {}
    for role, cands in CANDIDATES.items():
        for c in cands:
            if c in lower:
                resolved[role] = lower[c]
                break
    out["resolved_roles"] = resolved
    out["missing_roles"] = [r for r in CANDIDATES if r not in resolved]
    out["standing_missing"] = [r for r in STANDING_REQUIRED if r not in resolved]
    out["legs_missing"] = [r for r in LEG_ROLES if r not in resolved]
    out["eye_bones"] = {
        "leftEye": resolved.get("leftEye"),
        "rightEye": resolved.get("rightEye"),
        "bone_gaze_possible": "leftEye" in resolved and "rightEye" in resolved,
    }

    # Arm spread, to predict which standing correction the runtime will apply.
    ua, hand = resolved.get("upperArmL"), resolved.get("handL") or resolved.get("lowerArmL")
    if ua and hand:
        a = arm.matrix_world @ bones[ua].head_local
        b = arm.matrix_world @ bones[hand].head_local
        d = (b - a)
        if d.length > 1e-6:
            d.normalize()
            import math
            # Blender is +Z up; the export flips to +Y up. Down is -Z here.
            out["arm_drop_deg"] = round(math.degrees(math.acos(max(-1, min(1, -d.z)))), 1)

    # Bones whose names suggest a physics chain, and whether they carry the marker.
    phys_like = [n for n in bones if any(k in n.lower() for k in ("hair", "tail", "ribbon", "skirt", "cloth", "ahoge"))]
    out["physics_candidate_bones"] = phys_like[:40]
    out["physics_candidate_count"] = len(phys_like)
    marked = []
    for n in phys_like:
        pb = arm.pose.bones.get(n)
        keys = list(pb.keys()) if pb else []
        if any("phys" in k.lower() for k in keys):
            marked.append(n)
    out["physics_marked_bones"] = marked

    # Non-uniform / negative bone scale on the pose bones the runtime will write.
    bad_scale = []
    for role, name in resolved.items():
        pb = arm.pose.bones.get(name)
        if not pb:
            continue
        s = pb.scale
        if min(s) <= 0 or abs(s[0] - s[1]) > 0.01 or abs(s[1] - s[2]) > 0.01:
            bad_scale.append({"role": role, "bone": name, "scale": list(s)})
    out["bad_scale"] = bad_scale

    # Left/right sanity: in Blender +X is the character's own left.
    side_issues = []
    for lrole in [r for r in resolved if r.endswith("L")] + (["leftEye"] if "leftEye" in resolved else []):
        rrole = lrole[:-1] + "R" if lrole.endswith("L") else "rightEye"
        if rrole not in resolved:
            continue
        lx = (arm.matrix_world @ bones[resolved[lrole]].head_local).x
        rx = (arm.matrix_world @ bones[resolved[rrole]].head_local).x
        if abs(lx - rx) < 0.001:
            continue
        if lx < rx:
            side_issues.append({"pair": [lrole, rrole], "leftX": round(lx, 4), "rightX": round(rx, 4)})
    out["side_issues"] = side_issues

    out["constraint_bones"] = [pb.name for pb in arm.pose.bones if pb.constraints][:40]
    out["constraint_count"] = sum(1 for pb in arm.pose.bones if pb.constraints)

# --- shape keys ------------------------------------------------------------
all_keys = {}
for ob in bpy.data.objects:
    if ob.type != "MESH" or not ob.data.shape_keys:
        continue
    names = [kb.name for kb in ob.data.shape_keys.key_blocks][1:]  # skip Basis
    if names:
        all_keys[ob.name] = names
out["shape_keys_by_mesh"] = all_keys
flat = sorted({n for v in all_keys.values() for n in v})
out["shape_keys_all"] = flat
flat_lower = {n.lower(): n for n in flat}
out["morph_status"] = {
    "expressions_present": [k for k in EXPR_KEYS if k.lower() in flat_lower],
    "expressions_missing": [k for k in EXPR_KEYS if k.lower() not in flat_lower],
    "idle_present": [k for k in IDLE_KEYS if k.lower() in flat_lower],
    "gaze_present": [k for k in GAZE_KEYS if k.lower() in flat_lower],
    "gaze_missing": [k for k in GAZE_KEYS if k.lower() not in flat_lower],
    "nonstandard": [n for n in flat if n.lower() not in
                    {k.lower() for k in EXPR_KEYS + IDLE_KEYS + GAZE_KEYS}],
}

# --- meshes / materials / scale --------------------------------------------
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
out["mesh_count"] = len(meshes)
out["meshes"] = [
    {"name": o.name, "verts": len(o.data.vertices), "scale": [round(v, 4) for v in o.scale],
     "materials": [m.name for m in o.data.materials if m]}
    for o in meshes
][:40]
out["materials"] = [m.name for m in bpy.data.materials]
out["actions"] = [{"name": a.name, "frames": [round(f) for f in a.frame_range]} for a in bpy.data.actions]

if meshes:
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    out["world_bbox"] = {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi],
                         "height_z": round(hi.z - lo.z, 3)}

print("AUDIT-BEGIN")
print(json.dumps(out, ensure_ascii=False, indent=1))
print("AUDIT-END")
