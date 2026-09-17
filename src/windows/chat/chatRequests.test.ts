import { describe, expect, it } from 'vitest';
import { ChatRequests } from './chatRequests';

describe('parallel local chat requests', () => {
  it('settles B before A without clearing A or guessing from an unknown stream', () => {
    const state = new ChatRequests();
    const a = state.begin('A')!;
    const b = state.begin('B')!;
    state.streamStart('unknown'); state.streamVisible('unknown');
    state.canonical('unknown');
    expect(state.has('A')).toBe(true);
    expect(state.has('B')).toBe(true);
    state.bind(b, 'wire-b'); state.canonical('wire-b');
    expect(state.owns('wire-b')).toBe(false);
    expect(state.has('A')).toBe(true);
    expect(state.has('B')).toBe(false);
    state.bind(a, 'wire-a'); state.canonical('wire-a');
    expect(state.has()).toBe(false);
  });

  it('rejects double retry and stale failure/success after retry or remount', () => {
    const state = new ChatRequests();
    const first = state.begin('A')!;
    expect(state.begin('A')).toBeUndefined();
    state.settle(first);
    const retry = state.begin('A')!;
    expect(state.settle(first)).toBe(false);
    expect(state.has('A')).toBe(true);
    state.clear();
    const fresh = state.begin('A')!;
    expect(state.bind(retry, 'old')).toBe(false);
    expect(state.settle(retry)).toBe(false);
    expect(state.isCurrent(fresh)).toBe(true);
  });

  it('turns off hash attribution for all overlapping requests and keeps independent stream waits', () => {
    const state = new ChatRequests();
    const a = state.begin('A')!;
    expect(state.allowsLegacyHash(a)).toBe(true);
    const b = state.begin('B')!;
    expect(state.allowsLegacyHash(a)).toBe(false);
    expect(state.allowsLegacyHash(b)).toBe(false);
    state.streamStart('one'); state.streamStart('two'); state.streamVisible('one');
    expect(state.waitingForStream).toBe(true);
    state.streamVisible('two');
    expect(state.waitingForStream).toBe(false);
    expect(state.has()).toBe(true);
  });

  it('hides waiting once a bound stream has visible text, without settling an unbound request', () => {
    const state = new ChatRequests();
    const a = state.begin('A')!;
    const b = state.begin('B')!;
    state.bind(b, 'wire-b');
    state.streamStart('wire-b');
    state.streamStart('unknown');
    state.streamVisible('wire-b');
    expect(state.has('B')).toBe(false);
    expect(state.has('A')).toBe(true);
    expect(state.isCurrent(a)).toBe(true);
    expect(state.waitingForStream).toBe(true);
    state.streamVisible('unknown');
    expect(state.waitingForStream).toBe(false);
  });

  it('ends an empty unknown stream without settling local requests', () => {
    const state = new ChatRequests();
    const a = state.begin('A')!;
    state.streamStart('unknown');
    expect(state.waitingForStream).toBe(true);
    state.streamEnd('unknown');
    expect(state.waitingForStream).toBe(false);
    expect(state.isCurrent(a)).toBe(true);
    expect(state.release('A')).toBe(true);
    expect(state.has()).toBe(false);
  });
});
