import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatReplyFallbacks } from './chatReplyFallbacks';

afterEach(() => vi.useRealTimers());

const sources = (settled: Array<{ source: string }>) => settled.map(entry => entry.source);

describe('shared HTTP fallback lifecycle', () => {
  it.each(['send', 'upload', 'wake'] as const)('HTTP-first: canonical cancels %s exactly once', source => {
    vi.useFakeTimers();
    const state = new ChatReplyFallbacks<string>();
    const render = vi.fn();
    state.defer(source, { msgId: 'wire', normalizedHash: 'text' }, 'reply', 3000, render);
    expect(sources(state.canonical('wire', 'scrubbed text'))).toEqual([source]);
    expect(state.canonical('wire', 'scrubbed text')).toEqual([]);
    vi.runAllTimers();
    expect(render).not.toHaveBeenCalled();
    expect(state.has(source === 'wake' ? 'wake' : 'send')).toBe(false);
  });

  it('fallback-first settles before late WS and cannot fire twice', () => {
    vi.useFakeTimers();
    const state = new ChatReplyFallbacks<string>();
    const render = vi.fn();
    state.defer('send', { msgId: 'wire', normalizedHash: 'text' }, 'reply', 3000, render);
    vi.advanceTimersByTime(3000);
    expect(state.has('send')).toBe(false);
    expect(render).toHaveBeenCalledExactlyOnceWith('reply', 'send');
    expect(state.canonical('wire', 'text')).toEqual([]);
    vi.runAllTimers();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('same-slot retry invalidates old send but does not cancel independent wake', () => {
    vi.useFakeTimers();
    const state = new ChatReplyFallbacks<string>();
    const render = vi.fn();
    state.defer('send', { msgId: 'old', normalizedHash: 'same' }, 'old', 3000, render, 'A');
    state.defer('wake', { msgId: 'wake', normalizedHash: 'same' }, 'wake', 5000, render);
    state.defer('upload', { msgId: 'new', normalizedHash: 'same' }, 'new', 3000, render, 'A');
    expect(state.canonical('old', 'same')).toEqual([]);
    vi.runAllTimers();
    expect(render.mock.calls).toEqual([['new', 'upload'], ['wake', 'wake']]);
  });

  it('parallel send slots settle independently and do not share a timer', () => {
    vi.useFakeTimers();
    const state = new ChatReplyFallbacks<string>();
    const render = vi.fn();
    state.defer('send', { msgId: 'a', normalizedHash: 'one' }, 'first', 3000, render, 'A');
    state.defer('upload', { msgId: 'b', normalizedHash: 'two' }, 'second', 3000, render, 'B');
    expect(sources(state.canonical('b', 'two'))).toEqual(['upload']);
    expect(state.has('send')).toBe(true);
    vi.runAllTimers();
    expect(render).toHaveBeenCalledExactlyOnceWith('first', 'send');
  });

  it('overlapping ID-less slots do not guess a hash owner', () => {
    vi.useFakeTimers();
    const state = new ChatReplyFallbacks<string>();
    const render = vi.fn();
    state.defer('send', { normalizedHash: 'same' }, 'first', 3000, render, 'A');
    state.defer('send', { normalizedHash: 'same' }, 'second', 3000, render, 'B');
    state.disableLegacySendMatching();
    expect(state.canonical('wire', 'same')).toEqual([]);
    vi.runAllTimers();
    expect(render.mock.calls).toEqual([['first', 'send'], ['second', 'send']]);
  });

  it('legacy hash matches only ID-less pending replies', () => {
    vi.useFakeTimers();
    const state = new ChatReplyFallbacks<string>();
    const render = vi.fn();
    state.defer('send', { normalizedHash: 'same' }, 'legacy', 3000, render);
    state.defer('wake', { msgId: 'different', normalizedHash: 'same' }, 'wake', 5000, render);
    expect(sources(state.canonical('wire', 'same'))).toEqual(['send']);
    vi.runAllTimers();
    expect(render).toHaveBeenCalledExactlyOnceWith('wake', 'wake');
  });

  it('unmount/session reset cancels callbacks and permits a new lifecycle', () => {
    vi.useFakeTimers();
    const state = new ChatReplyFallbacks<string>();
    const render = vi.fn();
    state.defer('send', { msgId: 'old', normalizedHash: 'same' }, 'old', 3000, render);
    state.clear(); state.clear();
    state.defer('send', { msgId: 'new', normalizedHash: 'same' }, 'new', 3000, render);
    vi.runAllTimers();
    expect(render).toHaveBeenCalledExactlyOnceWith('new', 'send');
  });
});
