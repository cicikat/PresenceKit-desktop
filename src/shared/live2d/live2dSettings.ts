import { getUIPref, setUIPref } from '../uiPreferences';

export type Live2DBgKind = 'transparent' | 'color' | 'image';

export interface Live2DSettings {
  modelDir: string;
  scaleMul: number;
  offset: [number, number];
  bgKind: Live2DBgKind;
  bgColor: string;
  bgImage: string | null;
  lipsyncStrength: number;
  idleMotionGroup: string;
  mouthParam: string;
}

export const DEFAULT_LIVE2D_SETTINGS: Live2DSettings = {
  modelDir: '',
  scaleMul: 1,
  offset: [0, 0],
  bgKind: 'color',
  bgColor: '#1a1d26',
  bgImage: null,
  lipsyncStrength: 0.8,
  idleMotionGroup: 'Idle',
  mouthParam: 'ParamMouthOpenY',
};

const STORAGE_KEY = 'live2d.settings';
const CHANGE_EVENT = 'emerald:live2d-settings';

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}

function isHex(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s);
}

function validateOffset(v: unknown): [number, number] {
  if (Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'number')) {
    return [clamp(v[0], -1, 1), clamp(v[1], -1, 1)];
  }
  return [0, 0];
}

function validate(raw: unknown): Live2DSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    modelDir: typeof r.modelDir === 'string' ? r.modelDir : DEFAULT_LIVE2D_SETTINGS.modelDir,
    scaleMul: clamp(typeof r.scaleMul === 'number' ? r.scaleMul : DEFAULT_LIVE2D_SETTINGS.scaleMul, 0.2, 3),
    offset: validateOffset(r.offset),
    bgKind: (['transparent', 'color', 'image'] as const).includes(r.bgKind as Live2DBgKind)
      ? (r.bgKind as Live2DBgKind)
      : DEFAULT_LIVE2D_SETTINGS.bgKind,
    bgColor: isHex(r.bgColor) ? r.bgColor : DEFAULT_LIVE2D_SETTINGS.bgColor,
    bgImage: typeof r.bgImage === 'string' && r.bgImage ? r.bgImage : null,
    lipsyncStrength: clamp(
      typeof r.lipsyncStrength === 'number' ? r.lipsyncStrength : DEFAULT_LIVE2D_SETTINGS.lipsyncStrength,
      0, 1,
    ),
    idleMotionGroup: typeof r.idleMotionGroup === 'string' && r.idleMotionGroup
      ? r.idleMotionGroup
      : DEFAULT_LIVE2D_SETTINGS.idleMotionGroup,
    mouthParam: typeof r.mouthParam === 'string' && r.mouthParam
      ? r.mouthParam
      : DEFAULT_LIVE2D_SETTINGS.mouthParam,
  };
}

export function loadLive2DSettings(): Live2DSettings {
  return validate(getUIPref<unknown>(STORAGE_KEY, {}));
}

export function saveLive2DSettings(settings: Live2DSettings): void {
  setUIPref<Live2DSettings>(STORAGE_KEY, settings);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: settings }));
}

export function subscribeLive2DSettings(fn: (s: Live2DSettings) => void): () => void {
  const onCustom = (e: Event) => fn(validate((e as CustomEvent).detail));
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'emerald.ui.' + STORAGE_KEY) fn(loadLive2DSettings());
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
