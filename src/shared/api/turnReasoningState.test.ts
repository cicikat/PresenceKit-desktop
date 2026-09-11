import { describe, expect, it, vi } from 'vitest';
import { attachCanonicalTurn, reasoningErrorKey, TurnReasoningCache, type TurnReasoning } from './turnReasoningState';

const result = (id = 'canonical'): TurnReasoning => ({
  turn_id: id, available: true, entries: [1, 2].map(seq => ({
    seq, call_id: `call-${seq}`, created_at: 1789000000, preset: 'preset', model: `model-${seq}`,
    protocol: 'chat_completions', status: seq === 1 ? 'interrupted' : 'completed', reasoning_chars: 4,
    parts: [{ source: 'reasoning_content', text: '<script>literal text</script>' }],
  })),
});

describe('turn reasoning session cache', () => {
  it('deduplicates concurrent bubbles, preserves every call and caches by canonical turn', async () => {
    const fetch = vi.fn(async (id: string) => result(id));
    const cache = new TurnReasoningCache(fetch);
    const first = cache.load('canonical');
    expect(cache.load('canonical')).toBe(first);
    expect((await first).entries.map(e => e.status)).toEqual(['interrupted', 'completed']);
    expect(await cache.load('canonical')).toEqual(result());
    await cache.load('another');
    expect(fetch.mock.calls).toEqual([['canonical'], ['another']]);
  });

  it('retries empty association races and failed requests', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ turn_id: 'canonical', available: false, entries: [] })
      .mockRejectedValueOnce('HTTP 503').mockResolvedValue(result());
    const cache = new TurnReasoningCache(fetch);
    expect((await cache.load('canonical')).available).toBe(false);
    await expect(cache.load('canonical')).rejects.toBe('HTTP 503');
    expect((await cache.load('canonical')).entries).toHaveLength(2);
    await cache.load('canonical', true);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('rejects late results after a character/session switch without poisoning new requests', async () => {
    let resolve!: (value: TurnReasoning) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<TurnReasoning>(r => { resolve = r; }))
      .mockResolvedValue(result());
    const cache = new TurnReasoningCache(fetch);
    const old = cache.load('canonical');
    const rejected = expect(old).rejects.toThrow('Stale');
    cache.clear();
    const current = cache.load('canonical');
    resolve(result());
    await rejected;
    expect(await current).toEqual(result());
    await cache.load('canonical');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a response for a different turn', async () => {
    const cache = new TurnReasoningCache(async () => result('wrong'));
    await expect(cache.load('canonical')).rejects.toThrow('Invalid');
  });

  it('bounds retained records', async () => {
    const fetch = vi.fn(async (id: string) => result(id));
    const cache = new TurnReasoningCache(fetch);
    for (let i = 0; i < 51; i++) await cache.load(String(i));
    await cache.load('0');
    expect(fetch).toHaveBeenCalledTimes(52);
  });
});

describe('canonical correlation and downgrade', () => {
  it('attaches all explicitly correlated assistant segments without changing text or neighbours', () => {
    const messages: Array<{ id: string; role: string; text: string; turnId?: string }> = [
      { id: 'stream-a', role: 'assistant', text: 'first' },
      { id: 'stream-b', role: 'assistant', text: 'second' },
      { id: 'user', role: 'user', text: 'input' },
      { id: 'old', role: 'assistant', text: 'historical' },
    ];
    const updated = attachCanonicalTurn(messages, ['stream-a', 'stream-b', 'user'], 'canonical');
    expect(updated.slice(0, 2).map(m => m.turnId)).toEqual(['canonical', 'canonical']);
    expect(updated.map(m => m.text)).toEqual(messages.map(m => m.text));
    expect(updated[2]).toBe(messages[2]);
    expect(updated[3]).toBe(messages[3]);
    expect(attachCanonicalTurn(messages, ['stream-a'])).toBe(messages);
  });

  it.each([[401, 'unauthorized'], [403, 'forbidden'], [404, 'unsupported'], [503, 'unavailable'], [500, 'failed']])(
    'maps HTTP %s without exposing backend error text', (status, key) => {
      expect(reasoningErrorKey(`HTTP ${status}: private detail`)).toBe(`chat.reasoning.${key}`);
    },
  );
});
