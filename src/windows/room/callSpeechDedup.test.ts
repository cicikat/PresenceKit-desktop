import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimSpeech, getSpeechStats, resetSpeechDedupForTests } from './callSpeechDedup';

describe('callSpeechDedup', () => {
  beforeEach(() => {
    resetSpeechDedupForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('lets a msg_id through once and counts the repeat as a hit', () => {
    expect(claimSpeech('m1', 2)).toBe(true);
    expect(claimSpeech('m1', 2)).toBe(false);
    expect(getSpeechStats()).toEqual({ enqueued: 1, duplicateHits: 1, lines: 2 });
  });

  it('keeps ids across separate presenter mounts (module scope, not per-mount)', () => {
    const firstMount = (id: string) => claimSpeech(id, 1);
    const secondMount = (id: string) => claimSpeech(id, 1);
    expect(firstMount('m-remount')).toBe(true);
    expect(secondMount('m-remount')).toBe(false);
  });

  it('never resurrects an old id just because the call produced many messages', () => {
    const t0 = 1_000_000;
    expect(claimSpeech('first', 1, t0)).toBe(true);
    for (let i = 0; i < 500; i += 1) claimSpeech(`filler-${i}`, 1, t0 + i);
    expect(claimSpeech('first', 1, t0 + 1_000)).toBe(false);
  });

  it('forgets an id only after the time window has passed', () => {
    const t0 = 5_000_000;
    expect(claimSpeech('old', 1, t0)).toBe(true);
    expect(claimSpeech('old', 1, t0 + 6 * 60 * 60 * 1000 + 1)).toBe(true);
  });
});
