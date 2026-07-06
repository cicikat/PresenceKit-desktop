import { listUserFonts, userFontFamily, userFontUrl } from './fontAppearance';
import { getUIPref, setUIPref } from './uiPreferences';

export interface DreamFontOption {
  fileName: string;
  label: string;
  url: string;
}

export interface DreamAppearance {
  chatFontSize: number;
  themeFontSize: number;
  fontFile: string | null;
  accentColor: string;
  savedColors: string[];
  backgroundBlur: number;
  colorOverridesDay: Record<string, string>;
  colorOverridesNight: Record<string, string>;
}

const DEFAULT_APPEARANCE: DreamAppearance = {
  chatFontSize: 15,
  themeFontSize: 14,
  fontFile: null,
  accentColor: '#8f78d6',
  savedColors: [],
  backgroundBlur: 18,
  colorOverridesDay: {},
  colorOverridesNight: {},
};

// Canonical key sets for the day/night color overrides — also the defaults shown in
// DreamPrefsPane's color editor. Anything outside these keys in a loaded override map
// is stale/corrupt data (e.g. the 2026-07 identifier-change incident, see known-issues.md)
// and gets dropped on load rather than silently rendered.
export const DREAM_DAY_DEFAULTS: Record<string, string> = {
  '--dt-bg-1': '#f8f3e9', '--dt-bg-2': '#f0e7f3', '--dt-bg-3': '#ebf5f2',
  '--dt-ink': '#48404e', '--dt-ink-2': '#716679', '--dt-ink-3': '#9a8fa0', '--dt-ink-4': '#c8becb',
  '--dt-flower-dandelion': '#d6b6ef', '--dt-flower-rose': '#efa5a2',
  '--dt-flower-bluebell': '#accbe9', '--dt-flower-daisy': '#ead884', '--dt-flower-sun': '#efd477',
  '--dt-accent-rose': '#e96c6c', '--dt-accent-violet': '#b97fe8', '--dt-accent-azure': '#7fbfe8',
};

export const DREAM_NIGHT_DEFAULTS: Record<string, string> = {
  '--dt-bg-1': '#0b1020', '--dt-bg-2': '#11182b', '--dt-bg-3': '#151d32',
  '--dt-ink': '#d9dce8', '--dt-ink-2': '#a7aec3', '--dt-ink-3': '#8a90a8', '--dt-ink-4': '#6a7090',
  '--dt-flower-dandelion': '#8f78d6', '--dt-flower-rose': '#efa5a2',
  '--dt-flower-bluebell': '#7cb8ff', '--dt-flower-daisy': '#ead884', '--dt-flower-sun': '#efd477',
  '--dt-accent-rose': '#e96c6c', '--dt-accent-violet': '#b97fe8', '--dt-accent-azure': '#7fbfe8',
};

function pruneUnknownKeys(overrides: Record<string, string>, allowed: Record<string, string>): Record<string, string> {
  const pruned: Record<string, string> = {};
  for (const key of Object.keys(overrides)) {
    if (key in allowed) pruned[key] = overrides[key];
  }
  return pruned;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function isColorOverrideMap(v: unknown): v is Record<string, string> {
  if (typeof v !== 'object' || v === null) return false;
  return Object.values(v).every(val => typeof val === 'string');
}

export function loadDreamAppearance(): DreamAppearance {
  const saved = getUIPref<Partial<DreamAppearance>>('dream.appearance', {});
  return {
    chatFontSize: clamp(saved.chatFontSize, DEFAULT_APPEARANCE.chatFontSize, 11, 24),
    themeFontSize: clamp(saved.themeFontSize, DEFAULT_APPEARANCE.themeFontSize, 11, 22),
    fontFile: typeof saved.fontFile === 'string' ? saved.fontFile : null,
    accentColor: isHexColor(saved.accentColor) ? saved.accentColor : DEFAULT_APPEARANCE.accentColor,
    savedColors: Array.isArray(saved.savedColors) ? saved.savedColors.filter(isHexColor) : [],
    backgroundBlur: clamp(saved.backgroundBlur, DEFAULT_APPEARANCE.backgroundBlur, 0, 36),
    colorOverridesDay: isColorOverrideMap(saved.colorOverridesDay)
      ? pruneUnknownKeys(saved.colorOverridesDay, DREAM_DAY_DEFAULTS)
      : {},
    colorOverridesNight: isColorOverrideMap(saved.colorOverridesNight)
      ? pruneUnknownKeys(saved.colorOverridesNight, DREAM_NIGHT_DEFAULTS)
      : {},
  };
}

export function saveDreamAppearance(appearance: DreamAppearance): void {
  setUIPref('dream.appearance', appearance);
}

export async function listDreamFonts(): Promise<DreamFontOption[]> {
  return listUserFonts<DreamFontOption>();
}

export function dreamFontFamily(fileName: string | null): string | null {
  return userFontFamily('DreamUserFont', fileName);
}

export function dreamFontUrl(fileName: string): string {
  return userFontUrl(fileName);
}
