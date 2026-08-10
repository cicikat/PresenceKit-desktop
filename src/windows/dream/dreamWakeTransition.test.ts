import { describe, expect, it } from 'vitest';
import type { DreamExitResponse, DreamWakeResponse } from '../../shared/api/dream-types';
import { isConfirmedDreamClose, isDreamResumeSuccess, isDreamTransitionRetryable } from './dreamWakeTransition';

describe('Dream WAKE transition contract', () => {
  it('accepts only a backend-confirmed close or archived idempotent result', () => {
    const closed: DreamWakeResponse = {
      retained: false,
      exited: true,
      closed_now: true,
      archive_ok: true,
    };
    const alreadyClosed: DreamExitResponse = {
      ok: true,
      exited: true,
      already_closed: true,
      archive_ok: true,
    };
    expect(isConfirmedDreamClose(closed)).toBe(true);
    expect(isConfirmedDreamClose(alreadyClosed)).toBe(true);
  });

  it('keeps the window open when archive completion is unknown or failed', () => {
    const pending: DreamWakeResponse = { retained: false, exited: false, archive_ok: false };
    const legacyUnknown: DreamExitResponse = { ok: true, exited: true, already_closed: true, archive_ok: false };
    expect(isConfirmedDreamClose(pending)).toBe(false);
    expect(isConfirmedDreamClose(legacyUnknown)).toBe(false);
    expect(isDreamTransitionRetryable(pending)).toBe(true);
  });

  it('requires resume acknowledgement before clearing retention UI', () => {
    expect(isDreamResumeSuccess({ ok: true, resumed: true })).toBe(true);
    expect(isDreamResumeSuccess({ ok: true, resumed: false })).toBe(false);
    expect(isDreamResumeSuccess({ ok: false, resumed: false })).toBe(false);
  });
});
