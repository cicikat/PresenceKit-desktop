"""Read-only audit of a .glb against the runtime rig contract.

Parses the glTF JSON chunk directly (no Blender, no three.js) and checks what
src/shared/character/humanoid.ts, standingPose.ts and performanceRoutes.ts
actually need: role-resolvable bone names, both eye bones for bone gaze, the
documented morph key names, node scale sanity, left/right sides, and the arm
spread that decides which standing correction gets applied.

Usage: python audit_glb.py <file.glb>
"""
import json
import math
import struct
import sys

# Mirrors ROLE_CANDIDATES in src/shared/character/humanoid.ts (compared lowercased).
CANDIDATES = {
    "hips": ["def-hips", "def-pelvis", "hips", "pelvis", "mixamorighips", "root.x", "c_root.x"],
    "spine": ["def-spine.001", "def-spine", "spine", "mixamorigspine", "spine_01.x"],
    "chest": ["def-spine.003", "def-spine.002", "chest", "upperchest", "spine.003",
              "mixamorigspine2", "spine_02.x", "spine_03.x"],
    "neck": ["def-spine.004", "def-neck", "neck", "mixamorigneck", "neck.x"],
    "head": ["def-spine.006", "def-spine.005", "def-head", "head", "mixamorighead", "head.x"],
    "leftEye": ["def-eye.l", "eye.l", "lefteye", "mixamoriglefteye", "eye.l", "c_eye.l"],
    "rightEye": ["def-eye.r", "eye.r", "righteye", "mixamorigrighteye", "eye.r", "c_eye.r"],
    "shoulderL": ["def-shoulder.l", "shoulder.l", "def-clavicle.l", "leftshoulder",
                  "mixamorigleftshoulder", "shoulder.l"],
    "shoulderR": ["def-shoulder.r", "shoulder.r", "def-clavicle.r", "rightshoulder",
                  "mixamorigrightshoulder", "shoulder.r"],
    "upperArmL": ["def-upper_arm.l", "upper_arm.l", "leftarm", "mixamorigleftarm", "arm_stretch.l", "arm.l"],
    "upperArmR": ["def-upper_arm.r", "upper_arm.r", "rightarm", "mixamorigrightarm", "arm_stretch.r", "arm.r"],
    "lowerArmL": ["def-forearm.l", "forearm.l", "leftforearm", "mixamorigleftforearm",
                  "forearm_stretch.l", "forearm.l"],
    "lowerArmR": ["def-forearm.r", "forearm.r", "rightforearm", "mixamorigrightforearm",
                  "forearm_stretch.r", "forearm.r"],
    "handL": ["def-hand.l", "hand.l", "lefthand", "mixamoriglefthand", "hand.l"],
    "handR": ["def-hand.r", "hand.r", "righthand", "mixamorigrighthand", "hand.r"],
    "upperLegL": ["def-thigh.l", "thigh.l", "leftupleg", "mixamorigleftupleg", "thigh_stretch.l", "thigh.l"],
    "upperLegR": ["def-thigh.r", "thigh.r", "rightupleg", "mixamorigrightupleg", "thigh_stretch.r", "thigh.r"],
    "lowerLegL": ["def-shin.l", "shin.l", "leftleg", "mixamorigleftleg", "leg_stretch.l", "leg.l"],
    "lowerLegR": ["def-shin.r", "shin.r", "rightleg", "mixamorigrightleg", "leg_stretch.r", "leg.r"],
    "footL": ["def-foot.l", "foot.l", "leftfoot", "mixamorigleftfoot", "foot.l"],
    "footR": ["def-foot.r", "foot.r", "rightfoot", "mixamorigrightfoot", "foot.r"],
    "toesL": ["def-toe.l", "toe.l", "lefttoebase", "mixamoriglefttoebase", "toes_01.l", "toes.l"],
    "toesR": ["def-toe.r", "toe.r", "righttoebase", "mixamorigrighttoebase", "toes_01.r", "toes.r"],
}

