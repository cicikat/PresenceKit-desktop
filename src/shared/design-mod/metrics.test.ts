import { describe, expect, it } from 'vitest';
import { createSessionMetricsStore } from './metrics';

describe('design Mod session metrics', () => {
  it('separates history size from entries and elapsed session time', () => {
    let now = 1_000;
    const store = createSessionMetricsStore(() => now);
    store.markHistoryLoaded(12);
    store.recordEntry();
    store.recordTurn();
    now += 2_500;
    expect(store.get()).toMatchObject({ historyEntryCount: 12, sessionEntryCount: 1, turnCount: 1, elapsedMs: 2500 });
    expect(store.get().historyEntryCount).not.toBe(store.get().sessionEntryCount);
  });
});
