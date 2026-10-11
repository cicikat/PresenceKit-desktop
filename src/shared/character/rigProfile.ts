import * as THREE from 'three';
import { ALL_ROLES, FINGER_ROLES, SEMANTIC_PARENT, ROLE_CANDIDATES, type BoneRole } from './humanoid';
import { BoneResolver, canonicalBoneName } from '../../windows/room/boneResolver';
import type { BoneMap } from '../room/roomSettings';
import type { RigSide } from './retarget';

export const RIG_PROFILE_VERSION = 1;
const LIMIT = 32;
type Q = [number, number, number, number];
export interface RigJoint {
  name: string; parent: string | null; bind: number[]; local: number[];
}
/** Data only: never retain a mesh, bone, skeleton, mixer or skin resource. */
export interface RigProfile {
  version: number; id: string; signature: string; side: RigSide;
  joints: RigJoint[]; errors: string[]; missingOptional: BoneRole[];
  convention: 'arp-like' | 'rigify-like' | 'mixamo-like' | 'unknown';
  exportMode: 'unknown'; cacheHit: boolean;
}
const profiles = new Map<string, RigProfile>();
const round = (n: number) => Math.round(n * 1e6) / 1e6;
function idFor(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `rig-v${RIG_PROFILE_VERSION}-${(h >>> 0).toString(16)}`;
}
function quaternion(m: THREE.Matrix4): Q {
  const q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  // q and -q denote the same bind orientation.
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  return q.toArray() as Q;
}

