import { describe, expect, it } from 'vitest';
import { attachCanonicalTurn } from '../../shared/api/turnReasoningState';
import { bindHttpReplyIdentity, matchesHistoryReplay } from './httpReplyIdentity';

describe('HTTP reply canonical identity across text, upload and wake', () => {
  it.each(['http-first', 'ws-first', 'stream-first', 'fallback-first'])(
    'preserves distinct transport/canonical IDs and all segments: %s', order => {
      const aliases = new Map<string, string>();
      const rendered = new Map<string, string[]>();
      const streaming = new Map<string, string[]>();
      const messages: Array<{ id: string; role: string; text: string; turnId?: string }> = [
        { id: 'a', role: 'assistant', text: 'one' },
        { id: 'b', role: 'assistant', text: 'two' },
        { id: 'other', role: 'assistant', text: 'one' },
      ];
      if (order === 'ws-first' || order === 'fallback-first') rendered.set('wire', ['a', 'b']);
      if (order === 'stream-first') streaming.set('wire', ['a', 'b']);
      const binding = bindHttpReplyIdentity({ msg_id: 'wire', turn_id: 'turn' }, aliases, rendered, streaming, 200);
      const result = attachCanonicalTurn(messages, binding.localIds, binding.canonicalTurnId);
      expect(binding.msgId).toBe('wire');
      expect(binding.canonicalTurnId).toBe('turn');
      expect(aliases.get('wire')).toBe('turn');
      expect(aliases.has('turn')).toBe(false);
      expect(result.map(item => item.text)).toEqual(['one', 'two', 'one']);
      expect(result[2]).toBe(messages[2]);
      if (order !== 'http-first') expect(result.slice(0, 2).map(item => item.turnId)).toEqual(['turn', 'turn']);
      else expect(binding.localIds).toEqual([]); // Later render reads the registered alias.
    },
  );

  it('does not manufacture reasoning identity from a transport-only response', () => {
    const aliases = new Map<string, string>();
    const binding = bindHttpReplyIdentity({ msg_id: 'wire' }, aliases, new Map(), new Map(), 200);
    expect(binding.canonicalTurnId).toBeUndefined();
    expect(aliases.size).toBe(0);
  });

  it('binds a proven HTTP alias to history and retires provisional stream segments', () => {
    const aliases = new Map<string, string>();
    const rendered = new Map<string, string[]>();
    const history = new Map([['canonical', ['history-a', 'history-b']]]);
    const streams = new Map([['transport', ['live-a', 'live-b']]]);
    const binding = bindHttpReplyIdentity({ msg_id: 'transport', turn_id: 'canonical' },
      aliases, rendered, streams, 200, history);
    expect(binding.localIds).toEqual(['history-a', 'history-b']);
    expect(binding.supersededLocalIds).toEqual(['live-a', 'live-b']);
    expect(binding.fromHistory).toBe(true);
    expect(rendered.get('transport')).toEqual(['history-a', 'history-b']);
    expect(rendered.has('canonical')).toBe(false);
  });

  it('does not confuse an unrelated transport ID with an equal historical turn ID', () => {
    const rendered = new Map<string, string[]>();
    const binding = bindHttpReplyIdentity({ msg_id: 'same-string', turn_id: 'new-turn' },
      new Map(), rendered, new Map(), 200, new Map([['same-string', ['historical']]]));
    expect(binding.fromHistory).toBe(false);
    expect(binding.localIds).toEqual([]);
    expect(rendered.size).toBe(0);
  });

  it('prioritizes explicit canonical identity over equal history content', () => {
    const history = new Map([['old-turn', ['historical']]]);
    expect(matchesHistoryReplay('new-turn', history, true)).toBe(false);
    expect(matchesHistoryReplay('old-turn', history, false)).toBe(true);
    expect(matchesHistoryReplay(undefined, history, true)).toBe(true);
    expect(matchesHistoryReplay(undefined, history, false)).toBe(false);
  });

  it('keeps legacy turn-only transport compatibility explicit and bounds aliases', () => {
    const aliases = new Map<string, string>();
    const bind = (id: string) => bindHttpReplyIdentity({ turn_id: id }, aliases, new Map(), new Map(), 2);
    expect(bind('first')).toMatchObject({ msgId: 'first', canonicalTurnId: 'first' });
    bind('second'); bind('third');
    expect([...aliases.keys()]).toEqual(['second', 'third']);
    expect(bindHttpReplyIdentity({ turn_id: ' ' }, aliases, new Map(), new Map(), 2).canonicalTurnId).toBeUndefined();
  });
});
