import { normalizeChatDisplayText } from '../chat/chatDisplay';
import type { PerformSpec } from '../../shared/api/types';

/**
 * Transport-normalization layer (see cc-tasks/06-room-vn-bubble-stream-reveal.md).
 *
 * Corrected event contract:
 * - message_stream_start → new turn (force-finish any unfinished previous turn first).
 * - message_stream_delta → buffer += delta.
 * - message_stream_end   → stream closed only; turn stays not-done until canonical arrives.
 * - channel_message:
 *     - msg_id matches the in-flight turn → finalizer (canonical + done), NOT a duplicate.
 *     - otherwise → a fresh non-streaming turn (trigger path).
 * - message_segments → sets `segments` on the matching turn (current or a recent one).
 *     Never restarts playback; it only swaps the text source Segmenter reads from.
 */
export interface TurnSegment {
  text: string;
  perform?: PerformSpec;
}

export interface AssistantTurn {
  msgId: string;
  buffer: string;
  canonical: string | null;
  segments: TurnSegment[] | null;
  streamClosed: boolean;
  done: boolean;
  startedAt: number;
}

export const WATCHDOG_MS = 120_000;

function splitReply(text: string): string[] {
  return text.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
}

export function startTurn(msgId: string, now: number): AssistantTurn {
  return { msgId, buffer: '', canonical: null, segments: null, streamClosed: false, done: false, startedAt: now };
}

/** Force-finish a still-open turn (used before starting a new stream, and by the watchdog). */
export function forceFinish(turn: AssistantTurn): AssistantTurn {
  if (turn.done) return turn;
  return { ...turn, canonical: turn.canonical ?? turn.buffer, done: true };
}

export function appendDelta(turn: AssistantTurn, msgId: string, delta: string): AssistantTurn {
  if (turn.msgId !== msgId || turn.done) return turn;
  return { ...turn, buffer: turn.buffer + delta };
}

export function markStreamClosed(turn: AssistantTurn, msgId: string): AssistantTurn {
  if (turn.msgId !== msgId) return turn;
  return { ...turn, streamClosed: true };
}

/**
 * channel_message finalizer for the currently in-flight turn (same msg_id, not yet done).
 * Callers are responsible for detecting the "new turn" case themselves (see useVnPresenter).
 */
export function finalizeWithCanonical(turn: AssistantTurn, msgId: string, content: string): AssistantTurn {
  if (turn.msgId !== msgId) return turn;
  return { ...turn, canonical: content, done: true };
}

/** Non-streaming turn: trigger-path channel_message with no matching in-flight turn. */
export function turnFromChannelMessage(msgId: string, content: string, now: number): AssistantTurn {
  return { msgId, buffer: content, canonical: content, segments: null, streamClosed: true, done: true, startedAt: now };
}

export function applySegmentsToTurn(turn: AssistantTurn, msgId: string, segments: TurnSegment[]): AssistantTurn {
  if (turn.msgId !== msgId || segments.length === 0) return turn;
  return { ...turn, segments };
}

export function checkWatchdog(turn: AssistantTurn, now: number): AssistantTurn {
  if (turn.done || now - turn.startedAt < WATCHDOG_MS) return turn;
  return forceFinish(turn);
}

export interface EffectiveParts {
  parts: string[];
  /** Same length as `parts`; undefined where the segment carries no performance spec, and
   * always all-undefined for the splitReply fallback path (plain text has no perform data). */
  performs: (PerformSpec | undefined)[];
  /** Index of the still-growing segment, or -1 when every segment is closed (turn done). */
  openIdx: number;
}

/**
 * Segmenter: picks the highest-priority text source (segments > canonical > buffer) and
 * splits it into display segments. The last segment of an unfinished turn is "open" — still
 * receiving text — everything before it is already closed.
 */
export function effectiveParts(turn: AssistantTurn): EffectiveParts {
  const raw: TurnSegment[] = turn.segments && turn.segments.length > 0
    ? turn.segments
    : splitReply(turn.canonical ?? turn.buffer).map(text => ({ text }));
  const parts = raw.map(s => normalizeChatDisplayText(s.text));
  const performs = raw.map(s => s.perform);
  const openIdx = turn.done || parts.length === 0 ? -1 : parts.length - 1;
  return { parts, performs, openIdx };
}