/** Capture before any animation. Inverse bind matrices remain authoritative after stage scaling. */
export function createRigProfile(root: THREE.Object3D, map: BoneMap = {}): RigProfile {
  root.updateWorldMatrix(true, true);
  const all = new Map<string, THREE.Bone>();
  const canonicalNames = new Set<string>();
  const errors: string[] = [];
  const world = new Map<THREE.Bone, THREE.Matrix4>();
  root.traverse(o => {
    if (!(o instanceof THREE.Bone)) return;
    if (all.has(o.name)) errors.push(`ambiguous bone: ${o.name}`);
    if (canonicalNames.has(canonicalBoneName(o.name))) errors.push(`ambiguous canonical bone: ${o.name}`);
    canonicalNames.add(canonicalBoneName(o.name));
    all.set(o.name, o);
  });
  root.traverse(o => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    o.skeleton.bones.forEach((b, i) => {
      const inverse = o.skeleton.boneInverses[i];
      if (!inverse || !inverse.elements.every(Number.isFinite) || Math.abs(inverse.determinant()) < 1e-12) { errors.push(`invalid inverse bind: ${b.name}`); return; }
      const bind = inverse.clone().invert(), previous = world.get(b);
      if (previous && previous.elements.some((v, k) => Math.abs(v - bind.elements[k]) > 1e-5)) errors.push(`conflicting inverse binds: ${b.name}`);
      world.set(b, bind);
    });
  });
  // Motion-only GLBs have no skin: their untouched exported reference node pose is used.
  const rootInverse = root.matrixWorld.clone().invert();
  for (const b of all.values()) if (!world.has(b)) world.set(b, rootInverse.clone().multiply(b.matrixWorld));
  const joints = [...all.values()].map(b => {
    const parent = b.parent instanceof THREE.Bone ? b.parent : null;
    const bind = world.get(b)!;
    // For root joints, use exported local TRS (not normalized scene transform).
    const local = parent ? world.get(parent)!.clone().invert().multiply(bind) : b.matrix.clone();
    return { name: b.name, parent: parent?.name ?? null, bind: bind.toArray().map(round), local: local.toArray().map(round) };
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  // First lookup is structural; no manual mapping repeated when only Skin changes.
  const candidates = new Set([...Object.values(ROLE_CANDIDATES).flat(), ...Object.values(map)].filter((n): n is string => !!n).map(canonicalBoneName));
  const structuralNames = new Set<string>();
  for (const joint of joints) if (candidates.has(canonicalBoneName(joint.name))) {
    let j: RigJoint | undefined = joint;
    while (j) { structuralNames.add(j.name); j = joints.find(x => x.name === j!.parent); }
  }
  const structure = JSON.stringify([RIG_PROFILE_VERSION, joints.filter(j => structuralNames.has(j.name)), Object.entries(map).sort()]);
  const cached = profiles.get(structure);
  if (cached && !errors.length) return { ...cached, joints, cacheHit: true };
  const resolver = new BoneResolver(root, map);
  errors.push(...resolver.warnings.filter(w => w.startsWith('boneMap.')));
  const seen = new Set<THREE.Bone>();
  const side: RigSide = { names: {}, rest: {}, parentWorld: {}, worldRest: {}, positions: {} };
  for (const role of ALL_ROLES) {
    const bone = resolver.resolved[role];
    if (!bone) continue;
    if (seen.has(bone)) errors.push(`duplicate semantic mapping: ${role}`);
    seen.add(bone);
    let ancestor = SEMANTIC_PARENT[role];
    while (ancestor && !resolver.resolved[ancestor]) ancestor = SEMANTIC_PARENT[ancestor];
    if (ancestor) {
      let p: THREE.Object3D | null = bone.parent;
      while (p && p !== resolver.resolved[ancestor]) p = p.parent;
      if (!p) errors.push(`broken semantic chain: ${role}`);
    }
    const joint = joints.find(j => j.name === bone.name)!;
    const local = new THREE.Matrix4().fromArray(joint.local), scale = new THREE.Vector3(), position = new THREE.Vector3();
    local.decompose(position, new THREE.Quaternion(), scale);
    if (scale.x <= 0 || scale.y <= 0 || scale.z <= 0 || Math.max(scale.x, scale.y, scale.z) - Math.min(scale.x, scale.y, scale.z) > 0.01) errors.push(`unsupported bind scale: ${role}`);
    side.names[role] = bone.name;
    side.rest[role] = quaternion(local);
    side.positions![role] = position.toArray();
    side.worldRest![role] = quaternion(world.get(bone)!);
    side.parentWorld![role] = quaternion(world.get(bone)!.clone().multiply(local.clone().invert()));
  }
  const hips = resolver.resolved.hips;
  if (hips) side.hipHeight = Math.abs(new THREE.Vector3().setFromMatrixPosition(world.get(hips)!).y) || undefined;
  // Hair/helper additions do not change the humanoid identity. Ancestors ARE included:
  // changing an intermediate twist/rest frame must invalidate adaptation.
  const relevant = new Set<string>();
  for (const name of Object.values(side.names)) {
    let j = joints.find(x => x.name === name);
    while (j) { relevant.add(j.name); j = joints.find(x => x.name === j!.parent); }
  }
  for (const j of joints) if (relevant.has(j.name)) {
    const scale = new THREE.Vector3();
    new THREE.Matrix4().fromArray(j.local).decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    if (!j.local.every(Number.isFinite) || scale.x <= 0 || scale.y <= 0 || scale.z <= 0
      || Math.max(scale.x, scale.y, scale.z) - Math.min(scale.x, scale.y, scale.z) > 0.01) errors.push(`unsupported ancestor bind: ${j.name}`);
  }
  const signature = JSON.stringify([RIG_PROFILE_VERSION, joints.filter(j => relevant.has(j.name)), side.names]);
  const names = joints.map(j => j.name).join(' ');
  const convention = /arm_stretch|c_thumb|rootx/i.test(names) ? 'arp-like' : /DEF-/i.test(names) ? 'rigify-like' : /mixamorig/i.test(names) ? 'mixamo-like' : 'unknown';
  const profile: RigProfile = { version: RIG_PROFILE_VERSION, id: idFor(signature), signature, side, joints,
    errors: [...new Set(errors)], missingOptional: FINGER_ROLES.filter(r => !side.names[r]), convention, exportMode: 'unknown', cacheHit: false };
  if (!profile.errors.length && side.names.hips && side.names.spine && side.names.head) {
    if (profiles.size >= LIMIT) profiles.delete(profiles.keys().next().value!);
    profiles.set(structure, profile);
  }
  return profile;
}

export interface RigCompatibility { kind: 'direct' | 'retarget' | 'incompatible'; reasons: string[] }
/** Assess a particular motion: optional unanimated joints never disable the whole avatar. */
export function rigCompatibility(source: RigProfile, target: RigProfile, roles: readonly BoneRole[]): RigCompatibility {
  const reasons = [...source.errors, ...target.errors];
  for (const r of roles) {
    if (!source.side.names[r] || !target.side.names[r]) {
      if (!(FINGER_ROLES as readonly string[]).includes(r) && !['leftEye', 'rightEye', 'toesL', 'toesR'].includes(r)) reasons.push(`required joint missing: ${r}`);
      continue;
    }
    const parent = SEMANTIC_PARENT[r];
    if (parent && source.side.names[parent] && !target.side.names[parent]) reasons.push(`required ancestor missing: ${parent}`);
  }
  if (reasons.length) return { kind: 'incompatible', reasons: [...new Set(reasons)] };
  // Export/recompose roundoff is permitted, a changed bind pose is not. Compare the
  // full humanoid ancestor closure, not a name count or a hash alone.
  const closure = (p: RigProfile) => {
    const names = new Set<string>();
    for (const name of Object.values(p.side.names)) {
      let j = p.joints.find(x => x.name === name);
      while (j) { names.add(j.name); j = p.joints.find(x => x.name === j!.parent); }
    }
    return p.joints.filter(j => names.has(j.name));
  };
  const a = closure(source), b = closure(target);
  const same = JSON.stringify(source.side.names) === JSON.stringify(target.side.names) && a.length === b.length && a.every((j, i) => {
    const t = b[i];
    return j.name === t.name && j.parent === t.parent && j.local.every((v, k) => Math.abs(v - t.local[k]) <= 1e-4)
      && j.bind.every((v, k) => Math.abs(v - t.bind[k]) <= 1e-4);
  });
  return { kind: same ? 'direct' : 'retarget', reasons: [] };
}
export function clearRigProfileCache(): void { profiles.clear(); }
export const rigProfileCacheSize = () => profiles.size;
