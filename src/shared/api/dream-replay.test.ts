import { describe, expect, it } from 'vitest';
import { normalizeDreamArchiveDetail, normalizeDreamArchiveList } from './dream-replay';

describe('dream archive normalization', () => {
  it('preserves RPG replay lane metadata without exposing unknown fields', () => {
    const result = normalizeDreamArchiveDetail({ dream_id: 'rpg1', char_id: 'c1', metadata: { dream_id: 'rpg1' }, messages: [{ role: 'assistant', content: 'result', lane: 'shared', kind: 'resolution', correlation_id: 'corr1', hidden_fact: 'no' }] });
    expect(result?.messages[0]).toMatchObject({ lane: 'shared', kind: 'resolution', correlation_id: 'corr1' });
    expect(result?.messages[0]).not.toHaveProperty('hidden_fact');
  });
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

  it('normalizes canonical segments and falls back on an unknown segment type', () => {
    const result = normalizeDreamArchiveDetail({
      dream_id: 'replay_segments',
      char_id: 'dreamer',
      metadata: { dream_id: 'replay_segments', char_id: 'dreamer' },
      messages: [
        {
          role: 'assistant',
          content: '<say>hello</say>',
          segmented_content: 'hello',
          segments: [{ type: 'say', text: 'hello' }],
        },
        {
          role: 'assistant',
          content: 'legacy',
          segmented_content: 'unsafe projection',
          segments: [{ type: 'unknown', text: 'do not render' }],
        },
      ],
    });

    expect(result?.messages[0]).toMatchObject({
      segments: [{ type: 'say', text: 'hello' }],
      segmented_content: 'hello',
    });
    expect(result?.messages[1]).toMatchObject({
      content: 'legacy',
      segmented_content: 'legacy',
      segment_parse_fallback: true,
    });
    expect(result?.messages[1]).not.toHaveProperty('segments');
  });

  it('fails closed when detail metadata is absent', () => {
    expect(normalizeDreamArchiveDetail({ dream_id: 'missing', messages: [] })).toBeNull();
  });
});
