import { describe, expect, it } from 'vitest';
import { advanceChatRecovery, deliveryFromReceipt, nextChatDelivery, pendingChatIds, recoveredReply, rememberChatRequest, requestForCanonicalReply, safeChatPrefix } from './chatReconciliation';
import { bindHttpReplyIdentity } from './httpReplyIdentity';

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
    expect(deliveryFromReceipt(id, { request_id: id, status: 'interrupted_unknown' })).toBe('interrupted_unknown');
    expect(deliveryFromReceipt(id, { request_id: id, status: 'unknown' })).toBe('unknown');
    expect(deliveryFromReceipt(id, { request_id: id, status: 'failed' })).toBe('failed');
  });

  it('keeps completed without a body locatable for history lookup', () => {
    const reply = recoveredReply(id, { request_id: id, status: 'completed', msg_id: 'wire', turn_id: 'turn' });
    const state = advanceChatRecovery({ delivery: 'unknown' }, 'completed', 'unavailable', reply.identity);
    expect(reply.result).toBeUndefined();
    expect(state.replyIdentity).toEqual({ msg_id: 'wire', turn_id: 'turn' });
    expect(state).toMatchObject({ delivery: 'completed', replyAvailability: 'unavailable' });
  });

  it('converges a bodyless completion with canonical history without another bubble', () => {
    const identity = { msg_id: 'wire', turn_id: 'turn' };
    const rendered = new Map([['wire', ['live-bubble']]]);
    const history = new Map([['turn', ['history-bubble']]]);
    const binding = bindHttpReplyIdentity(identity, new Map(), rendered, new Map(), 200, history);
    expect(binding.fromHistory).toBe(true);
    expect(binding.supersededLocalIds).toEqual(['live-bubble']);
    expect(rendered.get('wire')).toEqual(['history-bubble']);
    const state = advanceChatRecovery({ delivery: 'completed', replyAvailability: 'unavailable', replyIdentity: identity },
      'completed', 'rendered', { msg_id: 'wire' });
    expect(state).toMatchObject({ delivery: 'completed', replyAvailability: 'rendered' });
    expect(state.replyIdentity).toEqual(identity);
    expect(advanceChatRecovery(state, 'processing')).toBe(state);
    expect(advanceChatRecovery(state, 'completed', 'unavailable').replyAvailability).toBe('rendered');
  });

  it('binds a recoverable result to the receipt and rejects conflicting IDs or control text', () => {
    const result = { reply: 'Visible reply', emotion: 'neutral', msg_id: 'wire', turn_id: 'turn' };
    expect(recoveredReply(id, { request_id: id, status: 'completed', result }).result)
      .toEqual({ ...result, request_id: id });
    for (const invalid of [
      { ...result, request_id: other }, { ...result, msg_id: 'other-wire' },
      { ...result, turn_id: 'other-turn' }, { ...result, reply: 'Visible __TOOL_CALL__:[]' },
    ]) {
      expect(recoveredReply(id, { request_id: id, status: 'completed', msg_id: 'wire', turn_id: 'turn', result: invalid }).result).toBeUndefined();
    }
    expect(recoveredReply(id, { request_id: other, status: 'completed', result }).result).toBeUndefined();
  });

  it('does not associate a different request through a reused canonical message ID', () => {
    const identities = new Map([[id, { msg_id: 'wire', turn_id: 'turn' }]]);
    expect(requestForCanonicalReply('wire', undefined, identities)).toBe(id);
    expect(requestForCanonicalReply('wire', id, identities)).toBe(id);
    expect(requestForCanonicalReply('wire', other, identities)).toBeUndefined();
    expect(requestForCanonicalReply('other-wire', id, identities)).toBeUndefined();
  });

  it.each(['failed', 'interrupted_unknown', 'unknown'] as const)('never treats %s as a reply', status => {
    const delivery = deliveryFromReceipt(id, { request_id: id, status });
    expect(recoveredReply(id, { request_id: id, status, result: { reply: 'untrusted', emotion: 'neutral' } }).result).toBeUndefined();
    expect(nextChatDelivery(delivery, 'unknown')).toBe(delivery);
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
