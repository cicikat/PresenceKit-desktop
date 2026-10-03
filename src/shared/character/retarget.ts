/**
 * CA-05 retargeting core. Converts a clip authored on a source skeleton to a target skeleton by
 * semantic role, using each side's rest pose, then applies the descriptor's mask and root-motion rule.
 *
 * Rotation rule (same parent frames, only rest orientation differs):
 *   target_local = targetRest * inverse(sourceRest) * source_local
 * which makes "source stays at its rest" map to "target stays at its rest". Position tracks are
 * dropped except the hips, scaled by the hip-height ratio, and only when rootMotion is `keep`.
 */
import * as THREE from 'three';
import type { BoneRole } from './humanoid';
import type { MotionMask, RootMotionMode } from './motionConfig';

export interface RigSide {
  /** Role -> bone node name as it appears in track names (already loader-sanitised). */
  names: Partial<Record<BoneRole, string>>;
  /** Role -> rest local quaternion (x, y, z, w). */
  rest: Partial<Record<BoneRole, [number, number, number, number]>>;
  /** Hip height above the ground, for position scaling. */
  hipHeight?: number;
}

const UPPER: readonly BoneRole[] = [
  'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR',
  'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR',
];
const ARMS: readonly BoneRole[] = [
  'shoulderL', 'shoulderR', 'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR',
];

export function rolesForMask(mask: MotionMask): ReadonlySet<BoneRole> | null {
  if (mask === 'full') return null;
  return new Set(mask === 'upper' ? UPPER : ARMS);
}

export interface RetargetOptions {
  mask?: MotionMask;
  rootMotion?: RootMotionMode;
  /** Roles the performer keeps (head/eyes) are removed from the result. */
  excludeRoles?: readonly BoneRole[];
}

export interface RetargetResult {
  clip: THREE.AnimationClip;
  /** Roles animated by the source but unmapped on the target; a motion needing them is degraded. */
  missingOnTarget: BoneRole[];
  /** Roles the target has but the clip did not animate. */
  untouched: BoneRole[];
}

export function retargetClip(
  clip: THREE.AnimationClip, source: RigSide, target: RigSide, opts: RetargetOptions = {},
): RetargetResult {
  const roleBySourceName = new Map<string, BoneRole>();
  for (const [role, name] of Object.entries(source.names) as [BoneRole, string][]) roleBySourceName.set(name, role);
  const allowed = rolesForMask(opts.mask ?? 'full');
  const excluded = new Set<BoneRole>(opts.excludeRoles ?? []);
  const scale = source.hipHeight && target.hipHeight ? target.hipHeight / source.hipHeight : 1;
  const tracks: THREE.KeyframeTrack[] = [];
  const missing = new Set<BoneRole>();
  const touched = new Set<BoneRole>();
  const q = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  const targetRest = new THREE.Quaternion();

  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const node = track.name.slice(0, dot);
    const prop = track.name.slice(dot + 1);
    const role = roleBySourceName.get(node);
    // Not a mapped humanoid bone (props, helpers, morph tracks): not retargeted here.
    if (!role) continue;
    if (allowed && !allowed.has(role)) continue;
    if (excluded.has(role)) continue;
    const targetName = target.names[role];
    if (!targetName) { missing.add(role); continue; }
    if (prop === 'quaternion') {
      const sr = source.rest[role];
      const tr = target.rest[role];
      if (!sr || !tr) { missing.add(role); continue; }
      delta.set(sr[0], sr[1], sr[2], sr[3]).invert().premultiply(targetRest.set(tr[0], tr[1], tr[2], tr[3]));
      const out: number[] = [];
      for (let i = 0; i < track.values.length; i += 4) {
        q.set(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
        q.premultiply(delta).normalize();
        out.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${targetName}.quaternion`, Array.from(track.times), out));
      touched.add(role);
    } else if (prop === 'position' && role === 'hips' && opts.rootMotion === 'keep') {
      tracks.push(new THREE.VectorKeyframeTrack(
        `${targetName}.position`, Array.from(track.times), Array.from(track.values, (v) => v * scale),
      ));
      touched.add(role);
    }
    // Scale tracks and every non-hips position track are intentionally dropped.
  }
  const untouched = (Object.keys(target.names) as BoneRole[]).filter((r) => !touched.has(r));
  return { clip: new THREE.AnimationClip(clip.name, clip.duration, tracks), missingOnTarget: [...missing], untouched };
}
