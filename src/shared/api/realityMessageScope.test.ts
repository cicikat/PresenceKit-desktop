import { describe, expect, it } from 'vitest';
import { isSingleRealityMessage } from './realityMessageScope';

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
