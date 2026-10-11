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
import { FINGER_ROLES, type BoneRole } from './humanoid';
import type { MotionMask, RootMotionMode } from './motionConfig';
import type { RigProfile, RigJoint } from './rigProfile';

export interface RigSide {
  /** Role -> bone node name as it appears in track names (already loader-sanitised). */
  names: Partial<Record<BoneRole, string>>;
  /** Role -> rest local quaternion (x, y, z, w). */
  rest: Partial<Record<BoneRole, [number, number, number, number]>>;
  /** Hip height above the ground, for position scaling. */
  hipHeight?: number;
  /** Bind orientations in canonical GLB space, for different parent/rest axes. */
  parentWorld?: Partial<Record<BoneRole, [number, number, number, number]>>;
  worldRest?: Partial<Record<BoneRole, [number, number, number, number]>>;
  positions?: Partial<Record<BoneRole, [number, number, number]>>;
}

const UPPER: readonly BoneRole[] = [
  ...FINGER_ROLES,
  'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR',
  'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR',
];
const ARMS: readonly BoneRole[] = [
  ...FINGER_ROLES,
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
      const sp = source.parentWorld?.[role], tp = target.parentWorld?.[role];
      const parentChange = sp && tp ? new THREE.Quaternion().fromArray(tp).invert().multiply(new THREE.Quaternion().fromArray(sp)) : null;
      for (let i = 0; i < track.values.length; i += 4) {
        q.set(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
        if (parentChange) {
          // Pose delta in the source parent frame -> canonical -> target parent.
          q.multiply(new THREE.Quaternion().fromArray(sr).invert());
          q.premultiply(parentChange).multiply(parentChange.clone().invert()).multiply(new THREE.Quaternion().fromArray(tr)).normalize();
        } else q.premultiply(delta).normalize(); // legacy calibrated RigSide callers
        out.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${targetName}.quaternion`, Array.from(track.times), out));
      touched.add(role);
    } else if (prop === 'position' && role === 'hips' && opts.rootMotion === 'keep') {
      const sr = source.positions?.hips, tr = target.positions?.hips;
      const sp = source.parentWorld?.hips, tp = target.parentWorld?.hips;
      const basis = sp && tp ? new THREE.Quaternion().fromArray(tp).invert().multiply(new THREE.Quaternion().fromArray(sp)) : new THREE.Quaternion();
      const values: number[] = [];
      for (let i = 0; i < track.values.length; i += 3) {
        const p = new THREE.Vector3().fromArray(track.values, i);
        if (sr && tr) p.sub(new THREE.Vector3().fromArray(sr)).applyQuaternion(basis).multiplyScalar(scale).add(new THREE.Vector3().fromArray(tr));
        else p.multiplyScalar(scale);
        values.push(p.x, p.y, p.z);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${targetName}.position`, Array.from(track.times), values));
      touched.add(role);
    }
    // Scale tracks and every non-hips position track are intentionally dropped.
  }
  const untouched = (Object.keys(target.names) as BoneRole[]).filter((r) => !touched.has(r));
  return { clip: new THREE.AnimationClip(clip.name, clip.duration, tracks), missingOnTarget: [...missing], untouched };
}

/** Bake semantic world deltas, including animated intermediate deform/twist ancestors.
 * Rest-only local multiplication is insufficient when ARP and Rigify have different chains.
 * Reuses retargetClip's masks/position policy; result remains an ordinary AnimationClip.
 */
