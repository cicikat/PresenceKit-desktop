import type { Mood } from '../../shared/state/store';

export const MOOD_MORPHS: Record<Mood, { primary: Record<string, number>; fallback: Record<string, number> }> = {
  '平静': { primary: {},                          fallback: {} },
  '开心': { primary: { smile: 0.85 },             fallback: { smile: 0.85 } },
  '低落': { primary: { sad: 0.7 },                fallback: { smile: 0.0, blink: 0.22 } },
  '病娇': { primary: { smile: 0.5, blush: 0.6 },  fallback: { smile: 0.5, blink: 0.15 } },
  '分心': { primary: { blink: 0.25 },             fallback: { blink: 0.25 } },
  '生气': { primary: { angry: 0.8 },              fallback: { browDown: 0.8 } },
  '惊讶': { primary: { surprised: 0.85 },         fallback: { mouthOpen: 0.5, eyesWide: 0.8 } },
};

// Keys managed by idle/speech drivers — excluded from expression layer resets
export const IDLE_DRIVEN_KEYS = new Set(['hairSwayLeft', 'hairSwayRight', 'hairSway', 'blink', 'mouthOpen']);

// All unique expression morph keys (non-idle-driven)
export const EXPR_KEYS: ReadonlySet<string> = new Set(
  Object.values(MOOD_MORPHS)
    .flatMap(({ primary, fallback }) => [...Object.keys(primary), ...Object.keys(fallback)])
    .filter(k => !IDLE_DRIVEN_KEYS.has(k)),
);
