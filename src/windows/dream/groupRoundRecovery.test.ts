import { describe, expect, it } from 'vitest';
import { GROUP_DREAM_ROUND_RECOVERY_DELAY_MS, isTerminalGroupDreamRound, terminalGroupDreamRoundError } from './groupRoundRecovery';

describe('group dream round recovery', () => {
  it('waits for the backend whole-round timeout plus a 30 second buffer', () => {
    expect(GROUP_DREAM_ROUND_RECOVERY_DELAY_MS).toBe(120_000);
  });

  it('only releases a round after the state endpoint reports a terminal status', () => {
    expect(isTerminalGroupDreamRound({ round_status: 'running' })).toBe(false);
    expect(isTerminalGroupDreamRound({ round_status: 'idle' })).toBe(true);
    expect(isTerminalGroupDreamRound({ round_status: 'failed' })).toBe(true);
    expect(isTerminalGroupDreamRound({ round_status: 'timed_out' })).toBe(true);
  });

  it('turns backend terminal errors into a concise status category', () => {
    expect(terminalGroupDreamRoundError({ round_status: 'timed_out', last_round_error: 'timeout' })).toBe('timed_out');
    expect(terminalGroupDreamRoundError({ round_status: 'failed', last_round_error: 'failed' })).toBe('failed');
    expect(terminalGroupDreamRoundError({ round_status: 'idle', last_round_error: null })).toBeNull();
  });
});