export function retargetProfileClip(clip: THREE.AnimationClip, source: RigProfile, target: RigProfile, opts: RetargetOptions = {}): RetargetResult {
  const basic = retargetClip(clip, source.side, target.side, opts);
  const rotations = clip.tracks.filter(t => t.name.endsWith('.quaternion'));
  if (!rotations.length) return basic;
  if (!Number.isFinite(clip.duration) || clip.duration <= 0 || clip.duration > 120) throw new Error('shared motion requires a baked clip of 0..120 seconds');
  const times = [...new Set([0, clip.duration, ...Array.from({ length: Math.ceil(clip.duration * 30) }, (_, i) => i / 30),
    ...rotations.flatMap(t => Array.from(t.times))])].sort((a, b) => a - b);
  if (times.length > 8192) throw new Error('shared motion exceeds offline baking budget');
  const sampled = new Map(rotations.map(t => [t.name.slice(0, -11), (t as THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }).createInterpolant()]));
  const quaternion = (values: number[]) => {
    const q = new THREE.Quaternion(); new THREE.Matrix4().fromArray(values).decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q;
  };
  const rigData = (joints: RigJoint[]) => new Map(joints.map(j => {
    const local = quaternion(j.local), world = quaternion(j.bind);
    return [j.name, { parent: j.parent, local, world, rootFrame: world.clone().multiply(local.clone().invert()) }];
  }));
  const sd = rigData(source.joints), td = rigData(target.joints);
  const allowed = rolesForMask(opts.mask ?? 'full'), excluded = new Set(opts.excludeRoles ?? []);
  const eligible = (Object.keys(source.side.names) as BoneRole[]).filter(r => (!allowed || allowed.has(r)) && !excluded.has(r));
  const semanticNames = new Set(Object.values(source.side.names));
  const hasAnimation = (name: string) => {
    let j = sd.get(name);
    if (sampled.has(name)) return true;
    name = j?.parent ?? '';
    while (name && !semanticNames.has(name)) {
      if (sampled.has(name)) return true;
      j = sd.get(name); name = j?.parent ?? '';
    }
    return false;
  };
  const roles = eligible.filter(r => hasAnimation(source.side.names[r]!));
  const output = new Map<BoneRole, number[]>(roles.filter(r => target.side.names[r]).map(r => [r, []]));
  const targetRole = new Map(Object.entries(target.side.names).map(([r, name]) => [name, r as BoneRole]));
  for (const time of times) {
    const sw = new Map<string, THREE.Quaternion>(), tw = new Map<string, THREE.Quaternion>();
    const sourceWorld = (name: string): THREE.Quaternion => {
      if (sw.has(name)) return sw.get(name)!;
      const j = sd.get(name)!;
      const local = sampled.has(name) ? new THREE.Quaternion().fromArray(sampled.get(name)!.evaluate(time)).normalize() : j.local;
      const parent = j.parent && sd.has(j.parent) ? sourceWorld(j.parent) : j.rootFrame;
      const result = parent.clone().multiply(local); sw.set(name, result); return result;
    };
    const targetWorld = (name: string): THREE.Quaternion => {
      if (tw.has(name)) return tw.get(name)!;
      const j = td.get(name)!;
      const parent = j.parent && td.has(j.parent) ? targetWorld(j.parent) : j.rootFrame;
      const role = targetRole.get(name), sourceName = role && source.side.names[role];
      const result = role && output.has(role) && sourceName
        ? sourceWorld(sourceName).clone().multiply(sd.get(sourceName)!.world.clone().invert()).multiply(j.world).normalize()
        : parent.clone().multiply(j.local);
      if (role && output.has(role)) {
        const local = parent.clone().invert().multiply(result).normalize(), values = output.get(role)!;
        // Preserve quaternion hemisphere for smooth interpolation through +/- equivalence.
        if (values.length && local.dot(new THREE.Quaternion().fromArray(values, values.length - 4)) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        values.push(local.x, local.y, local.z, local.w);
      }
      tw.set(name, result); return result;
    };
    for (const role of output.keys()) targetWorld(target.side.names[role]!);
  }
  const missing = roles.filter(r => !target.side.names[r]);
  return { clip: new THREE.AnimationClip(clip.name, clip.duration, [
    ...basic.clip.tracks.filter(t => !t.name.endsWith('.quaternion')),
    ...[...output].map(([r, values]) => new THREE.QuaternionKeyframeTrack(`${target.side.names[r]}.quaternion`, times, values)),
  ]), missingOnTarget: [...new Set([...basic.missingOnTarget, ...missing])], untouched: basic.untouched };
}
