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
}

const DEFAULT_APPEARANCE: DreamAppearance = {
  chatFontSize: 15,
  themeFontSize: 14,
  fontFile: null,
  accentColor: '#8f78d6',
  savedColors: [],
  backgroundBlur: 18,
};

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
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
