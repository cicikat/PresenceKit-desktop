import { describe, expect, it } from 'vitest';
import {
  isFollowingGlobal,
  resolveGlobalRoutingDisplay,
} from './characterModelRoutingDisplay';

const profiles = [
  { name: 'default', categories: { chat: 'deepseek-default' } },
  { name: 'gpt-main', categories: { chat: 'gpt' } },
];

describe('character model routing display', () => {
  it('keeps an unset character binding distinct from a profile named default', () => {
    expect(isFollowingGlobal(null)).toBe(true);
    expect(isFollowingGlobal(undefined)).toBe(true);
    expect(isFollowingGlobal('default')).toBe(false);
  });

  it('resolves the active global profile for the inherit option label', () => {
    expect(resolveGlobalRoutingDisplay(profiles, 'gpt-main')).toEqual({
      profile: 'gpt-main',
      chatPreset: 'gpt',
    });
  });
});
