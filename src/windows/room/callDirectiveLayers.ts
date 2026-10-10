import type { PerformSpec } from '../../shared/api/types';
import type { ActiveDirective, AvatarDirective } from './avatarDirective';
const EXPRESSIONS = new Set(['neutral','gentle','thinking','happy','sad','surprised','angry','sleepy','yandere']);
const clamp = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1,v)) : fallback;
export class CallDirectiveLayers {
  private baseline: ActiveDirective | null = null;
  private sentence: ActiveDirective | null = null;
  setBaseline(d: AvatarDirective, now: number): void { this.baseline = { ...d, origin: 'ws', receivedAt: now }; }
  setSentence(spec: PerformSpec | undefined, now: number): void {
    if (!spec) { this.sentence = null; return; }
    const gaze = spec.gaze === 'user' ? { mode: 'user' as const, x: 0,y:0 } : spec.gaze === 'away' ? { mode: 'away' as const,x:0,y:0 } : spec.gaze === 'down' ? { mode: 'point' as const,x:0,y:-0.7 } : spec.gaze === 'wander' ? { mode: 'idle' as const,x:0,y:0 } : null;
    this.sentence = { expression: typeof spec.expression === 'string' && EXPRESSIONS.has(spec.expression) ? spec.expression : null, intensity: clamp(spec.intensity,0.6), gesture: ['nod','shake','tilt_l','tilt_r','dip'].includes(spec.head ?? '') ? spec.head! : null, posture: ['lean_in','lean_back','shrink','straighten'].includes(spec.posture ?? '') ? spec.posture! : null, gaze, energy: clamp(spec.energy,0.5), speaking: null, ttl_ms: 30000, origin: 'local', receivedAt: now };
  }
  clearSentence(): void { this.sentence = null; }
  reset(): void { this.baseline = this.sentence = null; }
  get(now: number): ActiveDirective | null {
    if (this.baseline && now - this.baseline.receivedAt > this.baseline.ttl_ms) this.baseline = null;
    if (this.sentence && now - this.sentence.receivedAt > this.sentence.ttl_ms) this.sentence = null;
    const a = this.sentence, b = this.baseline;
    if (!a) return b;
    return { ...a, expression: a.expression ?? b?.expression ?? null, intensity: a.expression ? a.intensity : b?.intensity ?? a.intensity, gesture: a.gesture ?? b?.gesture ?? null, posture: a.posture ?? b?.posture ?? null, gaze: a.gaze ?? b?.gaze ?? null, speaking: b?.speaking ?? null };
  }
}
export const callDirectiveLayers = new CallDirectiveLayers();
export const getCallDirective = (now: number): ActiveDirective | null => callDirectiveLayers.get(now);
export const setCallPerform = (spec?: PerformSpec): void => callDirectiveLayers.setSentence(spec, performance.now());
export const clearCallPerform = (): void => callDirectiveLayers.clearSentence();
