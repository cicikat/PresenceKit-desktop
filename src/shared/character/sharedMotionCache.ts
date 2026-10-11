import * as THREE from 'three';
import { FINGER_ROLES, type BoneRole } from './humanoid';
import { retargetProfileClip, rolesForMask } from './retarget';
import { rigCompatibility, type RigProfile } from './rigProfile';
import type { MotionDescriptor } from './motionConfig';

export interface AdaptedMotion {
  clip: THREE.AnimationClip | null; kind: 'direct' | 'retarget' | 'incompatible';
  missingRoles: BoneRole[]; reasons: string[]; cacheHit: boolean;
}
const cache = new Map<string, AdaptedMotion>();
const LIMIT = 48;
/** Content identity, not filename/UUID: resource changes invalidate successful adaptations. */
function clipContent(clip: THREE.AnimationClip): string {
  return JSON.stringify([clip.name, clip.duration, clip.tracks.map(t => [t.name, t.getInterpolation(), Array.from(t.times), Array.from(t.values)])]);
}
export function adaptSharedMotion(clip: THREE.AnimationClip, source: RigProfile, target: RigProfile, d: MotionDescriptor): AdaptedMotion {
  const allowed = rolesForMask(d.mask);
  const byName = new Map(Object.entries(source.side.names).map(([r, n]) => [n, r as BoneRole]));
  const excluded = new Set(d.headEye === 'performer' ? ['head', 'leftEye', 'rightEye'] : []);
  const roles = [...new Set(clip.tracks.map(t => byName.get(t.name.slice(0, t.name.lastIndexOf('.'))))
    .filter((r): r is BoneRole => !!r && (!allowed || allowed.has(r)) && !excluded.has(r)))];
  const compatibility = rigCompatibility(source, target, roles);
  const key = JSON.stringify([source.signature, target.signature, d.mask, d.rootMotion, d.headEye, clipContent(clip)]);
  const previous = cache.get(key);
  if (previous && compatibility.kind !== 'incompatible') return { ...previous, cacheHit: true };
  let result: AdaptedMotion;
  if (compatibility.kind === 'incompatible') result = { clip: null, kind: 'incompatible', missingRoles: [], reasons: compatibility.reasons, cacheHit: false };
  else if (compatibility.kind === 'direct') {
    // Preserve intermediate deform joints for identical rigs. Drop morph/prop/physics tracks.
    const names = new Set<string>();
    for (const [r, name] of Object.entries(source.side.names)) {
      if (excluded.has(r) || (allowed && !allowed.has(r as BoneRole))) continue;
      let j = source.joints.find(x => x.name === name);
      while (j) {
        const ancestorRole = byName.get(j.name);
        if (ancestorRole && (excluded.has(ancestorRole) || allowed && !allowed.has(ancestorRole))) break;
        names.add(j.name); j = source.joints.find(x => x.name === j!.parent);
      }
    }
    for (const r of excluded) { const name = source.side.names[r as BoneRole]; if (name) names.delete(name); }
    const tracks = clip.tracks.filter(t => {
      const dot = t.name.lastIndexOf('.'), name = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
      return names.has(name) && ['quaternion', 'position', 'scale'].includes(prop)
        && !(name === source.side.names.hips && prop === 'position' && d.rootMotion === 'inPlace');
    });
    result = { clip: tracks.length ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : null,
      kind: 'direct', missingRoles: [], reasons: tracks.length ? [] : ['no playable skeletal tracks'], cacheHit: false };
  } else {
    let out;
    try { out = retargetProfileClip(clip, source, target, { mask: d.mask, rootMotion: d.rootMotion, excludeRoles: [...excluded] as BoneRole[] }); }
    catch (error) { return { clip: null, kind: 'incompatible', missingRoles: [], reasons: [String(error)], cacheHit: false }; }
    const requiredMissing = out.missingOnTarget.filter(r => !(FINGER_ROLES as readonly string[]).includes(r) && !['leftEye', 'rightEye', 'toesL', 'toesR'].includes(r));
    result = { clip: !requiredMissing.length && out.clip.tracks.length ? out.clip : null,
      kind: requiredMissing.length ? 'incompatible' : 'retarget', missingRoles: out.missingOnTarget,
      reasons: requiredMissing.length ? requiredMissing.map(r => `required joint missing: ${r}`) : out.clip.tracks.length ? [] : ['no playable skeletal tracks'], cacheHit: false };
  }
  if (result.clip) { if (cache.size >= LIMIT) cache.delete(cache.keys().next().value!); cache.set(key, result); }
  return result;
}
export function clearSharedMotionCache(): void { cache.clear(); }
export const sharedMotionCacheSize = () => cache.size;
