import { CHARACTER_BEHAVIOR as P } from './behaviorParameters';

export type MotionActivity = 'idle' | 'listening' | 'thinking' | 'speaking';
export interface MicroPose { yaw: number; pitch: number; roll: number; bodyRoll: number; bodyYaw: number; shoulderL: number; shoulderR: number }
const zero = (): MicroPose => ({ yaw: 0, pitch: 0, roll: 0, bodyRoll: 0, bodyYaw: 0, shoulderL: 0, shoulderR: 0 });
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
interface Pulse { start: number; attack: number; hold: number; release: number; pose: MicroPose }
function weight(p: Pulse | null, t: number): number {
  if (!p || t < p.start) return 0;
  const elapsed = t - p.start;
  if (elapsed < p.attack) return smooth(elapsed / p.attack);
  if (elapsed < p.attack + p.hold) return 1;
  return 1 - smooth((elapsed - p.attack - p.hold) / p.release);
}

/** Independent aperiodic head/body pulses with rests. Only scalar targets evolve;
 * the caller composes them with the current animation pose, never last frame's bones. */
export class MicroMotion {
  private head: Pulse | null = null;
  private body: Pulse | null = null;
  private nextHead: number | null = null;
  private nextBody: number | null = null;
  private previousActivity: MotionActivity = 'idle';
  private previousTime: number | null = null;
  private readonly pose = zero();
  constructor(private readonly random: () => number = Math.random) {}
  private range(pair: readonly [number, number]): number { return pair[0] + (pair[1] - pair[0]) * this.random(); }
  private signed(amplitude: number): number { return (this.random() * 2 - 1) * amplitude; }
  private pulse(t: number, pose: MicroPose, thinking = false): Pulse {
    return { start: t, attack: thinking ? P.thinking.attack : this.range(P.envelope.attack),
      hold: thinking ? P.thinking.hold : this.range(P.envelope.hold), release: thinking ? P.thinking.release : this.range(P.envelope.release), pose };
  }
  sample(t: number, activity: MotionActivity): Readonly<MicroPose> {
    const dt = this.previousTime === null ? 1 / 60 : Math.max(0, Math.min(0.1, t - this.previousTime));
    this.previousTime = t;
    if (this.nextHead === null) this.nextHead = t + this.range([1.5, 4]);
    if (this.nextBody === null) this.nextBody = t + this.range([3, 7]);
    if (activity !== this.previousActivity) {
      if (activity === 'thinking') {
        this.head = this.pulse(t, { ...zero(), pitch: P.thinking.pitch, yaw: this.signed(P.thinking.yaw), roll: this.signed(P.head.roll) }, true);
        this.nextHead = t + P.thinking.duration + this.range(P.head.idleInterval);
      } else if (activity === 'speaking') {
        this.nextHead = t; this.nextBody = Math.min(this.nextBody, t + 0.3);
      } else if (this.previousActivity === 'speaking' || this.previousActivity === 'thinking') {
        // Cancel activity accents as targets; scalar damping makes the return continuous.
        this.head = this.body = null;
        this.nextHead = t + this.range(P.head.idleInterval);
        this.nextBody = t + this.range(P.body.idleInterval);
      }
      this.previousActivity = activity;
    }
    if (t >= this.nextHead && activity !== 'thinking') {
      const speaking = activity === 'speaking';
      const nod = this.random() < (speaking ? 0.7 : 0.3);
      this.head = this.pulse(t, { ...zero(), yaw: nod ? this.signed(P.head.yaw * 0.25) : this.signed(P.head.yaw),
        pitch: nod ? P.head.pitch * (0.5 + this.random() * 0.5) : this.signed(P.head.pitch * 0.4), roll: this.signed(P.head.roll) });
      const duration = this.head.attack + this.head.hold + this.head.release;
      this.nextHead = t + duration + this.range(speaking ? P.head.speechInterval : P.head.idleInterval);
    }
    if (t >= this.nextBody) {
      const side = this.signed(1);
      this.body = this.pulse(t, { ...zero(), bodyRoll: side * P.body.roll,
        bodyYaw: this.signed(P.body.yaw), shoulderL: side * P.body.shoulder, shoulderR: -side * P.body.shoulder * 0.65 });
      this.nextBody = t + this.body.attack + this.body.hold + this.body.release
        + this.range(activity === 'speaking' ? P.body.speechInterval : P.body.idleInterval);
    }
    const hw = weight(this.head, t), bw = weight(this.body, t);
    for (const key of Object.keys(this.pose) as (keyof MicroPose)[]) {
      const headChannel = key === 'yaw' || key === 'pitch' || key === 'roll';
      const target = headChannel ? (this.head?.pose[key] ?? 0) * hw : (this.body?.pose[key] ?? 0) * bw;
      const damping = headChannel ? P.head.inertia : P.body.damping;
      this.pose[key] += (target - this.pose[key]) * (1 - Math.exp(-dt / damping));
    }
    return this.pose;
  }
}
