import type { NarrativeSegment } from '../api/types';
import { CHARACTER_BEHAVIOR as P } from './behaviorParameters';
import type { MotionActivity } from './microMotion';

export const BEHAVIOR_EVENT = 'character://behavior';
export type BehaviorNotice =
  | { kind: 'request-start'; id: string; charId: string; at: number }
  | { kind: 'request-end'; id: string; charId: string; at: number; msgId?: string; text?: string; emotion?: string }
  | { kind: 'audio-start' | 'audio-end'; id: string; charId: string; at: number; msgId?: string; scene: string };
export interface BehaviorFrame { activity: MotionActivity; expression: string }
const EXPRESSIONS = new Set(['neutral', 'gentle', 'thinking', 'happy', 'sad', 'surprised', 'angry', 'sleepy', 'yandere']);
const MOOD_EXPRESSION: Record<string, string> = { '平静': 'neutral', '开心': 'happy', '低落': 'sad', '病娇': 'yandere', '分心': 'thinking', '生气': 'angry', '惊讶': 'surprised' };
export function trustedExpression(value: unknown): string | null {
  return typeof value === 'string' && EXPRESSIONS.has(value) ? value : null;
}
interface Reply { order: number; expires: number; textUntil: number; streaming: boolean; visible: boolean; canonical: boolean; audioDone: boolean; emotion?: string }

/** Transient presentation arbitration, not a copy of StateEngine's mood. All times
 * are epoch ms across Webviews. Each completion only releases its own lease. */
export class CharacterBehaviorState {
  private serial = 0;
  private requests = new Map<string, { expires: number; order: number }>();
  private replies = new Map<string, Reply>();
  private audio = new Map<string, { expires: number; msgId?: string }>();
  private audioEnded = new Map<string, number>();
  private emotion: { value: string; expires: number; order: number } | null = null;
  private lastMood: string | null = null;
  private snapshotThinkingSince: number | null = null;
  reset(): void {
    this.requests.clear(); this.replies.clear(); this.audio.clear(); this.audioEnded.clear();
    this.emotion = null; this.lastMood = null; this.snapshotThinkingSince = null; this.serial = 0;
  }
  private trim<T>(map: Map<string, T>): void {
    while (map.size > P.feedback.maxEntries) map.delete(map.keys().next().value!);
  }
  private reply(id: string, now: number, order?: number): Reply {
    let reply = this.replies.get(id);
    if (!reply) {
      reply = { order: order ?? ++this.serial, expires: now + P.feedback.emotionTtlMs,
        textUntil: 0, streaming: false, visible: false, canonical: false, audioDone: false };
      this.replies.set(id, reply); this.trim(this.replies);
    }
    return reply;
  }
  private setEmotion(value: unknown, now: number, order: number): void {
    const expression = trustedExpression(value);
    if (!expression || (this.emotion && order < this.emotion.order)) return;
    this.emotion = { value: expression, expires: now + P.feedback.emotionTtlMs, order };
  }
  notice(event: BehaviorNotice, now = event.at): void {
    if (event.at > now + 5000 || now - event.at > P.feedback.requestTtlMs) return;
    if (event.kind === 'request-start') {
      if (!this.requests.has(event.id)) this.requests.set(event.id, { expires: event.at + P.feedback.requestTtlMs, order: ++this.serial });
      this.trim(this.requests);
    } else if (event.kind === 'request-end') {
      const request = this.requests.get(event.id);
      if (!request) return; // expired/old generation/end-before-start cannot revive work
      this.requests.delete(event.id);
      if (event.text?.trim()) this.canonical(event.msgId ?? `http:${event.id}`, event.text, event.at, request.order);
      this.setEmotion(event.emotion, event.at, request.order);
    } else if (event.scene !== 'dream') {
      if (event.kind === 'audio-start') {
        if (this.audioEnded.has(event.id)) return;
        this.audio.set(event.id, { expires: event.at + P.feedback.audioTtlMs, msgId: event.msgId }); this.trim(this.audio);
      } else {
        const playback = this.audio.get(event.id);
        this.audio.delete(event.id);
        this.audioEnded.set(event.id, now + P.feedback.audioTtlMs); this.trim(this.audioEnded);
        if (playback?.msgId) {
          const reply = this.reply(playback.msgId, now);
          reply.audioDone = true; reply.textUntil = 0;
        }
      }
    }
  }
  streamStart(id: string, now: number): void {
    const reply = this.reply(id, now);
    if (reply.canonical || reply.audioDone) return;
    reply.streaming = true; reply.expires = now + P.feedback.streamTtlMs;
  }
  streamDelta(id: string, text: string, now: number): void {
    const reply = this.replies.get(id);
    if (!reply?.streaming || !text.trim()) return;
    reply.visible = true; reply.expires = now + P.feedback.streamTtlMs;
    if (!reply.audioDone) reply.textUntil = now + P.feedback.streamTtlMs;
  }
  streamEnd(id: string, now: number): void {
    const reply = this.replies.get(id);
    if (!reply?.streaming) return;
    reply.streaming = false; reply.expires = now + P.feedback.emotionTtlMs;
    if (reply.visible && !reply.audioDone) reply.textUntil = now + P.feedback.streamEndMs;
  }
  canonical(id: string, text: string, now: number, order?: number): void {
    const reply = this.reply(id, now, order);
    if (reply.canonical) return;
    reply.canonical = true; reply.streaming = false; reply.expires = now + P.feedback.emotionTtlMs;
    reply.visible = Boolean(text.trim());
    if (reply.visible && !reply.audioDone) reply.textUntil = now + Math.max(P.feedback.textMinMs, Math.min(P.feedback.textMaxMs, text.length * P.feedback.textCharMs));
    if (reply.emotion) this.setEmotion(reply.emotion, now, reply.order);
  }
  segments(id: string, segments: NarrativeSegment[], now: number): void {
    // Only backend-authored structured performance; no text/keyword inference.
    const expression = segments.filter(s => s.type === 'say').map(s => trustedExpression(s.perform?.expression)).find(Boolean);
    if (!expression) return;
    const reply = this.reply(id, now);
    reply.emotion = expression;
    if (reply.visible) this.setEmotion(expression, now, reply.order);
  }
  frame(now: number, mood: string, snapshotThinking = false, directiveExpression?: string | null): BehaviorFrame {
    for (const [id, request] of this.requests) if (request.expires <= now) this.requests.delete(id);
    for (const [id, reply] of this.replies) if (reply.expires <= now) this.replies.delete(id);
    for (const [id, audio] of this.audio) if (audio.expires <= now) this.audio.delete(id);
    for (const [id, expires] of this.audioEnded) if (expires <= now) this.audioEnded.delete(id);
    if (this.lastMood !== null && mood !== this.lastMood) this.emotion = null;
    this.lastMood = mood;
    if (snapshotThinking) this.snapshotThinkingSince ??= now;
    else this.snapshotThinkingSince = null;
    const replies = [...this.replies.values()];
    const speaking = this.audio.size > 0 || replies.some(r => r.textUntil > now && !r.audioDone);
    const thinking = this.requests.size > 0 || replies.some(r => r.streaming && !r.visible)
      || (this.snapshotThinkingSince !== null && now - this.snapshotThinkingSince < P.feedback.requestTtlMs);
    return { activity: speaking ? 'speaking' : thinking ? 'thinking' : 'idle',
      expression: trustedExpression(directiveExpression) ?? (this.emotion && this.emotion.expires > now ? this.emotion.value : MOOD_EXPRESSION[mood] ?? trustedExpression(mood) ?? 'neutral') };
  }
}
