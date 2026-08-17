export interface ChatSessionMetrics {
  startedAt: number;
  elapsedMs: number;
  sessionEntryCount: number;
  turnCount: number;
  historyEntryCount: number;
  typing: boolean;
  loading: boolean;
}

export interface SessionMetricsStore {
  get(): ChatSessionMetrics;
  subscribe(listener: () => void): () => void;
  markHistoryLoaded(count: number): void;
  recordEntry(): void;
  recordTurn(): void;
  setTyping(value: boolean): void;
  setLoading(value: boolean): void;
  reset(startedAt?: number): void;
}

export function createSessionMetricsStore(clock: () => number = Date.now): SessionMetricsStore {
  let startedAt = clock();
  let sessionEntryCount = 0;
  let turnCount = 0;
  let historyEntryCount = 0;
  let typing = false;
  let loading = false;
  const listeners = new Set<() => void>();
  let ticker: ReturnType<typeof setInterval> | null = null;
  const notify = () => listeners.forEach(listener => listener());
  const stopTicker = () => {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
  };
  const get = (): ChatSessionMetrics => ({
    startedAt,
    elapsedMs: Math.max(0, clock() - startedAt),
    sessionEntryCount,
    turnCount,
    historyEntryCount,
    typing,
    loading,
  });
  return {
    get,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) ticker = setInterval(notify, 1_000);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopTicker();
      };
    },
    markHistoryLoaded(count) { historyEntryCount = Math.max(0, Math.floor(count)); notify(); },
    recordEntry() { sessionEntryCount += 1; notify(); },
    recordTurn() { turnCount += 1; notify(); },
    setTyping(value) { if (typing !== value) { typing = value; notify(); } },
    setLoading(value) { if (loading !== value) { loading = value; notify(); } },
    reset(nextStartedAt = clock()) {
      startedAt = nextStartedAt;
      sessionEntryCount = 0;
      turnCount = 0;
      historyEntryCount = 0;
      typing = false;
      loading = false;
      notify();
    },
  };
}

export const chatSessionMetrics = createSessionMetricsStore();
