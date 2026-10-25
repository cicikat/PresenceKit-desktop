import { describe, expect, it } from 'vitest';
import { createAvatarDirectiveGate } from './avatarDirectiveGate';

const directive = (overrides: Record<string, unknown> = {}) => ({ type: 'avatar_directive',
  char_id: 'a', version: 3, source_at: 100, source_turn_id: 'turn', expires_at: 106,
  expression: 'happy', ttl_ms: 6000, ...overrides });

describe('source-bound avatar expression', () => {
  it('rejects another character, expiry, malformed metadata and duplicate delivery', () => {
    const accept = createAvatarDirectiveGate();
    expect(accept(directive(), 'b', 101)).toBe(false);
    expect(accept(directive(), 'a', 107)).toBe(false);
    expect(accept(directive({ version: NaN }), 'a', 101)).toBe(false);
    expect(accept(directive(), 'a', 101)).toBe(true);
    expect(accept(directive(), 'a', 101)).toBe(false);
    expect(accept(directive({ version: 2, source_at: 99 }), 'a', 101)).toBe(false);
  });
  it('shortens TTL on delivery and accepts new turns, separate characters and legacy', () => {
    const accept = createAvatarDirectiveGate();
    const delayed = directive();
    expect(accept(delayed, 'a', 104)).toBe(true);
    expect(delayed.ttl_ms).toBe(2000);
    expect(accept(directive({ source_at: 101, version: 4 }), 'a', 104)).toBe(true);
    expect(accept(directive({ char_id: 'b' }), 'b', 104)).toBe(true);
    expect(accept({ type: 'avatar_directive', expression: 'gentle' }, 'a', 104)).toBe(true);
    expect(accept({ type: 'open_url' }, 'a', 104)).toBe(true);
  });
});
