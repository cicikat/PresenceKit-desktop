import { describe, expect, it } from 'vitest';
import { deliveryFromReceipt, nextChatDelivery, pendingChatIds, rememberChatRequest, safeChatPrefix } from './chatReconciliation';

const id = 'dc-1794450000000-1234567890abcdef1234567890abcdef';
const other = 'dc-1794450000001-1234567890abcdef1234567890abcdef';

describe('desktop chat reconciliation', () => {
  it('keeps a late canonical completion when the HTTP waiter or an old poll reports an interruption', () => {
    const completed = nextChatDelivery('unknown', 'completed');
    expect(nextChatDelivery(completed, 'unknown')).toBe('completed');
    expect(nextChatDelivery(completed, deliveryFromReceipt(id, { request_id: id, status: 'running' }))).toBe('completed');
    expect(nextChatDelivery(completed, 'completed')).toBe('completed');
  });

  it('keeps unverified or uncorrelated responses unknown, including after restart', () => {
    expect(deliveryFromReceipt(id, { request_id: other, status: 'completed' })).toBe('unknown');
    expect(deliveryFromReceipt(id, { request_id: id, status: 'interrupted_unknown' })).toBe('unknown');
    expect(deliveryFromReceipt(id, { request_id: id, status: 'unknown' })).toBe('unknown');
    expect(deliveryFromReceipt(id, { request_id: id, status: 'failed' })).toBe('failed');
  });

  it('recovers only pending identities for the same backend from shared storage', () => {
    const disk = new Map<string, string>();
    const reopen = () => ({
      getItem: (key: string) => disk.get(key) ?? null,
      setItem: (key: string, value: string) => { disk.set(key, value); },
    });
    rememberChatRequest(reopen(), 'https://example.test', id, true);
    expect(pendingChatIds(reopen(), 'https://other.test')).toEqual([]);
    expect(pendingChatIds(reopen(), 'https://example.test')).toEqual([id]);
    rememberChatRequest(reopen(), 'https://example.test', id, false);
    expect(pendingChatIds(reopen(), 'https://example.test')).toEqual([]);
  });

  it.each(['__TOOL_CALL__:[{"name":"fixture"}]', '<tool_call>{}</tool_call>', '<｜tool▁calls▁begin｜>'])(
    'never renders a protocol prefix from an older streaming server', control => {
      const prefix = 'Visible text. ';
      for (let length = 1; length <= control.length; length++) {
        expect(safeChatPrefix(prefix + control.slice(0, length), true)).toBe(prefix);
      }
    },
  );
});
