import { classifyHttpError } from './httpError';

export interface TurnReasoning {
  turn_id: string;
  available: boolean;
  entries: Array<{
    seq: number;
    call_id: string;
    created_at: number;
    preset: string;
    model: string;
    protocol: string;
    status: 'completed' | 'interrupted';
    reasoning_chars: number;
    parts: Array<{ source: string; text: string }>;
  }>;
}

export function reasoningErrorKey(error: unknown) {
  switch (classifyHttpError(error).status) {
    case 401: return 'chat.reasoning.unauthorized';
    case 403: return 'chat.reasoning.forbidden';
    case 404: return 'chat.reasoning.unsupported';
    case 503: return 'chat.reasoning.unavailable';
    default: return 'chat.reasoning.failed';
  }
}

// One cache per ChatPanel session, never persisted or shared across characters.
export class TurnReasoningCache {
  private generation = 0;
  private values = new Map<string, TurnReasoning>();
  private pending = new Map<string, Promise<TurnReasoning>>();

  constructor(private fetch: (turnId: string) => Promise<TurnReasoning>) {}

  clear() {
    this.generation++;
    this.values.clear();
    this.pending.clear();
  }

  load(turnId: string, refresh = false): Promise<TurnReasoning> {
    const pending = this.pending.get(turnId);
    if (pending) return pending;
    const cached = this.values.get(turnId);
    if (!refresh && cached) return Promise.resolve(cached);
    const generation = this.generation;
    const request = this.fetch(turnId).then(value => {
      if (generation !== this.generation) throw new Error('Stale reasoning session');
      if (value.turn_id !== turnId || !Array.isArray(value.entries)) throw new Error('Invalid reasoning response');
      // Empty results can be a race with backend association; never negative-cache.
      if (value.available && value.entries.length) {
        this.values.delete(turnId);
        this.values.set(turnId, value);
        if (this.values.size > 50) this.values.delete(this.values.keys().next().value!);
      } else {
        this.values.delete(turnId);
      }
      return value;
    }).finally(() => {
      if (this.pending.get(turnId) === request) this.pending.delete(turnId);
    });
    this.pending.set(turnId, request);
    return request;
  }
}

// Only explicit HTTP canonical IDs may attach to live bubbles. msg_id is a
// transport correlation key, never a substitute for a missing turn_id.
export function attachCanonicalTurn<T extends { id: string; role: string; turnId?: string }>(
  messages: T[], localIds: readonly string[], turnId?: string,
): T[] {
  if (!turnId?.trim()) return messages;
  return messages.map(message => message.role === 'assistant' && localIds.includes(message.id)
    ? { ...message, turnId } : message);
}
