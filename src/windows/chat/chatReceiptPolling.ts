const CHAT_RECEIPT_POLL = {
  initialDelayMs: 1_000,
  maxDelayMs: 15_000,
  observationMs: 90_000,
  // The original Tauri POST can wait up to ten minutes before reconciliation starts.
  maxRequestAgeMs: 12 * 60_000,
};

type Timer = ReturnType<typeof setTimeout>;
type Observation = { deadline: number; delay: number; timer?: Timer; expiryTimer?: Timer };

export class ChatReceiptPolling {
  private readonly observations = new Map<string, Observation>();
  private readonly stopped = new Set<string>();

  constructor(
    private readonly read: (id: string, current: () => boolean) => Promise<boolean>,
    private readonly expire: (id: string) => void,
  ) {}

  observe(id: string): void {
    if (this.stopped.has(id) || this.observations.has(id)) return;
    const sentAt = Number(id.split('-')[1]);
    const entry = this.create(id, Math.min(
      Date.now() + CHAT_RECEIPT_POLL.observationMs,
      sentAt + CHAT_RECEIPT_POLL.maxRequestAgeMs,
    ));
    void this.tick(id, entry);
  }

  finish(id: string): void {
    this.stopped.add(id);
    clearTimeout(this.observations.get(id)?.timer);
    clearTimeout(this.observations.get(id)?.expiryTimer);
    this.observations.delete(id);
  }

  clear(): void {
    for (const entry of this.observations.values()) {
      clearTimeout(entry.timer);
      clearTimeout(entry.expiryTimer);
    }
    this.observations.clear();
    this.stopped.clear();
  }

  private create(id: string, deadline: number): Observation {
    const entry: Observation = { deadline, delay: CHAT_RECEIPT_POLL.initialDelayMs };
    this.observations.set(id, entry);
    entry.expiryTimer = setTimeout(() => {
      if (this.observations.get(id) !== entry) return;
      this.finish(id);
      this.expire(id);
    }, Math.max(0, deadline - Date.now()));
    return entry;
  }

  private async tick(id: string, entry: Observation): Promise<void> {
    const current = () => this.observations.get(id) === entry;
    if (!current()) return;
    if (Date.now() >= entry.deadline) {
      this.finish(id);
      this.expire(id);
      return;
    }
    const terminal = await this.read(id, current);
    if (!current()) return;
    if (terminal) this.finish(id);
    else {
      const jittered = Math.round(entry.delay * (0.85 + Math.random() * 0.3));
      const delay = Math.min(jittered, CHAT_RECEIPT_POLL.maxDelayMs, Math.max(0, entry.deadline - Date.now()));
      entry.delay = Math.min(entry.delay * 2, CHAT_RECEIPT_POLL.maxDelayMs);
      entry.timer = setTimeout(() => void this.tick(id, entry), delay);
    }
  }
}
