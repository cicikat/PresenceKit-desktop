import * as THREE from 'three';
import type { CharacterPerformer } from './performer';
import type { MotionDescriptor } from './motionConfig';

interface Active {
  descriptor: MotionDescriptor;
  action: THREE.AnimationAction;
  fadingOut: boolean;
  /** Local transforms at start, restored on finish so a finished motion does not leave bones posed. */
  rest: Map<THREE.Object3D, [THREE.Vector3, THREE.Quaternion, THREE.Vector3]>;
}

/**
 * Plays retargeted clips on top of the idle layer with its own mixer, so the base clip and the
 * performer's procedural layers keep running underneath. Head/eye ownership follows the
 * descriptor: `performer` keeps them (their tracks were already filtered by the caller), `clip`
 * makes the performer yield for the duration and take them back, eased from rest, afterwards.
 */
export class MotionPlayer {
  private readonly mixer: THREE.AnimationMixer;
  private active: Active | null = null;
  private onFinished: (() => void) | null = null;

  constructor(private readonly model: THREE.Object3D, private readonly performer: CharacterPerformer | null) {
    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.addEventListener('finished', (e) => {
      if (this.active && (e as unknown as { action: THREE.AnimationAction }).action === this.active.action) this.beginFadeOut();
    });
  }

  get playingId(): string | null { return this.active?.descriptor.id ?? null; }

  /**
   * Start a motion. A running motion is only replaced by one of equal or higher priority;
   * returns false when the request lost, so callers can report it instead of silently dropping.
   */
  play(descriptor: MotionDescriptor, clip: THREE.AnimationClip): boolean {
    if (this.active && !this.active.fadingOut && descriptor.priority < this.active.descriptor.priority) return false;
    this.stop(true);
    const rest: Active['rest'] = new Map();
    for (const track of clip.tracks) {
      const node = this.model.getObjectByName(track.name.slice(0, track.name.lastIndexOf('.')));
      if (node && !rest.has(node)) rest.set(node, [node.position.clone(), node.quaternion.clone(), node.scale.clone()]);
    }
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(descriptor.loop ? THREE.LoopRepeat : THREE.LoopOnce, descriptor.loop ? Infinity : 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.fadeIn(descriptor.fadeInMs / 1000).play();
    this.active = { descriptor, action, fadingOut: false, rest };
    if (descriptor.headEye === 'clip') this.performer?.setYield({ head: true, eyes: true });
    return true;
  }

  /** Fade out and release ownership; `immediate` skips the fade (used when replacing or disposing). */
  stop(immediate = false): void {
    const a = this.active;
    if (!a) return;
    if (immediate || a.descriptor.fadeOutMs <= 0) { this.finish(); return; }
    this.beginFadeOut();
  }

  private beginFadeOut(): void {
    const a = this.active;
    if (!a || a.fadingOut) return;
    a.fadingOut = true;
    a.action.fadeOut(a.descriptor.fadeOutMs / 1000);
    const done = () => this.finish();
    this.onFinished = done;
    setTimeout(() => { if (this.onFinished === done && this.active === a) done(); }, a.descriptor.fadeOutMs + 50);
  }

  private finish(): void {
    const a = this.active;
    this.active = null;
    this.onFinished = null;
    if (!a) return;
    a.action.stop();
    a.rest.forEach(([p, q, sc], node) => { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(sc); });
    this.mixer.uncacheClip(a.action.getClip());
    if (a.descriptor.headEye === 'clip') this.performer?.setYield({ head: false, eyes: false });
  }

  update(dt: number): void {
    if (!this.active) return;
    this.mixer.update(dt);
    const a = this.active;
    if (a?.fadingOut && a.action.getEffectiveWeight() <= 0.001) this.finish();
  }

  dispose(): void {
    this.stop(true);
    this.mixer.stopAllAction();
  }
}
