import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BoneResolver } from '../../windows/room/boneResolver';
import { ALL_ROLES, type BoneRole } from './humanoid';
import type { CharacterPerformer } from './performer';
import type { MotionDescriptor, MotionsConfig } from './motionConfig';
import { MotionPlayer } from './motionPlayer';
import { retargetClip, type RigSide } from './retarget';

/** Read a rig side (role names, rest rotations, hip height) from any scene by resolving roles on it. */
export function rigSideFromRoot(root: THREE.Object3D, resolved?: Partial<Record<BoneRole, THREE.Bone>>): RigSide {
  root.updateWorldMatrix(true, true);
  const bones = resolved ?? new BoneResolver(root).resolved;
  const side: RigSide = { names: {}, rest: {} };
  for (const role of ALL_ROLES) {
    const bone = bones[role];
    if (!bone) continue;
    side.names[role] = bone.name;
    side.rest[role] = [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w];
  }
  const hips = bones.hips;
  if (hips) side.hipHeight = Math.abs(hips.getWorldPosition(new THREE.Vector3()).y - root.getWorldPosition(new THREE.Vector3()).y) || undefined;
  return side;
}

export interface MotionStatus {
  id: string;
  ready: boolean;
  /** Why a motion is unavailable or degraded; shown in diagnostics. */
  reason?: string;
  missingRoles: BoneRole[];
}

export class MotionLibrary {
  private readonly clips = new Map<string, { descriptor: MotionDescriptor; clip: THREE.AnimationClip }>();
  readonly status: MotionStatus[] = [];
  readonly player: MotionPlayer;
  private disposed = false;

  constructor(
    private readonly model: THREE.Object3D,
    private readonly performer: CharacterPerformer,
    private readonly ownAnimations: THREE.AnimationClip[],
  ) {
    this.player = new MotionPlayer(model, performer);
  }

  /** Load and retarget every described motion. Failures are recorded per motion, never thrown. */
  async load(config: MotionsConfig, fetchMotionUrl: (file: string) => Promise<string | null>): Promise<void> {
    const target = rigSideFromRoot(this.model, this.performer.bones.resolved);
    const files = new Map<string, Promise<{ clips: THREE.AnimationClip[]; side: RigSide } | null>>();
    const loadFile = (file: string) => {
      if (!files.has(file)) {
        files.set(file, (async () => {
          const url = await fetchMotionUrl(file);
          if (!url) return null;
          const gltf = await new GLTFLoader().loadAsync(url);
          return { clips: gltf.animations, side: rigSideFromRoot(gltf.scene) };
        })().catch(() => null));
      }
      return files.get(file)!;
    };
    for (const d of config.motions) {
      let clip: THREE.AnimationClip | undefined;
      let source: RigSide | null = null;
      if (d.file) {
        const loaded = await loadFile(d.file);
        if (!loaded) { this.status.push({ id: d.id, ready: false, reason: 'motion file missing or unreadable', missingRoles: [] }); continue; }
        clip = loaded.clips.find((c) => c.name === d.clip);
        source = loaded.side;
      } else {
        clip = this.ownAnimations.find((c) => c.name === d.clip);
        source = target; // own clips share the character's skeleton
      }
      if (!clip || !source) { this.status.push({ id: d.id, ready: false, reason: `clip "${d.clip}" not found`, missingRoles: [] }); continue; }
      const keepHeadEye = d.headEye === 'performer';
      const result = retargetClip(clip, source, target, {
        mask: d.mask, rootMotion: d.rootMotion,
        excludeRoles: keepHeadEye ? ['head', 'leftEye', 'rightEye'] : [],
      });
      if (result.clip.tracks.length === 0) {
        this.status.push({ id: d.id, ready: false, reason: 'no tracks map onto this skeleton', missingRoles: result.missingOnTarget });
        continue;
      }
      this.clips.set(d.id, { descriptor: d, clip: result.clip });
      this.status.push({
        id: d.id, ready: true, missingRoles: result.missingOnTarget,
        reason: result.missingOnTarget.length ? 'partial: some animated bones are missing on this model' : undefined,
      });
    }
  }

  ids(): string[] { return [...this.clips.keys()]; }

  play(id: string): boolean {
    if (this.disposed) return false;
    const entry = this.clips.get(id);
    return entry ? this.player.play(entry.descriptor, entry.clip) : false;
  }
  stop(): void { this.player.stop(); }
  update(dt: number): void { this.player.update(dt); }
  dispose(): void { this.disposed = true; this.player.dispose(); this.clips.clear(); }
}

let active: MotionLibrary | null = null;
const listeners = new Set<() => void>();
/** The window's current library, so a future motion picker/perform hook can trigger playback without prop drilling. */
export function setActiveMotionLibrary(lib: MotionLibrary | null): void {
  if (active && active !== lib) active.dispose();
  active = lib;
  listeners.forEach((fn) => fn());
}
export const getActiveMotionLibrary = (): MotionLibrary | null => active;
export function subscribeMotionLibrary(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
