import type { StatusPresenterSnapshot } from './presenters/types';

export const STATUS_SUBREGION_IDS = {
  mood: 'chat.sidebar.status.mood',
  activity: 'chat.sidebar.status.activity',
  timeline: 'chat.sidebar.status.timeline',
} as const;

export type StatusSubregion = keyof typeof STATUS_SUBREGION_IDS;

export const STATUS_CSS_VARIABLES = [
  '--status-mood-hue',
  '--status-aura',
  '--status-breath',
  '--status-gaze-lock',
  '--status-rhythm',
  '--status-indicator-size',
  '--status-glow-x',
  '--status-glow-y',
] as const;

export type StatusCssVariable = typeof STATUS_CSS_VARIABLES[number];
export type StatusHookStyle = Record<StatusCssVariable, string>;

/**
 * The parent owns the retry banner. The three child mounts own all visual
 * regions; presence and telemetry stay grouped with their nearest semantic
 * child because they are not separate attachment primitives.
 */
export const STATUS_RENDERER_CONTRACT = {
  parentId: 'chat.sidebar.status',
  subregions: {
    mood: { id: STATUS_SUBREGION_IDS.mood, regions: ['mood'] },
    activity: { id: STATUS_SUBREGION_IDS.activity, regions: ['activity', 'presence'] },
    timeline: { id: STATUS_SUBREGION_IDS.timeline, regions: ['telemetry', 'timeline'] },
  },
  composition: {
    'official-renderer': { attach: ['chat.sidebar.status'], fallback: 'whole-status' },
    subregions: { attach: Object.values(STATUS_SUBREGION_IDS), fallback: 'unattached-child' },
    'presenter-only': { attach: [], fallback: 'presenter-owned' },
  },
} as const;

export function createStatusHookStyle(snapshot: StatusPresenterSnapshot): StatusHookStyle {
  const hue = finiteOr(snapshot.mood.hue, 70);
  const aura = finiteOr(snapshot.telemetry.moodAura, 20);
  const breath = finiteOr(snapshot.telemetry.breath, 50);
  const gazeLock = finiteOr(snapshot.telemetry.gazeLock, 50);
  const rhythm = finiteOr(snapshot.telemetry.rhythm, 0);
  return {
    '--status-mood-hue': String(hue),
    '--status-aura': String(aura),
    '--status-breath': String(breath),
    '--status-gaze-lock': String(gazeLock),
    '--status-rhythm': String(rhythm),
    '--status-indicator-size': `${8 + aura / 18}px`,
    '--status-glow-x': '75%',
    '--status-glow-y': '25%',
  };
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
