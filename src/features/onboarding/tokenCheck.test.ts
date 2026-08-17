import { describe, expect, it, vi } from 'vitest';
import { checkTokenStatus, TokenCheckTimeoutError } from './tokenCheck';

describe('token status check', () => {
  it('returns a successful configured status without delaying the caller', async () => {
    await expect(checkTokenStatus(async () => ({ configured: true, prefix: 'emt_' }))).resolves.toEqual({ configured: true, prefix: 'emt_' });
  });

  it('returns a bounded timeout instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      const result = checkTokenStatus(() => new Promise(() => {}), 50);
      const assertion = expect(result).rejects.toBeInstanceOf(TokenCheckTimeoutError);
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    } finally { vi.useRealTimers(); }
  });

  it('can be cancelled without letting the pending request win later', async () => {
    const controller = new AbortController();
    const result = checkTokenStatus(() => new Promise(() => {}), 1000, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
});
