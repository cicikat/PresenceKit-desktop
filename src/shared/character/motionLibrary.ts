import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type BoneRole } from './humanoid';
import type { CharacterPerformer } from './performer';
import type { MotionDescriptor, MotionsConfig } from './motionConfig';
import { MotionPlayer } from './motionPlayer';
import { type RigSide } from './retarget';
import { createRigProfile, type RigProfile } from './rigProfile';
import { adaptSharedMotion } from './sharedMotionCache';
import { AvatarMotionDriver, AVATAR_MOTION_IDS, type AvatarMotionId } from './avatarMotionDriver';
import type { ActiveDirective } from '../../windows/room/avatarDirective';

/** Read a rig side (role names, rest rotations, hip height) from any scene by resolving roles on it. */
export function rigSideFromRoot(root: THREE.Object3D, resolved?: Partial<Record<BoneRole, THREE.Bone>>): RigSide {
  return createRigProfile(root, Object.fromEntries(Object.entries(resolved ?? {}).map(([r, b]) => [r, b.name]))).side;
}

interface MotionSource { clips: THREE.AnimationClip[]; profile: RigProfile }
const sources = new Map<string, Promise<MotionSource | null>>();
/** Same bytes share one parse. Rejected loads are evicted; no model reference survives parsing. */
async function loadSource(url: string): Promise<MotionSource | null> {
  const cached = sources.get(url);
  if (cached) return cached;
  const pending = new GLTFLoader().loadAsync(url).then(gltf => {
    const profile = createRigProfile(gltf.scene);
    gltf.scene.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) value.dispose();
        mat.dispose();
      }
    });
    return { clips: gltf.animations, profile };
  }).catch(() => { sources.delete(url); return null; });
  if (sources.size >= 12) sources.delete(sources.keys().next().value!);
  sources.set(url, pending);
  return pending;
}

export interface MotionStatus {
  id: string;
  ready: boolean;
  /** Why a motion is unavailable or degraded; shown in diagnostics. */
  reason?: string;
  missingRoles: BoneRole[];
  compatibility?: 'direct' | 'retarget' | 'incompatible';
  cacheHit?: boolean;
}

export class MotionLibrary {
  private readonly clips = new Map<string, { descriptor: MotionDescriptor; clip: THREE.AnimationClip }>();
  readonly status: MotionStatus[] = [];
  readonly player: MotionPlayer;
  readonly driver: AvatarMotionDriver;
  private disposed = false;

  constructor(
    private readonly model: THREE.Object3D,
    private readonly performer: CharacterPerformer,
    private readonly ownAnimations: THREE.AnimationClip[],
  ) {
    this.player = new MotionPlayer(model, performer);
    this.driver = new AvatarMotionDriver({ ready: id => this.clips.has(id), play: (id, weight) => this.play(id, weight),
      stop: () => this.stop(), playingId: () => this.player.playingId });
  }

  /** Load and retarget every described motion. Failures are recorded per motion, never thrown. */
  async load(config: MotionsConfig, fetchMotionUrl: (file: string) => Promise<string | null>): Promise<void> {
    const target = this.performer.rigProfile;
    const files = new Map<string, Promise<MotionSource | null>>();
    const loadFile = (file: string) => {
      if (!files.has(file)) {
        files.set(file, (async () => {
          const url = await fetchMotionUrl(file);
          if (!url) return null;
          return loadSource(url);
        })().catch(() => null));
      }
      return files.get(file)!;
    };
    for (const d of config.motions) {
      if (this.disposed) return;
      let clip: THREE.AnimationClip | undefined;
      let source: RigProfile | null = null;
      if (d.file) {
        const loaded = await loadFile(d.file);
        if (this.disposed) return;
        if (!loaded) { this.status.push({ id: d.id, ready: false, reason: 'motion file missing or unreadable', missingRoles: [] }); continue; }
        clip = loaded.clips.find((c) => c.name === d.clip);
        source = loaded.profile;
      } else {
        clip = this.ownAnimations.find((c) => c.name === d.clip);
        source = target; // own clips share the character's skeleton
      }
      if (this.disposed) return;
      if (!clip || !source) { this.status.push({ id: d.id, ready: false, reason: `clip "${d.clip}" not found`, missingRoles: [] }); continue; }
      const result = adaptSharedMotion(clip, source, target, d);
      if (!result.clip) {
        this.status.push({ id: d.id, ready: false, reason: result.reasons.join('; '), missingRoles: result.missingRoles, compatibility: result.kind });
        continue;
      }
      this.clips.set(d.id, { descriptor: d, clip: result.clip });
      this.status.push({
        id: d.id, ready: true, missingRoles: result.missingRoles, compatibility: result.kind, cacheHit: result.cacheHit,
        reason: result.missingRoles.length ? 'partial: optional joints unavailable' : undefined,
      });
    }
    for (const id of AVATAR_MOTION_IDS) if (!this.status.some(s => s.id === id)) {
      this.status.push({ id, ready: false, missingRoles: [], reason: id === 'camera_closeup' ? 'camera choreography is not installed' : 'motion resource not configured' });
    }
  }

  ids(): string[] { return [...this.clips.keys()]; }

  play(id: string, weight = 1): boolean {
    if (this.disposed || !this.performer.allowsExternalMotion) return false;
    const entry = this.clips.get(id);
    return entry ? this.player.play(entry.descriptor, entry.clip, weight) : false;
  }
  prepareFrame(): void { this.player.prepareFrame(); }
  drivePresentation(now: number, activity: string, directive: ActiveDirective | null): void {
    if (!this.disposed) this.driver.update(now, activity, directive);
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
/** Explicit local interaction entry. Special camera actions are never idle choices. */
export function requestAvatarMotion(id: AvatarMotionId) {
  return active?.driver.request(id) ?? { id, ok: false, reason: 'no active avatar motion library' };
}
if (import.meta.hot) import.meta.hot.dispose(() => { setActiveMotionLibrary(null); sources.clear(); });
