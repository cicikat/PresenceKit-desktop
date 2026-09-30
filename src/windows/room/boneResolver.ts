import * as THREE from 'three';
import type { BoneMap } from '../../shared/room/roomSettings';
import {
  ALL_ROLES, ROLE_CANDIDATES, MIRRORED_ROLE, SEMANTIC_PARENT,
  POSE_GROUPS, POSE_GROUP_LINKS, type BoneRole, type PoseGroup,
} from '../../shared/character/humanoid';

// Smooth deterministic 1D pseudo-noise (sum of sines), returns approx -1..1
export function microNoise(t: number, seed: number): number {
  return (
    Math.sin(t * 0.7  + seed * 1.3) * 0.5 +
    Math.sin(t * 1.9  + seed * 2.7) * 0.3 +
    Math.sin(t * 3.1  + seed * 5.1) * 0.2
  );
}

export class BoneResolver {
  private byName = new Map<string, THREE.Bone>();
  /** Lowercased name → bone, for case-insensitive candidate matching. */
  private byLower = new Map<string, THREE.Bone>();
  resolved: Partial<Record<BoneRole, THREE.Bone>> = {};
  /** Topology and mapping problems found at load time. Reported, not thrown. */
  warnings: string[] = [];
  /**
   * Child roles whose link to their {@link SEMANTIC_PARENT} is broken in this export —
   * either role resolved onto a bone that is not actually a descendant of the other. Kept
   * as data (not just a warning string) so the standing pose can refuse to write across
   * the break instead of tearing the model apart.
   */
  brokenLinks = new Set<BoneRole>();

  constructor(root: THREE.Object3D, map: BoneMap = {}) {
    root.traverse(o => {
      if (o instanceof THREE.Bone) {
        this.byName.set(o.name, o);
        const lower = o.name.toLowerCase();
        // First occurrence wins: a duplicate lowercase name is ambiguous, so keep the
        // earlier one and let checkTopology report it.
        if (!this.byLower.has(lower)) this.byLower.set(lower, o);
      }
    });
    for (const role of ALL_ROLES) {
      const explicit = map[role];
      if (explicit) {
        const bone = this.byName.get(explicit);
        if (bone) { this.resolved[role] = bone; continue; }
        // An explicit entry that does not exist is a stale mapping, not a reason to fall
        // back silently — the user would keep seeing a rig that ignores their setting.
        this.warnings.push(`boneMap.${role} points at "${explicit}" which is not a bone in this model`);
      }
      for (const cand of ROLE_CANDIDATES[role]) {
        const bone = this.byLower.get(cand.toLowerCase());
        if (bone) { this.resolved[role] = bone; break; }
      }
    }
    this.checkTopology();
    if (import.meta.env.DEV) {
      const summary = ALL_ROLES
        .map(role => `${role}→${this.resolved[role]?.name ?? '(none)'}`)
        .join(', ');
      console.log('[room] bone roles:', summary);
      this.warnings.forEach(w => console.warn('[room] rig:', w));
    }
  }

  /** Roles that actually resolved, for the standing-pose capability gate. */
  presentRoles(): Set<BoneRole> {
    return new Set(ALL_ROLES.filter(r => this.resolved[r]));
  }

  /**
   * Pose groups whose internal parent/child links all hold in this export, so a rotation
   * offset written inside the group actually carries the group's meshes. A group with a
   * broken link is excluded rather than partially written: posing half a chain moves some
   * meshes and leaves the rest behind, which reads as the model coming apart.
   *
   * Links whose roles are absent are not breaks — a half-body model simply has fewer
   * groups, and `reportStanding` already describes that separately.
   */
  intactPoseGroups(): Set<PoseGroup> {
    return new Set(POSE_GROUPS.filter(
      group => !POSE_GROUP_LINKS[group].some(role => this.brokenLinks.has(role)),
    ));
  }

  names(): string[] { return [...this.byName.keys()]; }

  /**
   * Sanity checks that catch the mapping mistakes which are invisible until the character
   * moves: two roles bound to one bone, a left/right pair swapped, a child role that is
   * not actually under its parent, and non-uniform or zero scale that makes rotation
   * offsets shear instead of rotate.
   */
  private checkTopology() {
    // 1. Duplicate binding — e.g. both eyes mapped to the same bone would make gaze
    //    symmetric-broken in a way that looks like a rig bug.
    const seen = new Map<THREE.Bone, BoneRole>();
    for (const role of ALL_ROLES) {
      const bone = this.resolved[role];
      if (!bone) continue;
      const prev = seen.get(bone);
      if (prev) this.warnings.push(`roles ${prev} and ${role} both resolve to bone "${bone.name}"`);
      else seen.set(bone, role);
    }

    // 2. Parent chain — each role must be a descendant of its expected ancestor. A break
    //    here is not cosmetic: it means two roles landed on unconnected branches (two
    //    skeletons in one file, or a control rig resolved alongside a deform rig), so a
    //    rotation written to one will not carry the other's meshes with it.
    for (const [childRole, parentRole] of Object.entries(SEMANTIC_PARENT) as [BoneRole, BoneRole][]) {
      const child = this.resolved[childRole];
      const parent = this.resolved[parentRole];
      if (!child || !parent) continue;
      if (!isDescendantOf(child, parent)) {
        this.brokenLinks.add(childRole);
        this.warnings.push(`${childRole} ("${child.name}") is not under ${parentRole} ("${parent.name}")`);
      }
    }

    // 3. Left/right swap — compare world X. A left-side bone must sit on the character's
    //    own left (+X in the export space). Bones within 1mm of centre are skipped as
    //    inconclusive rather than flagged.
    root_update(this.resolved);
    for (const role of ALL_ROLES) {
      if (!role.endsWith('L') && role !== 'leftEye') continue;
      const mirror = MIRRORED_ROLE[role];
      const a = this.resolved[role];
      const b = mirror ? this.resolved[mirror] : undefined;
      if (!a || !b || !mirror) continue;
      const ax = a.getWorldPosition(new THREE.Vector3()).x;
      const bx = b.getWorldPosition(new THREE.Vector3()).x;
      if (Math.abs(ax - bx) < 0.001) continue;
      if (ax < bx) {
        this.warnings.push(`${role}/${mirror} look swapped: "${a.name}" sits on the character's right`);
      }
    }

    // 4. Scale — a mirrored (negative) or non-uniform bone scale makes additive rotation
    //    offsets shear the mesh. Common in hand-mirrored rigs.
    for (const role of ALL_ROLES) {
      const bone = this.resolved[role];
      if (!bone) continue;
      const s = bone.scale;
      if (s.x <= 0 || s.y <= 0 || s.z <= 0) {
        this.warnings.push(`${role} ("${bone.name}") has a mirrored or zero scale (${fmt(s)})`);
      } else if (Math.abs(s.x - s.y) > 0.01 || Math.abs(s.y - s.z) > 0.01) {
        this.warnings.push(`${role} ("${bone.name}") has non-uniform scale (${fmt(s)}); rotation offsets may shear`);
      }
    }
  }
}

function fmt(v: THREE.Vector3): string {
  return `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
}

function isDescendantOf(child: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = child.parent;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
}

/** World matrices must be current before comparing world positions for the swap check. */
function root_update(resolved: Partial<Record<BoneRole, THREE.Bone>>) {
  for (const role of ALL_ROLES) {
    const bone = resolved[role];
    if (bone) { bone.updateWorldMatrix(true, false); }
  }
}
