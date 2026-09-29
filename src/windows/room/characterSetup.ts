import * as THREE from 'three';
import { CharacterPerformer } from '../../shared/character/performer';
import type { CharacterCfg } from '../../shared/room/roomSettings';
import { collectSpringChains, DEFAULT_SPRING_PARAMS, getSpringChainRootNames } from './springBones';
import type { SpringChain } from './springBones';
import { selectIdleClip } from './clipPlayer';

export interface CharacterSetup {
  performer: CharacterPerformer;
  springChains: SpringChain[];
  mixer: THREE.AnimationMixer | null;
  animatedBoneNames: Set<string>;
}

/**
 * Builds Room's per-model performance state in the one order the dependencies allow:
 * spring chains first (the performer must not claim a physics bone), then clip
 * selection (the body route depends on whether a clip exists), then the performer
 * (which resolves routes and therefore which bones it owns), and only then the mixer
 * (whose excluded tracks depend on those owned bones).
 */
export function setupCharacter(
  model: THREE.Object3D,
  animations: THREE.AnimationClip[],
  charCfg: CharacterCfg,
  idleClipName: string | undefined,
  startClip: (
    model: THREE.Object3D, clip: THREE.AnimationClip,
    ownedBones: (THREE.Bone | null)[], springChains: SpringChain[],
  ) => { mixer: THREE.AnimationMixer; animatedBoneNames: Set<string> },
): CharacterSetup {
  const springChains = collectSpringChains(
    model,
    charCfg.physicsBones?.overrides,
    { ...DEFAULT_SPRING_PARAMS, ...charCfg.physicsBones?.default },
  );
  const clip = animations.length > 0 ? selectIdleClip(animations, idleClipName) : null;
  const performer = new CharacterPerformer(model, {
    boneMap: charCfg.boneMap,
    routes: charCfg.routes,
    hasIdleClip: clip !== null,
  });
  // `body: 'off'` and an explicit `procedural` route both mean the clip must not play.
  const clipAllowed = performer.routes.body === 'clip' || performer.routes.body === 'clip+procedural';
  const started = clip && clipAllowed
    ? startClip(model, clip, performer.ownedBones, springChains)
    : null;

  if (import.meta.env.DEV) {
    console.log('[room] morph keys:', performer.morph.names(), '| bones:', performer.bones.names());
    console.log('[room] phys chains:', getSpringChainRootNames(springChains));
    console.log('[room] clips:', animations.map(a => a.name), '| routes:', performer.routes);
    for (const note of performer.routes.notes) console.warn('[room] route note:', note);
    console.log('[room] standing pose verified:', performer.standing.verified);
    for (const note of performer.standing.notes) console.warn('[room] standing note:', note);
    for (const w of performer.bones.warnings) console.warn('[room] rig warning:', w);
  }

  return {
    performer,
    springChains,
    mixer: started?.mixer ?? null,
    animatedBoneNames: started?.animatedBoneNames ?? new Set(),
  };
}
