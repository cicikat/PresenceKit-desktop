import type { Mood } from '../state/store';

export const MOOD_TO_EXPRESSION: Record<Mood, string> = {
  '平静': 'neutral',
  '开心': 'happy',
  '低落': 'sad',
  '病娇': 'yandere',
  '分心': 'thinking',
  '生气': 'angry',
  '惊讶': 'surprised',
};

export const MOOD_PARAMS: Record<Mood, Record<string, number>> = {
  '平静': {},
  '开心': { ParamMouthForm: 1, ParamEyeLSmile: 1, ParamEyeRSmile: 1 },
  '低落': { ParamMouthForm: -1, ParamBrowLY: -0.6, ParamBrowRY: -0.6 },
  '病娇': { ParamMouthForm: 0.6, ParamCheek: 1 },
  '分心': { ParamEyeBallX: 0.6, ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7 },
  '生气': { ParamBrowLAngle: -1, ParamBrowRAngle: -1, ParamMouthForm: -0.8 },
  '惊讶': { ParamEyeLOpen: 1.4, ParamEyeROpen: 1.4, ParamMouthOpenY: 0.5 },
};

function stripExt(name: string): string {
  return name.replace(/\.exp3\.json$/i, '').replace(/\.json$/i, '');
}

// Matches a mood's target expression name against a model's available expression names —
// case-insensitive, extension-agnostic (pixi-live2d-display expression names come from the
// `.exp3.json` Name field, but some model packs reuse the file name instead).
export function matchExpressionName(available: string[], mood: Mood): string | null {
  const target = MOOD_TO_EXPRESSION[mood]?.toLowerCase();
  if (!target) return null;
  for (const name of available) {
    if (stripExt(name).toLowerCase() === target) return name;
  }
  return null;
}