STANDING_REQUIRED = ["hips", "spine", "chest", "head", "upperArmL", "lowerArmL", "upperArmR", "lowerArmR"]
LEG_ROLES = ["upperLegL", "lowerLegL", "footL", "upperLegR", "lowerLegR", "footR"]

EXPR_KEYS = ["smile", "sad", "angry", "surprised", "shy", "blink", "browUp", "browDown"]
IDLE_KEYS = ["mouthOpen", "hairSway", "hairSwayLeft", "hairSwayRight"]
GAZE_KEYS = ["eyeLookLeft", "eyeLookRight", "eyeLookUp", "eyeLookDown"]

PHYS_HINTS = ("hair", "tail", "ribbon", "skirt", "cloth", "ahoge", "bang", "fringe")


def read_gltf_json(path):
    with open(path, "rb") as f:
        magic, version, _ = struct.unpack("<III", f.read(12))
        if magic != 0x46546C67:
            raise SystemExit("not a GLB file")
        while True:
            head = f.read(8)
            if len(head) < 8:
                raise SystemExit("no JSON chunk found")
            length, ctype = struct.unpack("<II", head)
            data = f.read(length)
            if ctype == 0x4E4F534A:
                return json.loads(data.decode("utf-8")), version


def mat_mul(a, b):
    """4x4 row-major multiply."""
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def node_local_matrix(n):
    """Local TRS (or explicit matrix) as a 4x4 row-major matrix.

    Rotation must be included: Rigify bones carry local rotations, and a
    translation-only walk reports nonsense arm directions (a T-pose can read as
    180 degrees). Scale matters too, for the same reason.
    """
    if "matrix" in n:
        m = n["matrix"]  # glTF stores column-major
        return [[m[0], m[4], m[8], m[12]],
                [m[1], m[5], m[9], m[13]],
                [m[2], m[6], m[10], m[14]],
                [m[3], m[7], m[11], m[15]]]
    tx, ty, tz = n.get("translation", [0, 0, 0])
    x, y, z, w = n.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = n.get("scale", [1, 1, 1])
    # Quaternion to rotation matrix.
    r = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    s = [sx, sy, sz]
    return [[r[0][0] * s[0], r[0][1] * s[1], r[0][2] * s[2], tx],
            [r[1][0] * s[0], r[1][1] * s[1], r[1][2] * s[2], ty],
            [r[2][0] * s[0], r[2][1] * s[1], r[2][2] * s[2], tz],
            [0, 0, 0, 1]]


def world_positions(nodes):
    """Full world translation per node, honouring parent rotation and scale."""
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i

    cache = {}

    def world_matrix(i):
        if i in cache:
            return cache[i]
        m = node_local_matrix(nodes[i])
        p = parent.get(i)
        if p is not None:
            m = mat_mul(world_matrix(p), m)
        cache[i] = m
        return m

    return {i: (world_matrix(i)[0][3], world_matrix(i)[1][3], world_matrix(i)[2][3])
            for i in range(len(nodes))}


