import { useEffect, useRef, useState, useCallback } from 'react';
import { wsClient } from '../../shared/api/ws';
import {
  startTurn,
  forceFinish,
  appendDelta,
  markStreamClosed,
  finalizeWithCanonical,
  turnFromChannelMessage,
  applySegmentsToTurn,
  checkWatchdog,
  effectiveParts,
} from './turnIngest';
import type { AssistantTurn } from './turnIngest';

// ── constants (see cc-tasks/06-room-vn-bubble-stream-reveal.md) ────────────────

const REVEAL_CPS = 40; // chars/sec, ~25ms per (CJK) char
const FADE_MS = 600;
const INTERRUPT_FADE_MS = 200;
const HISTORY_SIZE = 2; // weak-ref window for late message_segments

function dwellMs(segment: string): number {
  return Math.max(2000, Math.min(8000, segment.length * 90));
}

type Status = 'idle' | 'revealing' | 'starved' | 'dwell' | 'fading';

export interface VnBubbleView {
  text: string;
  visible: boolean;
  /** revealing or starved: show blinking cursor */
  streaming: boolean;
  /** dwell: show "click to continue" hint */
  canAdvance: boolean;
  /** interrupt fades are fast (200ms), end-of-turn fades are slow (600ms) */
  fadeMs: number;
}

export interface VnPresenterOptions {
  /** Fired when a turn is force-completed by the 120s watchdog (WS died mid-stream). */
  onWatchdogTimeout?: () => void;
}

export interface VnPresenterAPI {
  bubble: VnBubbleView | null;
  /** true while the current segment is actively revealing (drives mouth-sync) */
  talking: boolean;
  onBubbleClick: () => void;
}

interface Snapshot {
  bubble: VnBubbleView | null;
  talking: boolean;
}

const IDLE_SNAPSHOT: Snapshot = { bubble: null, talking: false };

