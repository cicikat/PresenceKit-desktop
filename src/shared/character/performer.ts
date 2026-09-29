/**
 * CA-02 shared performance core. Owns every per-frame write to the character's
 * morph targets and semantic bones, so Room and Pet keep only their own stage
 * (camera, lights, scene, window lifecycle) and input adaptation.
 *
 * Frame order is fixed here and matches the package contract: expression weights →
 * gaze → head gesture → posture → procedural breath/micro-noise. Physics spring
 * chains run last and stay with the caller, since only Room has them today.
 *
 * Every dimension has exactly one owner per frame, decided by `resolveRoutes`.
 */
import * as THREE from 'three';
import { MorphController } from '../../windows/room/morphController';
import { MOOD_MORPHS, EXPR_KEYS } from '../../windows/room/morphExpressions';
import { BoneResolver, microNoise } from '../../windows/room/boneResolver';
import { MOOD_TABLE } from '../state/store';
import type { Mood } from '../state/store';
import { backendMoodToFrontend } from '../state/mood-mapping';
import type { ActiveDirective } from '../../windows/room/avatarDirective';
import type { BoneMap } from '../room/roomSettings';
import { probeRigCapability, GAZE_MORPH_KEYS } from './rigCapability';
import {
  resolveRoutes, faceUsesMorphs, gazeUsesBones, gazeUsesMorphs,
  type PerformanceRoutes, type ResolvedRoutes, type RigCapability,
} from './performanceRoutes';

export interface PerformerOptions {
  boneMap?: BoneMap;
  routes?: PerformanceRoutes;
  /** Whether an idle clip drives this model — affects body route resolution. */
  hasIdleClip?: boolean;
}

export interface FrameContext {
  /** Seconds since scene start (`clock.elapsedTime`). */
  t: number;
  /** `performance.now()` — used for directive timing and blink scheduling. */
  now: number;
  mood: Mood;
  directive: ActiveDirective | null;
  /** Fallback speaking flag when the directive does not specify one. */
  talking: boolean;
  /** Bones the animation mixer already wrote this frame; those get additive offsets. */
  animatedBoneNames: ReadonlySet<string>;
  /** Present only on stages that support posture lean; null skips the posture layer. */
  charGroup: THREE.Group | null;
  /** True when physics spring chains drive the hair, disabling the morph-key fallback. */
  hairDrivenByPhysics: boolean;
}

interface BlinkState { phase: 'idle' | 'blink'; nextAt: number; startedAt: number }

function scheduleNextBlink(state: BlinkState, mood: Mood): void {
  const entry = MOOD_TABLE[mood];
  const interval = (entry?.blinkInterval ?? 4500) as number;
  const jitter = (entry?.blinkJitter ?? 0.4) as number;
  const variation = (Math.random() * 2 - 1) * jitter * interval;
  state.nextAt = performance.now() + Math.max(500, interval + variation);
  state.phase = 'idle';
}

/** Blink is never routable: it must always be able to close, whatever drives expressions. */
function getBlinkPulse(state: BlinkState, now: number, mood: Mood): number {
  if (state.phase === 'idle' && now >= state.nextAt) {
    state.phase = 'blink';
    state.startedAt = now;
  }
  if (state.phase === 'blink') {
    const HALF = 60;
    const elapsed = now - state.startedAt;
    if (elapsed < HALF) return elapsed / HALF;
    if (elapsed < HALF * 2) return 1 - (elapsed - HALF) / HALF;
    scheduleNextBlink(state, mood);
    return 0;
  }
  return 0;
}

function resolveExpression(morph: MorphController, mood: Mood): Record<string, number> {
  const entry = MOOD_MORPHS[mood] ?? { primary: {}, fallback: {} };
  const tryFilter = (src: Record<string, number>) =>
    Object.fromEntries(Object.entries(src).filter(([k]) => morph.has(k)));
  const fromPrimary = tryFilter(entry.primary);
  if (Object.keys(fromPrimary).length > 0 || Object.keys(entry.primary).length === 0) return fromPrimary;
  return tryFilter(entry.fallback);
}

/** Room's historical fallback: any bone whose name contains `head` when no role is mapped. */
function findHeadBone(root: THREE.Object3D): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((obj) => {
    if (!found && obj instanceof THREE.Bone && obj.name.toLowerCase().includes('head')) found = obj;
  });
  return found;
}

/** Eye bone local rotation limits, radians. Outward/inward differ: eyes cross less than they diverge. */
const EYE_LIMIT = { outward: 0.35, inward: 0.22, up: 0.20, down: 0.26 };

export class CharacterPerformer {
  readonly morph: MorphController;
  readonly bones: BoneResolver;
  readonly capability: RigCapability;
  readonly routes: ResolvedRoutes;

