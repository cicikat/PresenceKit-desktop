import type { ToolEphemeralKind, ToolStatusPayload } from '../api/types';

export type { ToolEphemeralKind, ToolStatusPayload } from '../api/types';

export interface ToolStatusOverlayState extends ToolStatusPayload {
  received_at: number;
  expires_at: number;
}

type CurrentStatus = ToolStatusOverlayState & {
  shown_at: number;
  terminal_at: number | null;
  pending_terminal: ToolStatusOverlayState | null;
};

const MIN_VISIBLE_MS = 1_000;
const TERMINAL_KINDS = new Set<ToolEphemeralKind>([
  'finished', 'failed', 'outcome_unknown', 'cancelled',
]);
const VALID_KINDS = new Set<ToolEphemeralKind>([
  'pending_confirmation', 'queued', 'waiting', 'finished', 'failed', 'outcome_unknown', 'cancelled',
]);

export function isToolStatusPayload(value: unknown): value is ToolStatusPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.status_id === 'string' && payload.status_id.length > 0
    && typeof payload.label === 'string' && payload.label.length > 0 && payload.label.length <= 48
    && typeof payload.kind === 'string' && VALID_KINDS.has(payload.kind as ToolEphemeralKind)
    && Number.isInteger(payload.index) && (payload.index as number) >= 1
    && Number.isInteger(payload.total) && (payload.total as number) >= (payload.index as number)
    && Number.isInteger(payload.attempt) && (payload.attempt as number) >= 1
    && Number.isFinite(payload.ttl_ms) && (payload.ttl_ms as number) > 0;
}

/**
 * Local-only NOW overlay. It deliberately owns no durable state and never
 * touches the backend-derived activity stored by StateEngine.
 */
export class ToolStatusOverlayController {
  private current: CurrentStatus | null = null;
  private queued: ToolStatusOverlayState[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(state: ToolStatusOverlayState | null) => void>();

  constructor(private readonly now: () => number = Date.now) {}

  get(): ToolStatusOverlayState | null {
    return this.publicState();
  }

  subscribe(listener: (state: ToolStatusOverlayState | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  receive(payload: ToolStatusPayload): void {
    if (!isToolStatusPayload(payload) || payload.kind === 'pending_confirmation') return;
    const receivedAt = this.now();
    const event: ToolStatusOverlayState = {
      ...payload,
      received_at: receivedAt,
      expires_at: receivedAt + payload.ttl_ms,
    };
    this.advance(receivedAt);

    if (this.current?.status_id === event.status_id) {
      if (TERMINAL_KINDS.has(event.kind)) {
        this.current.pending_terminal = event;
        this.current.expires_at = Math.max(this.current.expires_at, event.expires_at);
      } else {
        this.current = { ...this.current, ...event };
      }
      this.advance(receivedAt);
      this.publish();
      this.schedule();
      return;
    }

    const queuedIndex = this.queued.findIndex(item => item.status_id === event.status_id);
    if (queuedIndex >= 0) {
      this.queued[queuedIndex] = event;
    } else if (!TERMINAL_KINDS.has(event.kind)) {
      this.queued.push(event);
    }
    this.advance(receivedAt);
    this.publish();
    this.schedule();
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
    this.current = null;
    this.queued = [];
  }

  private advance(now: number): void {
    this.queued = this.queued.filter(item => item.expires_at > now);
    if (this.current && this.current.expires_at <= now) this.current = null;

    if (this.current) {
      const visibleFor = now - this.current.shown_at;
      if (this.current.terminal_at !== null && now - this.current.terminal_at >= MIN_VISIBLE_MS) {
        this.current = null;
      } else if (this.current.pending_terminal && visibleFor >= MIN_VISIBLE_MS) {
        const terminal = this.current.pending_terminal;
        if (terminal.kind === 'finished') {
          this.current = null;
        } else {
          this.current = {
            ...this.current,
            ...terminal,
            terminal_at: now,
            pending_terminal: null,
          };
        }
      }
    }

    if (!this.current) {
      const next = this.queued.shift();
      if (next) {
        this.current = {
          ...next,
          shown_at: now,
          terminal_at: TERMINAL_KINDS.has(next.kind) ? now : null,
          pending_terminal: null,
        };
      }
    }
  }

  private publicState(): ToolStatusOverlayState | null {
    if (!this.current) return null;
    const { shown_at: _shownAt, terminal_at: _terminalAt, pending_terminal: _pendingTerminal, ...state } = this.current;
    return state;
  }

  private publish(): void {
    const state = this.publicState();
    this.listeners.forEach(listener => listener(state));
  }

  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const now = this.now();
    const due = [
      this.current?.expires_at,
      this.current?.pending_terminal ? this.current.shown_at + MIN_VISIBLE_MS : undefined,
      this.current?.terminal_at !== null && this.current?.terminal_at !== undefined
        ? this.current.terminal_at + MIN_VISIBLE_MS
        : undefined,
      ...this.queued.map(item => item.expires_at),
    ].filter((value): value is number => typeof value === 'number' && value > now);
    if (!due.length) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.advance(this.now());
      this.publish();
      this.schedule();
    }, Math.max(1, Math.min(...due) - now));
  }
}
