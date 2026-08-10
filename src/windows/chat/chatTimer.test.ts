import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLatestTimer } from './chatTimer';

describe('ChatPanel latest-wins timer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels on unmount and leaves no pending callback', () => {
    vi.useFakeTimers();
    const timer = createLatestTimer();
    const callback = vi.fn();

    timer.schedule(callback, 2500);
    expect(timer.hasPending()).toBe(true);
    timer.cancel();
    vi.advanceTimersByTime(2500);

    expect(callback).not.toHaveBeenCalled();
    expect(timer.hasPending()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps only the latest timer when input is replaced quickly', () => {
    vi.useFakeTimers();
    const timer = createLatestTimer();
    const stale = vi.fn();
    const latest = vi.fn();

    timer.schedule(stale, 2500);
    timer.schedule(latest, 2500);
    vi.advanceTimersByTime(2499);
    expect(stale).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    expect(timer.hasPending()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let an old timer fire after a conversation/engine switch', () => {
    vi.useFakeTimers();
    const oldEngineTimer = createLatestTimer();
    const newEngineTimer = createLatestTimer();
    const oldCallback = vi.fn();
    const newCallback = vi.fn();

    oldEngineTimer.schedule(oldCallback, 2500);
    oldEngineTimer.cancel();
    newEngineTimer.schedule(newCallback, 2500);
    vi.advanceTimersByTime(2500);

    expect(oldCallback).not.toHaveBeenCalled();
    expect(newCallback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is safe across repeated mount/unmount-style cleanup', () => {
    vi.useFakeTimers();
    const first = createLatestTimer();
    const second = createLatestTimer();
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    first.schedule(firstCallback, 2500);
    first.cancel();
    first.cancel();
    second.schedule(secondCallback, 2500);
    second.cancel();
    vi.runAllTimers();

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
