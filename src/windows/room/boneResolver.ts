import * as THREE from 'three';
import type { BoneRole, BoneMap } from '../../shared/room/roomSettings';

// Smooth deterministic 1D pseudo-noise (sum of sines), returns approx -1..1
export function microNoise(t: number, seed: number): number {
  return (
    Math.sin(t * 0.7  + seed * 1.3) * 0.5 +
    Math.sin(t * 1.9  + seed * 2.7) * 0.3 +
    Math.sin(t * 3.1  + seed * 5.1) * 0.2
  );
}

// Default bone name candidates per role (Rigify DEF- prefix + common naming, with
// Auto-Rig Pro deform-bone names appended as further fallback — ARP export uses
// lowercase `.x`/`.l`/`.r` suffixes instead of Rigify's `DEF-`/`.L`/`.R`).
// Only used when boneMap does not specify the role explicitly.
const DEFAULT_CANDIDATES: Record<BoneRole, string[]> = {
  head:      ['DEF-spine.006', 'DEF-spine.005', 'DEF-head', 'head', 'Head', 'head.x'],
  chest:     ['DEF-spine.003', 'DEF-spine.002', 'chest', 'Chest', 'spine.003', 'spine_02.x', 'spine_03.x'],
  spine:     ['DEF-spine.001', 'DEF-spine', 'spine', 'Spine', 'spine_01.x'],
  shoulderL: ['DEF-shoulder.L', 'shoulder.L', 'DEF-clavicle.L', 'LeftShoulder', 'shoulder.l'],
  shoulderR: ['DEF-shoulder.R', 'shoulder.R', 'DEF-clavicle.R', 'RightShoulder', 'shoulder.r'],
  leftEye:   ['DEF-eye.L', 'eye.L', 'LeftEye', 'eye.l', 'c_eye.l'],
  rightEye:  ['DEF-eye.R', 'eye.R', 'RightEye', 'eye.r', 'c_eye.r'],
};

export class BoneResolver {
  private byName = new Map<string, THREE.Bone>();
  resolved: Partial<Record<BoneRole, THREE.Bone>> = {};

  constructor(root: THREE.Object3D, map: BoneMap = {}) {
    root.traverse(o => { if (o instanceof THREE.Bone) this.byName.set(o.name, o); });
    (Object.keys(DEFAULT_CANDIDATES) as BoneRole[]).forEach(role => {
      const explicit = map[role];
      if (explicit && this.byName.has(explicit)) {
        this.resolved[role] = this.byName.get(explicit);
        return;
      }
      for (const cand of DEFAULT_CANDIDATES[role]) {
        if (this.byName.has(cand)) { this.resolved[role] = this.byName.get(cand); break; }
      }
    });
    if (import.meta.env.DEV) {
      const roles = Object.keys(DEFAULT_CANDIDATES) as BoneRole[];
      const summary = roles.map(role => `${role}→${this.resolved[role]?.name ?? '(none)'}`).join(', ');
      console.log('[room] bone roles:', summary);
    }
  }

  names(): string[] { return [...this.byName.keys()]; }
}
