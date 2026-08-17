import { describe, expect, it } from 'vitest';
import { selectPresenterSnapshot } from './selector';

describe('presenter selector', () => {
  it('does not notify a consumer for unrelated snapshot fields', () => {
    let snapshot = { moodVersion: 1, gardenVersion: 1 };
    let listener: (() => void) | undefined; let calls = 0;
    const unsubscribe = selectPresenterSnapshot(() => snapshot, callback => { listener = callback; return () => { listener = undefined; }; }, value => value.gardenVersion, () => { calls += 1; });
    snapshot = { moodVersion: 2, gardenVersion: 1 }; listener?.();
    snapshot = { moodVersion: 2, gardenVersion: 2 }; listener?.();
    expect(calls).toBe(1); unsubscribe(); expect(listener).toBeUndefined();
  });
});
