import { describe, expect, it } from 'vitest';
import { shouldAutoCloseDream } from './dreamCloseTransition';

describe('shouldAutoCloseDream', () => {
  it('does not close an initially opened Reality window', () => {
    expect(shouldAutoCloseDream(null, { status: 'REALITY_AFTERGLOW' })).toBe(false);
    expect(shouldAutoCloseDream(null, { status: 'REALITY_CHAT' })).toBe(false);
  });

  it('closes only after an observed Dream reaches a closed state', () => {
    const observed = { dreamId: 'dream-1', status: 'DREAM_EXIT_REQUESTED' as const };
    expect(shouldAutoCloseDream(observed, { status: 'DREAM_CLOSING', dreamId: 'dream-1' })).toBe(true);
    expect(shouldAutoCloseDream(observed, { status: 'REALITY_AFTERGLOW', dreamId: 'dream-1' })).toBe(true);
    expect(shouldAutoCloseDream(observed, { status: 'REALITY_CHAT', dreamId: null })).toBe(true);
  });

  it('does not treat an unrelated session as the close transition', () => {
    const observed = { dreamId: 'dream-1', status: 'DREAM_ACTIVE' as const };
    expect(shouldAutoCloseDream(observed, { status: 'REALITY_CHAT', dreamId: 'dream-2' })).toBe(false);
    expect(shouldAutoCloseDream(observed, { status: 'DREAM_ENTRANCE_AVAILABLE' })).toBe(false);
  });
});
