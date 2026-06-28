import { getUIPref, setUIPref } from '../uiPreferences';
import { PAPER_THEME, DARK_THEME } from './builtinThemes';
import type { ThemeManifest } from './types';

export interface UserThemePreset {
  id: string;
  name: string;
  base: 'light' | 'dark';
  tokens: Record<string, string>;
}

const KEY = 'chat.theme.user-presets';

function isValidPreset(v: unknown): v is UserThemePreset {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as Record<string, unknown>).id === 'string' &&
    typeof (v as Record<string, unknown>).name === 'string' &&
    ((v as Record<string, unknown>).base === 'light' || (v as Record<string, unknown>).base === 'dark') &&
    typeof (v as Record<string, unknown>).tokens === 'object' &&
    (v as Record<string, unknown>).tokens !== null
  );
}

export function loadUserPresets(): UserThemePreset[] {
  const raw = getUIPref<unknown>(KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidPreset);
}

export function saveUserPresets(presets: UserThemePreset[]): void {
  setUIPref(KEY, presets);
}

export function createPresetFromBase(name: string, base: 'light' | 'dark'): UserThemePreset {
  const baseTheme = base === 'light' ? PAPER_THEME : DARK_THEME;
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    base,
    tokens: { ...(baseTheme.tokens as Record<string, string>) },
  };
}

export function presetToManifest(preset: UserThemePreset): ThemeManifest {
  return {
    id: preset.id,
    name: `★ ${preset.name}`,
    base: preset.base,
    tokens: preset.tokens,
  };
}

export function exportPreset(preset: UserThemePreset): void {
  const json = JSON.stringify(preset, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${preset.name.replace(/[^\w一-龥-]/g, '_')}.theme.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importPresetFromJson(json: string): UserThemePreset | null {
  try {
    const parsed = JSON.parse(json);
    if (!isValidPreset(parsed)) return null;
    return {
      ...parsed,
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
  } catch {
    return null;
  }
}