export function useVnPresenter(options: VnPresenterOptions = {}): VnPresenterAPI {
  const onWatchdogTimeoutRef = useRef(options.onWatchdogTimeout);
  onWatchdogTimeoutRef.current = options.onWatchdogTimeout;

  const turnRef = useRef<AssistantTurn | null>(null);
  const historyRef = useRef<AssistantTurn[]>([]);
  const pendingTurnRef = useRef<AssistantTurn | null>(null);

  const activeMsgIdRef = useRef<string | null>(null);
  const statusRef = useRef<Status>('idle');
  const segIdxRef = useRef(0);
  const revealedRef = useRef(0);
  const dwellDeadlineRef = useRef(0);
  const fadeDeadlineRef = useRef(0);
  const lastTickRef = useRef(0);

  const [snapshot, setSnapshot] = useState<Snapshot>(IDLE_SNAPSHOT);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const pushHistory = useCallback((turn: AssistantTurn) => {
    historyRef.current = [turn, ...historyRef.current].slice(0, HISTORY_SIZE);
  }, []);

  /** Swap in a freshly-created turn, interrupt-fading whatever is currently on screen. */
  const beginNewTurn = useCallback((newTurn: AssistantTurn) => {
    const current = turnRef.current;
    if (current) pushHistory(current);

    const wasVisible = current !== null && effectiveParts(current).parts.length > 0
      && statusRef.current !== 'idle';

    if (wasVisible) {
      pendingTurnRef.current = newTurn;
      statusRef.current = 'fading';
      fadeDeadlineRef.current = performance.now() + INTERRUPT_FADE_MS;
    } else {
      turnRef.current = newTurn;
      activeMsgIdRef.current = null; // tick will detect this as "new" and reset segIdx/revealed
      pendingTurnRef.current = null;
    }
  }, [pushHistory]);

  // ── ws ingest wiring ─────────────────────────────────────────────────────────

  useEffect(() => {
    const unStart = wsClient.on('message_stream_start', ({ msg_id }) => {
      const now = performance.now();
      if (turnRef.current && !turnRef.current.done) {
        turnRef.current = forceFinish(turnRef.current);
      }
      beginNewTurn(startTurn(msg_id, now));
    });

    const unDelta = wsClient.on('message_stream_delta', ({ msg_id, delta }) => {
      if (turnRef.current) turnRef.current = appendDelta(turnRef.current, msg_id, delta);
    });

    const unEnd = wsClient.on('message_stream_end', ({ msg_id }) => {
      if (turnRef.current) turnRef.current = markStreamClosed(turnRef.current, msg_id);
    });

    const unMsg = wsClient.on('channel_message', ({ content, msg_id }) => {
      const now = performance.now();
      const cur = turnRef.current;
      if (cur && cur.msgId === msg_id) {
        if (!cur.done) turnRef.current = finalizeWithCanonical(cur, msg_id, content);
        return; // duplicate re-delivery of an already-finalized turn: ignore
      }
      if (historyRef.current.some(h => h.msgId === msg_id)) return; // duplicate of a past turn
      beginNewTurn(turnFromChannelMessage(msg_id, content, now));
    });

    const unSeg = wsClient.on('message_segments', ({ segments, msg_id }) => {
      const parts = (segments ?? []).map(s => s.text).filter(s => s.trim());
      if (parts.length === 0) return;
      const cur = turnRef.current;
      if (cur && cur.msgId === msg_id) {
        turnRef.current = applySegmentsToTurn(cur, msg_id, parts);
        return;
      }
      const hist = historyRef.current.find(h => h.msgId === msg_id);
      if (hist) {
        historyRef.current = historyRef.current.map(h =>
          h.msgId === msg_id ? applySegmentsToTurn(h, msg_id, parts) : h);
      }
      // else: orphan segments for an unknown turn — ignore
    });

    return () => { unStart(); unDelta(); unEnd(); unMsg(); unSeg(); };
  }, [beginNewTurn]);

  // ── advance helper (shared by dwell-timeout and click) ────────────────────────

  const advanceOrFade = useCallback((now: number, partsLength: number, segIdx: number) => {
    if (segIdx >= partsLength - 1) {
      statusRef.current = 'fading';
      fadeDeadlineRef.current = now + FADE_MS;
      pendingTurnRef.current = null; // end-of-turn fade, not an interrupt
    } else {
      segIdxRef.current = segIdx + 1;
      revealedRef.current = 0;
      statusRef.current = 'revealing';
    }
  }, []);

  // ── rAF presenter loop ─────────────────────────────────────────────────────

  useEffect(() => {
    let rafId = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = lastTickRef.current === 0 ? 0 : Math.min(0.1, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;

      // resolve a completed interrupt/end-of-turn fade
      if (statusRef.current === 'fading' && now >= fadeDeadlineRef.current) {
        if (pendingTurnRef.current) {
          turnRef.current = pendingTurnRef.current;
          pendingTurnRef.current = null;
          activeMsgIdRef.current = null; // reset segIdx/revealed for the new turn below
          statusRef.current = 'idle';
        } else {
          turnRef.current = null;
          activeMsgIdRef.current = null;
          statusRef.current = 'idle';
        }
      }

      // watchdog: force-finish a turn that's been open too long (e.g. WS died mid-stream)
      if (turnRef.current) {
        const before = turnRef.current;
        const after = checkWatchdog(before, now);
        if (after !== before) {
          turnRef.current = after;
          onWatchdogTimeoutRef.current?.();
        }
      }

      const t = turnRef.current;
      if (!t) {
        if (snapshotRef.current !== IDLE_SNAPSHOT) setSnapshot(IDLE_SNAPSHOT);
        return;
      }

      const { parts, openIdx } = effectiveParts(t);
      if (parts.length === 0) {
        // stream started but no delta has arrived yet
        if (snapshotRef.current.bubble !== null || snapshotRef.current.talking) {
          setSnapshot({ bubble: null, talking: false });
        }
        return;
      }

      if (activeMsgIdRef.current !== t.msgId) {
        activeMsgIdRef.current = t.msgId;
        segIdxRef.current = 0;
        revealedRef.current = 0;
        statusRef.current = 'revealing';
      }

      segIdxRef.current = Math.min(segIdxRef.current, parts.length - 1);
      const segIdx = segIdxRef.current;
      const currentPart = parts[segIdx];
      revealedRef.current = Math.min(revealedRef.current, currentPart.length);
      const isOpenSeg = segIdx === openIdx;

      if (statusRef.current === 'revealing') {
        revealedRef.current = Math.min(currentPart.length, revealedRef.current + REVEAL_CPS * dt);
        if (revealedRef.current >= currentPart.length) {
          revealedRef.current = currentPart.length;
          if (isOpenSeg) {
            statusRef.current = 'starved';
          } else {
            statusRef.current = 'dwell';
            dwellDeadlineRef.current = now + dwellMs(currentPart);
          }
        }
      } else if (statusRef.current === 'starved') {
        if (currentPart.length > revealedRef.current) {
          statusRef.current = 'revealing';
        } else if (!isOpenSeg) {
          statusRef.current = 'dwell';
          dwellDeadlineRef.current = now + dwellMs(currentPart);
        }
      } else if (statusRef.current === 'dwell') {
        if (now >= dwellDeadlineRef.current) {
          advanceOrFade(now, parts.length, segIdx);
        }
      }
      // 'fading' at this point means the deadline hasn't passed yet — leave it alone this frame.

      const status = statusRef.current;
      const text = currentPart.slice(0, Math.floor(revealedRef.current));
      const next: Snapshot = {
        bubble: {
          text,
          visible: status !== 'fading',
          streaming: status === 'revealing' || status === 'starved',
          canAdvance: status === 'dwell',
          fadeMs: pendingTurnRef.current !== null ? INTERRUPT_FADE_MS : FADE_MS,
        },
        talking: status === 'revealing',
      };
      const prev = snapshotRef.current;
      if (
        !prev.bubble || !next.bubble ||
        prev.bubble.text !== next.bubble.text ||
        prev.bubble.visible !== next.bubble.visible ||
        prev.bubble.streaming !== next.bubble.streaming ||
        prev.bubble.canAdvance !== next.bubble.canAdvance ||
        prev.talking !== next.talking
      ) {
        setSnapshot(next);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [advanceOrFade]);

  // ── click handling (galgame semantics) ────────────────────────────────────────

  const onBubbleClick = useCallback(() => {
    const t = turnRef.current;
    if (!t) return;
    const { parts } = effectiveParts(t);
    if (parts.length === 0) return;
    const segIdx = segIdxRef.current;
    const currentPart = parts[segIdx];

    if (statusRef.current === 'revealing' || statusRef.current === 'starved') {
      revealedRef.current = currentPart.length; // full reveal; next tick resolves starved/dwell
    } else if (statusRef.current === 'dwell') {
      advanceOrFade(performance.now(), parts.length, segIdx);
    }
    // 'idle' / 'fading': no-op
  }, [advanceOrFade]);

  return { bubble: snapshot.bubble, talking: snapshot.talking, onBubbleClick };
}
