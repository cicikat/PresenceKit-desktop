import { describe, expect, it } from 'vitest';
import { belongsToOpenGroupDream, isOpenGroupDreamRound } from './groupDreamRouting';

describe('group Dream WS routing', () => {
  it('only accepts dream-domain message frames', () => {
    expect(belongsToOpenGroupDream('dream', 'round-1', new Set(['round-1']))).toBe(true);
    expect(belongsToOpenGroupDream('reality', 'round-1', new Set(['round-1']))).toBe(false);
    expect(belongsToOpenGroupDream(undefined, 'round-1', new Set(['round-1']))).toBe(false);
  });

  it('rejects another active round once the window has a round correlation', () => {
    expect(belongsToOpenGroupDream('dream', 'round-2', new Set(['round-1']))).toBe(false);
    expect(belongsToOpenGroupDream('dream', undefined, new Set(['round-1']))).toBe(true);
  });

  it('routes round frames by both group and domain', () => {
    expect(isOpenGroupDreamRound('g-1', 'g-1', 'dream')).toBe(true);
    expect(isOpenGroupDreamRound('g-2', 'g-1', 'dream')).toBe(false);
    expect(isOpenGroupDreamRound('g-1', 'g-1', 'reality')).toBe(false);
  });
});