  private readonly headBone: THREE.Bone | null;
  private readonly headRest = new THREE.Euler();
  private readonly leftEye: THREE.Bone | null;
  private readonly rightEye: THREE.Bone | null;
  private readonly leftEyeRest = new THREE.Euler();
  private readonly rightEyeRest = new THREE.Euler();
  private readonly blink: BlinkState = { phase: 'idle', nextAt: performance.now() + 2000, startedAt: 0 };
  private chestBasePosY = 0;
  private chestBaseScale = 1;
  private chestBaseRotX = 0;
  private shoulderLBaseY = 0;
  private shoulderRBaseY = 0;
  private talkEndsAt = 0;
  /** Smoothed gaze target in normalized -1..1 screen-ish space, shared by both gaze drivers. */
  private gazeX = 0;
  private gazeY = 0;

  constructor(model: THREE.Object3D, options: PerformerOptions = {}) {
    this.morph = new MorphController(model);
    this.bones = new BoneResolver(model, options.boneMap);
    const resolved = this.bones.resolved;

    this.headBone = resolved.head ?? findHeadBone(model);
    if (this.headBone) this.headRest.copy(this.headBone.rotation);
    this.leftEye = resolved.leftEye ?? null;
    this.rightEye = resolved.rightEye ?? null;
    if (this.leftEye) this.leftEyeRest.copy(this.leftEye.rotation);
    if (this.rightEye) this.rightEyeRest.copy(this.rightEye.rotation);

    this.capability = probeRigCapability({
      morphKeys: this.morph.names(),
      expressionKeys: EXPR_KEYS,
      boneNames: this.bones.names(),
      resolved: {
        head: this.headBone !== null,
        leftEye: this.leftEye !== null,
        rightEye: this.rightEye !== null,
      },
      hasIdleClip: options.hasIdleClip === true,
    });
    this.routes = resolveRoutes(options.routes, this.capability);

    const breathBone = resolved.chest ?? resolved.spine;
    if (breathBone) {
      this.chestBasePosY = breathBone.position.y;
      this.chestBaseScale = breathBone.scale.x;
      this.chestBaseRotX = breathBone.rotation.x;
    }
    if (resolved.shoulderL) this.shoulderLBaseY = resolved.shoulderL.position.y;
    if (resolved.shoulderR) this.shoulderRBaseY = resolved.shoulderR.position.y;
  }

  /** Bones the performer owns exclusively; their clip tracks must be removed. */
  get ownedBones(): (THREE.Bone | null)[] {
    return [this.headBone, gazeUsesBones(this.routes.gaze) ? this.leftEye : null,
      gazeUsesBones(this.routes.gaze) ? this.rightEye : null];
  }

  onNewSpeech(text: string): void {
    // Keep mouth-open duration on the same order as the pet bubble's own TTL
    // (PetWindow.tsx: max(6000, len * 80)); a shorter cap reads as "it doesn't talk".
    this.talkEndsAt = performance.now() + Math.max(6000, text.length * 80);
  }

  /** Runs every performance layer in contract order. Callers add stage effects after this. */
  update(ctx: FrameContext): void {
    this.updateHair(ctx);
    this.updateFace(ctx);
    this.updateMouth(ctx);
    this.updateGaze(ctx);
    const energyMul = 0.5 + (ctx.directive?.energy ?? 0.5);
    this.updateHeadGesture(ctx, energyMul);
    const posture = this.updatePosture(ctx, energyMul);
    this.updateProcedural(ctx, posture);
  }

  private updateHair(ctx: FrameContext): void {
    if (ctx.hairDrivenByPhysics) return;
    const { morph, t } = { morph: this.morph, t: ctx.t };
    if (morph.has('hairSwayLeft') || morph.has('hairSwayRight')) {
      const sway = Math.sin(t * 0.6);
      morph.set('hairSwayLeft', Math.max(0, sway));
      morph.set('hairSwayRight', Math.max(0, -sway));
    } else if (morph.has('hairSway')) {
      morph.set('hairSway', 0.5 + 0.5 * Math.sin(t * 0.6));
    }
  }

