import { describe, expect, it } from 'vitest';
import { normalizeDreamArchiveDetail, normalizeDreamArchiveList } from './dream-replay';

describe('dream archive normalization', () => {
  it('keeps safe list metadata and tolerates legacy omissions', () => {
    const result = normalizeDreamArchiveList({
      char_id: 'dreamer',
      items: [{ dream_id: 'legacy_1', valid_turns: 3, summary_present: false }],
      offset: 0,
      limit: 20,
      total: 1,
      has_more: false,
      path: 'must not be copied',
    });

    expect(result.items[0]).toMatchObject({
      dream_id: 'legacy_1',
      char_id: 'unknown',
      valid_turns: 3,
      dream_mode: 'unknown',
      completion: 'unknown',
    });
    expect(result).not.toHaveProperty('path');
  });

  it('maps only replay roles and strips archive-only fields', () => {
    const result = normalizeDreamArchiveDetail({
      dream_id: 'replay_1',
      char_id: 'dreamer',
      metadata: { dream_id: 'replay_1', char_id: 'dreamer', summary_present: true },
      messages: [
        { role: 'user', content: 'hello', ts: 100, hidden_state: 'secret' },
        { role: 'assistant', content: 'reply', ts: 101, prompt: 'secret' },
        { role: 'tool', content: 'not for replay', ts: 102 },
        { role: 'assistant', content: '' },
      ],
      partial_read: false,
    });

    expect(result?.messages).toEqual([
      { role: 'user', content: 'hello', ts: 100 },
      { role: 'assistant', content: 'reply', ts: 101 },
    ]);
  });

  it('fails closed when detail metadata is absent', () => {
    expect(normalizeDreamArchiveDetail({ dream_id: 'missing', messages: [] })).toBeNull();
  });
});
