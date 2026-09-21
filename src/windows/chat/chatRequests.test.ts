import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatRequests, EMPTY_STREAM_WAIT_MS } from './chatRequests';

afterEach(() => vi.useRealTimers());

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

  it('drops an empty stream wait after the timeout without settling local requests', () => {
    vi.useFakeTimers();
    const state = new ChatRequests();
    const a = state.begin('A')!;
    state.streamStart('unknown');
    expect(state.waitingForStream).toBe(true);
    vi.advanceTimersByTime(EMPTY_STREAM_WAIT_MS - 1);
    expect(state.waitingForStream).toBe(true);
    expect(state.isCurrent(a)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(state.waitingForStream).toBe(false);
    expect(state.isCurrent(a)).toBe(true);
  });

  it('cancels the empty-stream timeout once tokens or end arrive', () => {
    vi.useFakeTimers();
    const state = new ChatRequests();
    state.streamStart('visible');
    state.streamStart('ended');
    state.streamVisible('visible');
    state.streamEnd('ended');
    expect(state.waitingForStream).toBe(false);
    vi.advanceTimersByTime(EMPTY_STREAM_WAIT_MS);
    expect(state.waitingForStream).toBe(false);
  });

  it('hides unbound empty-stream waits as soon as the last local request settles', () => {
    const state = new ChatRequests();
    const a = state.begin('A')!;
    const b = state.begin('B')!;
    state.streamStart('unknown');
    expect(state.settle(a)).toBe(true);
    expect(state.waitingForStream).toBe(true);
    expect(state.settle(b)).toBe(true);
    expect(state.waitingForStream).toBe(false);
    expect(state.has()).toBe(false);
  });
});
