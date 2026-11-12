import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatReceiptPolling } from './chatReceiptPolling';
import { advanceChatRecovery, deliveryFromReceipt, isTerminalDelivery, type ChatRecoveryState } from './chatReconciliation';

const requestId = () => `dc-${Date.now()}-1234567890abcdef1234567890abcdef`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('bounded read-only receipt tracking', () => {
  it('backs off, deduplicates observers and stops at server completion', async () => {
    const id = requestId();
    const read = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    const expire = vi.fn();
    const poll = new ChatReceiptPolling(read, expire);
    poll.observe(id); poll.observe(id);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(read).toHaveBeenCalledTimes(3);
    await vi.runAllTimersAsync();
    poll.observe(id);
    expect(read).toHaveBeenCalledTimes(3);
    expect(expire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires a permanently running or offline request', async () => {
    const id = requestId();
    const readTimes: number[] = [];
    const read = vi.fn(async () => { readTimes.push(Date.now()); return false; });
    const expire = vi.fn();
    const poll = new ChatReceiptPolling(read, expire);
    poll.observe(id);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(expire).toHaveBeenCalledExactlyOnceWith(id);
    expect(vi.getTimerCount()).toBe(0);
    expect(readTimes.length).toBeLessThan(12);
    expect(readTimes.slice(1).every((time, index) => time - readTimes[index] <= 15_000)).toBe(true);
    const count = read.mock.calls.length;
    poll.observe(id);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires an in-flight read at the observation deadline and ignores its late result', async () => {
    const id = requestId();
    let resolve!: () => void;
    const apply = vi.fn();
    const expire = vi.fn();
    const poll = new ChatReceiptPolling(async (_id, current) => {
      await new Promise<void>(done => { resolve = done; });
      if (current()) apply();
      return true;
    }, expire);
    poll.observe(id);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(expire).toHaveBeenCalledExactlyOnceWith(id);
    resolve();
    await vi.runAllTimersAsync();
    expect(apply).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['completed', 'failed', 'interrupted_unknown', 'not_executed'] as const)(
    'stops for %s without executing a new chat request', async status => {
      const id = requestId();
      const query = vi.fn(async () => isTerminalDelivery(deliveryFromReceipt(id, { request_id: id, status })));
      const poll = new ChatReceiptPolling(query, vi.fn());
      poll.observe(id);
      await vi.runAllTimersAsync();
      expect(query).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('ignores late HTTP after canonical WS completion and cancels its timer immediately', async () => {
    const id = requestId();
    let resolve!: (value: boolean) => void;
    let state: ChatRecoveryState = { delivery: 'unknown' };
    const poll = new ChatReceiptPolling(async (_id, current) => {
      await new Promise<boolean>(done => { resolve = done; });
      if (current()) state = advanceChatRecovery(state, 'processing');
      return false;
    }, vi.fn());
    poll.observe(id);
    state = advanceChatRecovery(state, 'completed', 'rendered');
    poll.finish(id);
    resolve(false);
    await vi.runAllTimersAsync();
    expect(state).toMatchObject({ delivery: 'completed', replyAvailability: 'rendered' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels in-flight writes on unmount, backend or character switch and does not overlap checks', async () => {
    const id = requestId();
    let resolve!: (value: boolean) => void;
    const apply = vi.fn();
    const query = vi.fn(async (_id: string, current: () => boolean) => {
      await new Promise<boolean>(done => { resolve = done; });
      if (current()) apply();
      return false;
    });
    const poll = new ChatReceiptPolling(query, vi.fn());
    poll.observe(id); poll.observe(id);
    expect(query).toHaveBeenCalledTimes(1);
    poll.clear();
    resolve(false);
    await vi.runAllTimersAsync();
    expect(apply).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers after a failed read and does not poll an expired journal on reload', async () => {
    const id = requestId();
    const query = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const expire = vi.fn();
    const poll = new ChatReceiptPolling(query, expire);
    poll.observe(id);
    await vi.runAllTimersAsync();
    expect(query).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(13 * 60_000);
    const reloaded = new ChatReceiptPolling(query, expire);
    reloaded.observe(id);
    expect(query).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenCalledExactlyOnceWith(id);
    expect(vi.getTimerCount()).toBe(0);
  });
});
