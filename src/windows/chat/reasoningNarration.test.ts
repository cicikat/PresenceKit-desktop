import { describe, expect, it } from 'vitest';
import { reasoningAnchors, reasoningNarrationText } from './reasoningNarration';
import type { TurnReasoning } from '../../shared/api/turnReasoningState';

describe('reply narration boundaries', () => {
  it('reserves the first local reply before its canonical ID arrives without guessing an API ID', () => {
    const first = { id: 'first', role: 'assistant', wsMsgId: 'transport', reasoningPending: true, isStreaming: true };
    expect([...reasoningAnchors([first, { id: 'other', role: 'assistant', wsMsgId: 'remote' }])]).toEqual(['first']);
    expect([...reasoningAnchors([{ ...first, turnId: 'canonical', isStreaming: false }, { id: 'second', role: 'assistant', turnId: 'canonical' }])]).toEqual(['first']);
  });
  it('groups all paragraphs of one reply without merging adjacent distinct replies', () => {
    const messages = [
      { id: 'user', role: 'user', turnId: 'first' },
      { id: 'a', role: 'assistant', turnId: 'first' },
      { id: 'b', role: 'assistant', turnId: 'first' },
      { id: 'c', role: 'assistant', turnId: 'second' },
      { id: 'd', role: 'assistant', turnId: 'second' },
    ];
    expect([...reasoningAnchors(messages)]).toEqual(['a', 'c']);
    // A delayed paragraph does not add another control or move the existing one.
    expect([...reasoningAnchors([...messages, { id: 'e', role: 'assistant', turnId: 'first' }])]).toEqual(['a', 'c']);
  });

  it('uses explicit historical canonical IDs and ignores old unassociated messages', () => {
    expect([...reasoningAnchors([
      { id: 'old', role: 'assistant' },
      { id: 'blank', role: 'assistant', turnId: ' ' },
      { id: 'stream', role: 'assistant', turnId: 'live', isStreaming: true },
      { id: 'history-1', role: 'assistant', turnId: 'archived' },
      { id: 'history-2', role: 'assistant', turnId: 'archived' },
    ])]).toEqual(['stream', 'history-1']);
  });
});

describe('plain inner thoughts', () => {
  const data: TurnReasoning = {
    turn_id: 'canonical', available: true,
    entries: [1, 2].map(seq => ({
      seq, call_id: `call-${seq}`, created_at: 1, preset: 'private-preset', model: 'private-model',
      protocol: 'chat_completions', status: seq === 1 ? 'interrupted' : 'completed', reasoning_chars: 10,
      parts: [{ source: 'reasoning_content', text: seq === 1 ? '<b>first thought</b>' : 'second thought' }, { source: 'thinking', text: ' ' }],
    })),
  };

  it('keeps every text part in call order without exposing metadata or interpreting HTML', () => {
    expect(reasoningNarrationText(data)).toBe('<b>first thought</b>\n\nsecond thought');
  });

  it('treats unavailable, empty and whitespace-only records as empty', () => {
    expect(reasoningNarrationText({ ...data, available: false })).toBe('');
    expect(reasoningNarrationText({ ...data, entries: [] })).toBe('');
    expect(reasoningNarrationText({ ...data, entries: [{ ...data.entries[0], parts: [{ source: 'thinking', text: ' \n' }] }] })).toBe('');
  });
});
