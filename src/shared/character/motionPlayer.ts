import * as THREE from 'three';
import type { CharacterPerformer } from './performer';
import type { MotionDescriptor } from './motionConfig';

interface Active {
  descriptor: MotionDescriptor;
  action: THREE.AnimationAction;
  fadingOut: boolean;
  /** Local transforms at start, restored on finish so a finished motion does not leave bones posed. */
  rest: Map<THREE.Object3D, [THREE.Vector3, THREE.Quaternion, THREE.Vector3]>;
  bindings: { node: THREE.Object3D; property: 'position' | 'quaternion' | 'scale'; interpolant: THREE.Interpolant }[];
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
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private weight = 1;

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
  play(descriptor: MotionDescriptor, clip: THREE.AnimationClip, weight = 1): boolean {
    if (this.active && !this.active.fadingOut && descriptor.priority < this.active.descriptor.priority) return false;
    this.performer?.prepareFrame();
    this.stop(true);
    this.weight = Math.max(0, Math.min(1, weight));
    const rest: Active['rest'] = new Map();
    const bindings: Active['bindings'] = [];
    for (const track of clip.tracks) {
      const node = this.model.getObjectByName(track.name.slice(0, track.name.lastIndexOf('.')));
      if (node && !rest.has(node)) rest.set(node, [node.position.clone(), node.quaternion.clone(), node.scale.clone()]);
      const property = track.name.slice(track.name.lastIndexOf('.') + 1);
      if (node && (property === 'position' || property === 'quaternion' || property === 'scale')) {
        // AnimationMixer owns time/loop/fades. Sampling its track interpolants explicitly
        // avoids PropertyMixer's constant-output cache fighting the separate base mixer.
        const sampleTrack = track as THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant };
        bindings.push({ node, property, interpolant: sampleTrack.createInterpolant() });
      }
    }
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(descriptor.loop ? THREE.LoopRepeat : THREE.LoopOnce, descriptor.loop ? Infinity : 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.fadeIn(descriptor.fadeInMs / 1000).play();
    this.active = { descriptor, action, fadingOut: false, rest, bindings };
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
    this.finishTimer = setTimeout(() => { if (this.onFinished === done && this.active === a) done(); }, a.descriptor.fadeOutMs + 50);
  }

  private finish(): void {
    const a = this.active;
    this.active = null;
    this.onFinished = null;
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
    if (!a) return;
    this.performer?.prepareFrame();
    a.action.stop();
    if (!this.prepared) a.rest.forEach(([p, q, sc], node) => { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(sc); });
    this.mixer.uncacheClip(a.action.getClip());
    if (a.descriptor.headEye === 'clip') this.performer?.setYield({ head: false, eyes: false });
  }

  /** Undo the prior motion layer BEFORE the base mixer (and before constant-track caching). */
  prepareFrame(): void {
    this.active?.rest.forEach(([p, q, s], node) => { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(s); });
    this.prepared = true;
  }

  update(dt: number): void {
    if (!this.active) return;
    const before = this.active;
    // Standalone callers also work; runtime calls this before updating its base mixer.
    if (!this.prepared) this.prepareFrame();
    this.prepared = false;
    before.rest.forEach((value, node) => { value[0].copy(node.position); value[1].copy(node.quaternion); value[2].copy(node.scale); });
    this.mixer.update(dt);
    const a = this.active;
    // The mixer may write cached poses or finish synchronously. Restore the current
    // base and apply just one weighted motion layer, keeping breath additive afterwards.
    before.rest.forEach(([p, q, s], node) => { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(s); });
    if (a === before) {
      const weight = a.action.getEffectiveWeight() * this.weight;
      for (const b of a.bindings) {
        const value = b.interpolant.evaluate(a.action.time);
        if (b.property === 'quaternion') b.node.quaternion.normalize().slerp(new THREE.Quaternion().fromArray(value).normalize(), weight).normalize();
        else b.node[b.property].lerp(new THREE.Vector3().fromArray(value), weight);
      }
    }
    if (a?.fadingOut && a.action.getEffectiveWeight() <= 0.001) this.finish();
  }
  private prepared = false;

  dispose(): void {
    this.stop(true);
    this.mixer.stopAllAction();
  }
}