def main():
    path = sys.argv[1]
    g, ver = read_gltf_json(path)
    nodes = g.get("nodes", [])
    out = {"file": path, "glb_version": ver,
           "counts": {k: len(g.get(k, [])) for k in
                      ("nodes", "meshes", "skins", "materials", "images", "animations", "accessors")},
           "extensions_used": g.get("extensionsUsed", [])}

    # --- skeleton ---------------------------------------------------------
    joint_ids = set()
    for s in g.get("skins", []):
        joint_ids.update(s.get("joints", []))
    out["joint_count"] = len(joint_ids)

    by_lower = {}
    for i in joint_ids:
        nm = nodes[i].get("name", "")
        by_lower.setdefault(nm.lower(), i)

    resolved = {}
    for role, cands in CANDIDATES.items():
        for c in cands:
            if c in by_lower:
                resolved[role] = nodes[by_lower[c]].get("name")
                break
    out["resolved_roles"] = resolved
    out["missing_roles"] = [r for r in CANDIDATES if r not in resolved]
    out["standing_missing"] = [r for r in STANDING_REQUIRED if r not in resolved]
    out["legs_missing"] = [r for r in LEG_ROLES if r not in resolved]
    out["bone_gaze_possible"] = "leftEye" in resolved and "rightEye" in resolved

    wp = world_positions(nodes)
    name_to_id = {nodes[i].get("name"): i for i in joint_ids}

    # Arm spread → which standing correction the runtime will apply.
    ua, tip = resolved.get("upperArmL"), resolved.get("handL") or resolved.get("lowerArmL")
    if ua and tip:
        a, b = wp[name_to_id[ua]], wp[name_to_id[tip]]
        d = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        ln = math.sqrt(sum(v * v for v in d))
        if ln > 1e-9:
            # glTF is +Y up, so straight down is -Y.
            out["arm_drop_deg"] = round(math.degrees(math.acos(max(-1, min(1, -d[1] / ln)))), 1)

    # Left/right sides: +X should be the character's own left.
    side_issues = []
    for lrole in [r for r in resolved if r.endswith("L")] + (["leftEye"] if "leftEye" in resolved else []):
        rrole = "rightEye" if lrole == "leftEye" else lrole[:-1] + "R"
        if rrole not in resolved:
            continue
        lx = wp[name_to_id[resolved[lrole]]][0]
        rx = wp[name_to_id[resolved[rrole]]][0]
        if abs(lx - rx) < 1e-4:
            continue
        if lx < rx:
            side_issues.append({"pair": [lrole, rrole], "leftX": round(lx, 4), "rightX": round(rx, 4)})
    out["side_issues"] = side_issues

    # Node scale sanity on the joints the runtime writes.
    bad_scale = []
    for role, nm in resolved.items():
        n = nodes[name_to_id[nm]]
        s = n.get("scale")
        if not s:
            continue
        if min(s) <= 0 or abs(s[0] - s[1]) > 0.01 or abs(s[1] - s[2]) > 0.01:
            bad_scale.append({"role": role, "bone": nm, "scale": s})
    out["bad_scale"] = bad_scale

    # Physics-chain candidates among joints, and whether any carry an extras marker.
    phys = [nodes[i].get("name", "") for i in joint_ids
            if any(h in nodes[i].get("name", "").lower() for h in PHYS_HINTS)]
    out["physics_candidate_count"] = len(phys)
    out["physics_candidates_sample"] = sorted(phys)[:30]
    marked = [nodes[i].get("name") for i in joint_ids
              if any("phys" in str(k).lower() for k in (nodes[i].get("extras") or {}))]
    out["physics_marked"] = marked

    # --- morph targets ----------------------------------------------------
    keys = []
    for m in g.get("meshes", []):
        names = (m.get("extras") or {}).get("targetNames") or []
        if names:
            keys.append({"mesh": m.get("name"), "targets": names})
    out["morph_meshes"] = keys
    flat = sorted({n for k in keys for n in k["targets"]})
    out["morph_all"] = flat
    low = {n.lower() for n in flat}
    out["morph_status"] = {
        "expressions_present": [k for k in EXPR_KEYS if k.lower() in low],
        "expressions_missing": [k for k in EXPR_KEYS if k.lower() not in low],
        "idle_present": [k for k in IDLE_KEYS if k.lower() in low],
        "gaze_present": [k for k in GAZE_KEYS if k.lower() in low],
        "gaze_missing": [k for k in GAZE_KEYS if k.lower() not in low],
        "nonstandard": [n for n in flat
                        if n.lower() not in {k.lower() for k in EXPR_KEYS + IDLE_KEYS + GAZE_KEYS}],
    }

    out["animations"] = [a.get("name") for a in g.get("animations", [])]

    # Height, to confirm the 1 unit = 1 metre convention.
    ys = [t[1] for t in wp.values()]
    if ys:
        out["joint_y_range"] = [round(min(ys), 3), round(max(ys), 3)]

    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
