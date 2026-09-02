import { describe, expect, it } from 'vitest';
import { normalizeRpgTranscript } from './rpg-normalization';

describe('RPG transcript normalization', () => {
  it('accepts backend items/next_before shape', () => {
    expect(normalizeRpgTranscript({ items: [{ lane: 'shared', kind: 'resolution', content: 'ok' }], next_before: 'e1', partial_read: true })).toEqual({ entries: [{ lane: 'shared', kind: 'resolution', content: 'ok' }], next_cursor: 'e1', partial_read: true });
  });
  it('drops non-entry values and unknown envelope fields', () => {
    expect(normalizeRpgTranscript({ items: [null, 'secret'], hidden_fact: 'x' })).toEqual({ entries: [], next_cursor: null, partial_read: false });
  });
});
