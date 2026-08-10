import type { DreamExitResponse, DreamResumeResponse, DreamWakeResponse } from '../../shared/api/dream-types';

/** A close is accepted only after the backend proves close/archive completion. */
export function isConfirmedDreamClose(response: DreamWakeResponse | DreamExitResponse): boolean {
  if ('retained' in response) {
    if (response.retained) return false;
    const closed = response as Extract<DreamWakeResponse, { retained: false }>;
    return closed.closed_now === true
      || (closed.already_closed === true && closed.archive_ok !== false);
  }
  return response.closed_now === true
    || (response.already_closed === true && response.archive_ok !== false);
}

export function isDreamResumeSuccess(response: DreamResumeResponse): boolean {
  return response.ok === true && response.resumed !== false;
}

export function isDreamTransitionRetryable(response: DreamWakeResponse | DreamExitResponse): boolean {
  return !isConfirmedDreamClose(response)
    || ('archive_ok' in response && response.archive_ok === false);
}
