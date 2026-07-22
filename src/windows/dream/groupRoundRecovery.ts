import type { DreamGroupState } from '../../shared/api/dream-types';

/** Must track core.stage.dream_runtime._DREAM_STAGE_TURN_TIMEOUT_S (90s). */
export const GROUP_DREAM_STAGE_TURN_TIMEOUT_MS = 90_000;
export const GROUP_DREAM_ROUND_RECOVERY_DELAY_MS = GROUP_DREAM_STAGE_TURN_TIMEOUT_MS + 30_000;

export type TerminalGroupDreamRoundStatus = 'idle' | 'failed' | 'timed_out';

export function isTerminalGroupDreamRound(state: Pick<DreamGroupState, 'round_status'>): boolean {
  return state.round_status === 'idle'
    || state.round_status === 'failed'
    || state.round_status === 'timed_out';
}

export function terminalGroupDreamRoundError(
  state: Pick<DreamGroupState, 'round_status' | 'last_round_error'>,
): TerminalGroupDreamRoundStatus | null {
  if (!isTerminalGroupDreamRound(state) || !state.last_round_error) return null;
  return state.round_status === 'timed_out' || state.last_round_error === 'timeout'
    ? 'timed_out'
    : 'failed';
}
