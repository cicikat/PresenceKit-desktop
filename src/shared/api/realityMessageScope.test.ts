import { describe, expect, it } from 'vitest';
import { isSingleRealityMessage, isSingleRealityStream } from './realityMessageScope';

describe('single reality routing', () => {
  it('accepts legacy and current-character reality messages', () => {
    expect(isSingleRealityMessage({}, 'a')).toBe(true);
    expect(isSingleRealityMessage({ source: 'reality', domain: 'reality', char_id: 'a' }, 'a')).toBe(true);
  });
  it('rejects group streams even when the speaker is the active character', () => {
    expect(isSingleRealityMessage({ source: 'reality', domain: 'reality', char_id: 'a', round_id: 'group-round' }, 'a')).toBe(false);
    expect(isSingleRealityMessage({ round_id: 'group-round', char_id: 'b' }, 'a')).toBe(false);
  });
  it('rejects dream and stale character events before they create bubbles or notifications', () => {
    expect(isSingleRealityMessage({ source: 'dream' }, 'a')).toBe(false);
    expect(isSingleRealityMessage({ domain: 'dream' }, 'a')).toBe(false);
    expect(isSingleRealityMessage({ char_id: 'b' }, 'a')).toBe(false);
    expect(isSingleRealityMessage({ char_id: 'b' }, '')).toBe(false);
  });
});

describe('single reality stream routing', () => {
  it('rejects the legacy Dream/coplay broadcast even with transport source=reality', () => {
    expect(isSingleRealityStream({ char_id: 'a', source: 'reality' }, 'a')).toBe(false);
    expect(isSingleRealityStream({ char_id: 'a' }, 'a')).toBe(false);
  });

  it('accepts owner streams and explicitly scoped current-character reality streams', () => {
    expect(isSingleRealityStream({}, 'a')).toBe(true);
    expect(isSingleRealityStream({ source: 'reality' }, 'a')).toBe(true);
    expect(isSingleRealityStream({ source: 'reality', domain: 'reality', char_id: 'a' }, 'a')).toBe(true);
    expect(isSingleRealityMessage({ source: 'reality', char_id: 'a' }, 'a')).toBe(true);
  });

  it('rejects Dream, group and stale-character streams', () => {
    expect(isSingleRealityStream({ source: 'reality', domain: 'dream', char_id: 'a' }, 'a')).toBe(false);
    expect(isSingleRealityStream({ source: 'dream' }, 'a')).toBe(false);
    expect(isSingleRealityStream({ domain: 'reality', char_id: 'a', round_id: 'round' }, 'a')).toBe(false);
    expect(isSingleRealityStream({ domain: 'reality', char_id: 'b' }, 'a')).toBe(false);
  });
});