  private updateFace(ctx: FrameContext): void {
    const { morph } = this;
    let targets: Record<string, number> = {};
    if (faceUsesMorphs(this.routes.face)) {
      if (ctx.directive?.expression) {
        const base = resolveExpression(morph, backendMoodToFrontend(ctx.directive.expression));
        const scale = ctx.directive.intensity;
        targets = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v * scale]));
      } else {
        targets = resolveExpression(morph, ctx.mood);
      }
      for (const key of EXPR_KEYS) morph.lerp(key, targets[key] ?? 0, 0.08);
    }
    // Blink stays outside the face route so an expression can never hold the eyes open.
    const moodBlinkBaseline = targets['blink'] ?? 0;
    morph.set('blink', Math.max(moodBlinkBaseline, getBlinkPulse(this.blink, ctx.now, ctx.mood)));
  }

  private updateMouth(ctx: FrameContext): void {
    // `speaking` from a directive wins when present; otherwise the stage's own flag, then
    // the speech timer. Mouth is not routable for the same reason blink is not.
    const talking = ctx.directive?.speaking ?? (ctx.talking || ctx.now < this.talkEndsAt);
    const target = talking
      ? (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(ctx.t * 11))) * (0.8 + Math.random() * 0.2)
      : 0;
    this.morph.lerp('mouthOpen', target, 0.5);
  }

  /**
   * Resolves the directive into one smoothed target, then hands it to whichever driver
   * the route picked. Both drivers read the same target, so switching route changes how
   * the gaze is rendered, never where the character looks.
   * +x is the character's own left, +y is up, both normalized to -1..1.
   */
  private updateGaze(ctx: FrameContext): void {
    const gaze = ctx.directive?.gaze;
    let targetX = 0;
    let targetY = 0;
    let speed = 0.04;
    if (gaze) {
      speed = 0.05;
      if (gaze.mode === 'away') { targetX = -0.5; targetY = -0.2; }
      else if (gaze.mode === 'point') { targetX = -gaze.x; targetY = gaze.y; }
      // 'user' looks straight at the observing camera, i.e. the neutral 0,0 target.
      // 'idle' keeps the neutral target too and lets micro-drift carry it.
    }
    this.gazeX += (targetX - this.gazeX) * speed;
    this.gazeY += (targetY - this.gazeY) * speed;

    if (gazeUsesMorphs(this.routes.gaze)) this.writeGazeMorphs();
    if (gazeUsesBones(this.routes.gaze)) this.writeGazeBones();
    if (this.routes.gaze === 'off') for (const key of GAZE_MORPH_KEYS) this.morph.set(key, 0);
    // 'headOnly' contributes through the head gesture layer's rest offset below.
  }

  private writeGazeMorphs(): void {
    const { morph } = this;
    // Morph keys are one-sided 0..1 pairs, so a signed target splits across the pair.
    morph.set('eyeLookLeft', Math.max(0, this.gazeX) * 0.7);
    morph.set('eyeLookRight', Math.max(0, -this.gazeX) * 0.7);
    morph.set('eyeLookUp', Math.max(0, this.gazeY) * 0.5);
    morph.set('eyeLookDown', Math.max(0, -this.gazeY) * 0.5);
  }

  private writeGazeBones(): void {
    // Each eye is limited separately: turning toward the nose (inward) has less range
    // than turning away, which is what keeps extreme targets from crossing the eyes.
    const yaw = (isLeftEye: boolean) => {
      // +gazeX is the character's left: the left eye turns outward, the right eye inward.
      const outward = isLeftEye ? this.gazeX > 0 : this.gazeX < 0;
      const limit = outward ? EYE_LIMIT.outward : EYE_LIMIT.inward;
      return this.gazeX * limit;
    };
    const pitch = this.gazeY * (this.gazeY > 0 ? EYE_LIMIT.up : EYE_LIMIT.down);
    if (this.leftEye) {
      this.leftEye.rotation.set(this.leftEyeRest.x - pitch, this.leftEyeRest.y + yaw(true), this.leftEyeRest.z);
    }
    if (this.rightEye) {
      this.rightEye.rotation.set(this.rightEyeRest.x - pitch, this.rightEyeRest.y + yaw(false), this.rightEyeRest.z);
    }
  }

  private updateHeadGesture(ctx: FrameContext, energyMul: number): void {
    const head = this.headBone;
    if (!head) return;
    const rest = this.headRest;
    const directive = ctx.directive;
    if (directive?.gesture) {
      const elapsedMs = ctx.now - directive.receivedAt;
      const rampIn = Math.min(1, elapsedMs / 200);
      const osc = Math.sin(elapsedMs * 0.015) * rampIn * energyMul;
      switch (directive.gesture) {
        case 'nod':   head.rotation.set(rest.x + osc * 0.15, rest.y, rest.z); return;
        case 'shake': head.rotation.set(rest.x, rest.y + osc * 0.15, rest.z); return;
        case 'tilt':
        case 'tilt_r': head.rotation.set(rest.x, rest.y, rest.z + rampIn * 0.18); return;
        case 'tilt_l': head.rotation.set(rest.x, rest.y, rest.z - rampIn * 0.18); return;
        case 'dip':   head.rotation.set(rest.x + rampIn * 0.22, rest.y, rest.z); return;
        default: head.rotation.copy(rest); return;
      }
    }
    // No gesture: ease back to rest plus micro-drift. The noise is folded into the target
    // rather than added to the current value, so its amplitude cannot accumulate per frame.
    // `headOnly` gaze rides along here, since the head is the only thing left to aim.
    const gazeYaw = this.routes.gaze === 'headOnly' ? this.gazeX * 0.25 : 0;
    const gazePitch = this.routes.gaze === 'headOnly' ? this.gazeY * 0.18 : 0;
    const driftX = rest.x + microNoise(ctx.t, 11) * 0.015 - gazePitch;
    const driftY = rest.y + microNoise(ctx.t, 23) * 0.020 + gazeYaw;
    const driftZ = rest.z + microNoise(ctx.t, 37) * 0.010;
    head.rotation.x += (driftX - head.rotation.x) * 0.1;
    head.rotation.y += (driftY - head.rotation.y) * 0.1;
    head.rotation.z += (driftZ - head.rotation.z) * 0.1;
  }

  /**
   * Lean lives on the character group; chest/shoulder offsets are returned so the
   * procedural layer below can fold them into its single write per bone.
   */
  private updatePosture(ctx: FrameContext, energyMul: number): { chestRotX: number; shoulderY: number } {
    const group = ctx.charGroup;
    if (!group) return { chestRotX: 0, shoulderY: 0 };
    const posture = ctx.directive?.posture;
    if (!posture) {
      group.position.z += (0 - group.position.z) * 0.1;
      return { chestRotX: 0, shoulderY: 0 };
    }
    const ramp = Math.min(1, (ctx.now - ctx.directive!.receivedAt) / 300);
    const ease = (target: number) => { group.position.z += (target - group.position.z) * 0.15; };
    switch (posture) {
      case 'lean_in':    ease(-ramp * 0.1);  return { chestRotX: ramp * 0.06 * energyMul, shoulderY: 0 };
      case 'lean_back':  ease(ramp * 0.06);  return { chestRotX: -ramp * 0.06 * energyMul, shoulderY: 0 };
      case 'shrink':     ease(ramp * 0.02);  return { chestRotX: ramp * 0.03 * energyMul, shoulderY: -ramp * 0.02 * energyMul };
      case 'straighten': ease(0);            return { chestRotX: -ramp * 0.025 * energyMul, shoulderY: ramp * 0.006 * energyMul };
      default:           ease(0);            return { chestRotX: 0, shoulderY: 0 };
    }
  }

  /**
   * Breath and shoulder micro-noise. Bones the mixer already wrote this frame get `+=`
   * (the base value is this frame's clip pose, so offsets cannot accumulate); bones with
   * no clip track get an absolute write from the load-time base, since nothing else
   * touches them. Posture offsets fold into the same single write per property.
   */
  private updateProcedural(ctx: FrameContext, posture: { chestRotX: number; shoulderY: number }): void {
    if (this.routes.body === 'off' || this.routes.body === 'clip') return;
    const resolved = this.bones.resolved;
    const animated = ctx.animatedBoneNames;
    const moodEntry = MOOD_TABLE[ctx.mood];
    const energy = ctx.directive?.energy ?? 0.5;
    const period = ((moodEntry?.breathePeriod as number | undefined) ?? 4200) / 1000;
    const depth = ((moodEntry?.breatheDepth as number | undefined) ?? 0.022) * (0.7 + 0.6 * energy);
    const breath = Math.sin((ctx.t / period) * Math.PI * 2);

    const breathBone = resolved.chest ?? resolved.spine;
    if (breathBone) {
      const posOffset = breath * depth * 0.06;
      const scaleOffset = breath * depth * 0.5;
      if (animated.has(breathBone.name)) {
        breathBone.position.y += posOffset;
        breathBone.scale.x += scaleOffset;
        breathBone.scale.y += scaleOffset;
        breathBone.scale.z += scaleOffset;
        breathBone.rotation.x += posture.chestRotX;
      } else {
        breathBone.position.y = this.chestBasePosY + posOffset;
        breathBone.scale.setScalar(this.chestBaseScale + scaleOffset);
        breathBone.rotation.x = this.chestBaseRotX + posture.chestRotX;
      }
    }
    const shoulder = (bone: THREE.Bone | undefined, seed: number, base: number) => {
      if (!bone) return;
      const offset = microNoise(ctx.t, seed) * 0.004 + posture.shoulderY;
      if (animated.has(bone.name)) bone.position.y += offset;
      else bone.position.y = base + offset;
    };
    shoulder(resolved.shoulderL, 5, this.shoulderLBaseY);
    shoulder(resolved.shoulderR, 9, this.shoulderRBaseY);
  }
}
