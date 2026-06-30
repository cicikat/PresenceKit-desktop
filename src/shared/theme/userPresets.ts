import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
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

export async function exportPreset(preset: UserThemePreset): Promise<boolean> {
  const json = JSON.stringify(preset, null, 2);
  const safe = preset.name.replace(/[^\w一-龥-]/g, '_') || 'theme';
  const path = await save({
    defaultPath: `${safe}.theme.json`,
    filters: [{ name: 'Theme', extensions: ['json'] }],
  });
  if (!path) return false;
  await invoke('write_text_file', { path, contents: json });
  return true;
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
