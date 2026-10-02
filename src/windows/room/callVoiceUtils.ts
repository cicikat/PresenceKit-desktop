// Pure helpers for continuous-call voice segmentation (kept free of React for tests).

/** Auto-send waits until the user has been quiet this long (tunable). */
export const AUTO_SEND_QUIET_MS = 1_500;

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;

/** Join transcript pieces; no space when both sides of the seam are CJK. */
export function joinTranscript(prev: string, next: string): string {
  if (!prev) return next;
  if (!next) return prev;
  const a = prev[prev.length - 1];
  const b = next[0];
  if (/\s/.test(a) || /\s/.test(b)) return prev + next;
  return CJK.test(a) && CJK.test(b) ? prev + next : `${prev} ${next}`;
}

export interface CallVoiceActivity {
  transcribing: boolean;
  pendingCount: number;
  isVoiceActive: boolean;
  lastVoiceAt: number;
}

export function canAutoSend(a: CallVoiceActivity, now: number, quietMs = AUTO_SEND_QUIET_MS): boolean {
  return !a.transcribing && a.pendingCount === 0 && !a.isVoiceActive && now - a.lastVoiceAt >= quietMs;
}

/** Whether to cut the current segment now (4s soft + short pause, 8s hard cap). */
export function shouldCutSegment(
  elapsed: number, sinceVoice: number, voicedFrames: number,
  opts = { minMs: 1_200, endSilenceMs: 900, softMs: 4_000, softPauseMs: 300, hardMs: 8_000 },
): boolean {
  if (elapsed >= opts.hardMs) return true;
  if (voicedFrames < 3) return false;
  if (elapsed >= opts.minMs && sinceVoice >= opts.endSilenceMs) return true;
  return elapsed >= opts.softMs && sinceVoice >= opts.softPauseMs;
}
