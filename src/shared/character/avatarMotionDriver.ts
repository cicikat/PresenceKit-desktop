import type { ActiveDirective } from '../../windows/room/avatarDirective';

export const AVATAR_MOTION_IDS = ['idle', 'head_tilt', 'thinking', 'arms_crossed', 'talking', 'nod', 'head_shake', 'relaxed_lean', 'camera_reach', 'camera_closeup'] as const;
export type AvatarMotionId = typeof AVATAR_MOTION_IDS[number];
export interface MotionPort { ready(id: string): boolean; play(id: string, weight?: number): boolean; stop(): void; playingId(): string | null }
export interface MotionRequest { id: AvatarMotionId; ok: boolean; reason?: string }

/** A small selector feeding the existing player, not another animation state machine. */
export class AvatarMotionDriver {
  private nextIdle = Infinity;
  private nextCue = 0;
  private lastCue = '';
  private previousActivity = 'idle';
  private thinkingMotion: string | null = null;
  private releaseAt = Infinity;
  lastRequest: MotionRequest | null = null;
  constructor(private port: MotionPort, private random = Math.random) {}
  request(id: AvatarMotionId, weight = 1): MotionRequest {
    if (!(AVATAR_MOTION_IDS as readonly string[]).includes(id)) return this.lastRequest = { id, ok: false, reason: 'unknown semantic motion' };
    const reason = id === 'camera_closeup' ? 'camera choreography is not installed'
      : !this.port.ready(id) ? 'motion resource unavailable or incompatible'
      : !this.port.play(id, weight) ? 'motion priority rejected' : undefined;
    if (!reason) this.releaseAt = Infinity;
    return this.lastRequest = { id, ok: !reason, ...(reason ? { reason } : {}) };
  }
  update(now: number, activity: string, directive: ActiveDirective | null): void {
    if (now >= this.releaseAt) { this.port.stop(); this.releaseAt = Infinity; }
    if (activity !== 'speaking' && this.previousActivity === 'speaking' && this.port.playingId() === 'talking') this.port.stop();
    if (activity === 'speaking' && this.previousActivity !== 'speaking' && this.port.ready('talking')) this.request('talking');
    if (this.nextIdle === Infinity) this.nextIdle = now + 20000;
    const thinking = activity === 'thinking';
    if (!thinking && this.previousActivity === 'thinking' && this.port.playingId() === this.thinkingMotion) this.port.stop();
    const cue = directive ? `${directive.origin}:${directive.receivedAt}:${directive.gesture}:${directive.expression}` : '';
    const onset = thinking && this.previousActivity !== 'thinking';
    this.previousActivity = activity;
    if (now >= this.nextCue && (onset || cue && cue !== this.lastCue)) {
      const expression = directive?.expression;
      const tilt = ['tilt', 'tilt_l', 'tilt_r'].includes(directive?.gesture ?? '');
      const id: AvatarMotionId | null = tilt ? 'head_tilt' : directive?.gesture === 'nod' ? 'nod' : directive?.gesture === 'shake' ? 'head_shake' : thinking || expression === 'thinking' ? 'thinking' : expression === 'angry' ? 'arms_crossed' : null;
      if (id) {
        const weight = 0.25 + 0.5 * (directive?.intensity ?? 0.6);
        let result = this.request(id, weight);
        if (!result.ok && id === 'thinking' && this.port.ready('head_tilt')) result = this.request('head_tilt', weight);
        if (result.ok) { this.nextCue = now + 12000; this.releaseAt = now + 6000; if (thinking) this.thinkingMotion = result.id; }
      }
    }
    this.lastCue = cue;
    const current = this.port.playingId();
    if (activity === 'idle' && now >= this.nextIdle && (!current || current === 'idle')) {
      this.nextIdle = now + 20000 + this.random() * 20000;
      const choices: AvatarMotionId[] = directive?.expression === 'angry' ? ['arms_crossed', 'head_tilt'] : ['head_tilt', 'arms_crossed'];
      const available = choices.filter(id => this.port.ready(id));
      if (available.length && this.request(available[Math.floor(this.random() * available.length)], 1).ok) this.releaseAt = now + 6000;
    }
    if (!this.port.playingId()) {
      if (activity === 'speaking' && this.port.ready('talking')) this.port.play('talking');
      else if (this.port.ready('idle')) this.port.play('idle');
    }
  }
}
