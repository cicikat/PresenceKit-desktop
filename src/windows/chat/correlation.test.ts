import { describe, expect, it } from 'vitest';
import { findRenderedFallback, hasRegisteredMessage, matchesCorrelation, prunePendingSegments, pruneRenderedFallbacks, setBoundedMapEntry } from './correlation';

describe('chat correlation contract', () => {
  it('lets WS cancel a pending HTTP fallback by msg_id', () => {
    expect(matchesCorrelation({ msgId: 'm1', normalizedHash: 'same' }, 'm1', 'other')).toBe(true);
  });
  it('finds an already-rendered HTTP fallback when WS arrives later', () => {
    const record = { msgId: 'm1', normalizedHash: 'same', renderedAt: 10, ids: ['a'] };
    expect(findRenderedFallback([record], 'm1', 'other', 20)).toBe(record);
  });
  it('uses a hash for legacy HTTP replies without msg_id', () => {
    expect(matchesCorrelation({ normalizedHash: 'legacy' }, 'ws-id', 'legacy')).toBe(true);
  });
  it('keeps early segments until their channel message can claim them', () => {
    const pending = new Map([['m1', { receivedAt: 100 }]]);
    prunePendingSegments(pending, 100 + 5 * 60_000 - 1);
    expect(pending.has('m1')).toBe(true);
  });
  it('expires parked segments and rendered fallbacks, and bounds maps', () => {
    const pending = new Map([['old', { receivedAt: 0 }], ['new', { receivedAt: 100 }]]);
    prunePendingSegments(pending, 5 * 60_000 + 1);
    expect([...pending.keys()]).toEqual(['new']);
    expect(pruneRenderedFallbacks([{ renderedAt: 0 }], 15_001)).toEqual([]);
    const map = new Map<string, string>();
    setBoundedMapEntry(map, 'a', 'a', 2); setBoundedMapEntry(map, 'b', 'b', 2); setBoundedMapEntry(map, 'c', 'c', 2);
    expect([...map.keys()]).toEqual(['b', 'c']);
  });
  it('deduplicates a repeated channel message through its registered msg_id', () => {
    const mappings = new Map<string, string[]>();
    expect(hasRegisteredMessage(mappings, 'm1')).toBe(false);
    setBoundedMapEntry(mappings, 'm1', ['bubble'], 200);
    expect(hasRegisteredMessage(mappings, 'm1')).toBe(true);
    expect(hasRegisteredMessage(mappings, undefined)).toBe(false);
  });
});
