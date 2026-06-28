import { invoke } from '@tauri-apps/api/core';
import { getUIPref, setUIPref } from '../uiPreferences';
import { BUILTIN_THEMES } from './builtinThemes';
import { applyTheme, applyThemeCss, validateTheme } from './loader';
import { inspectThemeCss } from './cssGuard';
import { loadUserPresets, presetToManifest } from './userPresets';
import type { ThemeManifest, ThemeRecord } from './types';

const NIGHT_START = 19; // 19:00 → night
const NIGHT_END   = 6;  // 06:00 → day resumes

const listeners = new Set<() => void>();
let records: ThemeRecord[] | null = null;
let currentThemeId = 'paper';
let autoTimer: ReturnType<typeof setInterval> | null = null;

function isNightHour(): boolean {
  const h = new Date().getHours();
  return h >= NIGHT_START || h < NIGHT_END;
}

function validRecord(manifest: ThemeManifest, source: ThemeRecord['source']): ThemeRecord | null {
  if (!manifest || typeof manifest.id !== 'string' || typeof manifest.name !== 'string' || !manifest.tokens) {
    console.warn('[theme] 忽略格式无效的主题:', manifest);
    return null;
  }
  const missing = validateTheme(manifest);
  if (missing.length > 0) {
    console.warn(`[theme] 忽略主题 "${manifest.id}"，缺少必需变量:`, missing);
    return null;
  }
  return { manifest, source };
}

export async function listThemes(refresh = false): Promise<ThemeRecord[]> {
  if (records && !refresh) return records;
  const merged = new Map<string, ThemeRecord>();
  for (const manifest of BUILTIN_THEMES) {
    const record = validRecord(manifest, 'builtin');
    if (record) merged.set(manifest.id, record);
  }
  try {
    const diskThemes = await invoke<ThemeManifest[]>('list_themes');
    for (const manifest of diskThemes) {
      const record = validRecord(manifest, 'disk');
      if (record) {
        const builtin = merged.get(manifest.id);
        merged.set(manifest.id, builtin ? {
          source: 'disk',
          manifest: {
            ...builtin.manifest,
            ...manifest,
            tokens: { ...builtin.manifest.tokens, ...manifest.tokens },
          },
        } : record);
      }
    }
  } catch (error) {
    console.warn('[theme] 磁盘主题目录读取失败，继续使用内置主题:', error);
  }

  for (const preset of loadUserPresets()) {
    const record = validRecord(presetToManifest(preset), 'disk');
    if (record) merged.set(preset.id, record);
  }

  const valid: ThemeRecord[] = [];
  for (const record of merged.values()) {
    if (record.manifest.css) {
      try {
        const cssText = await fetch(`/themes/${record.manifest.id}/${record.manifest.css}`).then(r => r.text());
        const guard = inspectThemeCss(cssText);
        if (guard.ok) {
          valid.push({ ...record, cssText });
        } else {
          console.warn(`[theme] "${record.manifest.id}" 自定义CSS被拒:`, guard.reasons);
        }
      } catch (err) {
        console.warn(`[theme] "${record.manifest.id}" CSS文件读取失败:`, err);
      }
    } else {
      valid.push(record);
    }
  }

  records = valid.sort((a, b) =>
    (a.manifest.base ?? '').localeCompare(b.manifest.base ?? '') ||
    a.manifest.name.localeCompare(b.manifest.name),
  );
  return records;
}

export function getCurrentThemeId(): string {
  return currentThemeId;
}

export async function setTheme(id: string): Promise<void> {
  const themes = await listThemes();
  const requested = themes.find(record => record.manifest.id === id);
  const fallback = themes.find(record => record.manifest.id === 'paper') ??
    validRecord(BUILTIN_THEMES[0], 'builtin')!;
  const record = requested ?? fallback;
  if (!requested) console.warn(`[theme] 找不到主题 "${id}"，已回退 paper`);
  applyTheme(record.manifest);
  applyThemeCss(record.manifest.id, record.cssText ?? null);
  currentThemeId = record.manifest.id;
  setUIPref('chat.theme', currentThemeId);
  listeners.forEach(listener => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateThemeCache(): void {
  records = null;
}

// ── Day/Night slot API ──────────────────────────────────────────────────────

export interface DayNightState {
  day: string;
  night: string;
  mode: 'manual' | 'auto';
  active: 'day' | 'night';
}

export function getDayNight(): DayNightState {
  return {
    day:    getUIPref('chat.theme.day',    'paper'),
    night:  getUIPref('chat.theme.night',  'dark'),
    mode:   getUIPref<'manual' | 'auto'>('chat.theme.mode',   'manual'),
    active: getUIPref<'day' | 'night'>('chat.theme.active', 'day'),
  };
}

export async function setSlotTheme(slot: 'day' | 'night', id: string): Promise<void> {
  setUIPref(slot === 'day' ? 'chat.theme.day' : 'chat.theme.night', id);
  const { active } = getDayNight();
  if (active === slot) {
    await setTheme(id);
  } else {
    // Notify slot-aware subscribers even though applied theme didn't change
    listeners.forEach(listener => listener());
  }
}

export async function applyByMode(): Promise<void> {
  const { day, night, mode, active } = getDayNight();
  if (mode === 'auto') {
    const slot: 'day' | 'night' = isNightHour() ? 'night' : 'day';
    setUIPref('chat.theme.active', slot);
    await setTheme(slot === 'day' ? day : night);
  } else {
    await setTheme(active === 'day' ? day : night);
  }
}

export async function setThemeMode(mode: 'manual' | 'auto'): Promise<void> {
  setUIPref('chat.theme.mode', mode);
  if (autoTimer !== null) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  if (mode === 'auto') {
    autoTimer = setInterval(() => { applyByMode().catch(console.warn); }, 10 * 60 * 1000);
  }
  await applyByMode();
}

export async function toggleDayNight(): Promise<void> {
  const { day, night, active, mode } = getDayNight();
  const next: 'day' | 'night' = active === 'day' ? 'night' : 'day';
  setUIPref('chat.theme.active', next);
  // Clicking toggle switches to manual so auto doesn't immediately revert
  if (mode === 'auto') {
    setUIPref('chat.theme.mode', 'manual');
    if (autoTimer !== null) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }
  await setTheme(next === 'day' ? day : night);
}

// ── Init ────────────────────────────────────────────────────────────────────

export async function initTheme(): Promise<void> {
  // One-time migration: old single chat.theme → day/night slot
  const hasSlots = localStorage.getItem('emerald.ui.chat.theme.day') !== null;
  if (!hasSlots) {
    const legacy = getUIPref<string>('chat.theme', '');
    if (legacy) {
      const isLegacyDark = legacy === 'dark' || legacy.toLowerCase().includes('dark');
      if (isLegacyDark) {
        setUIPref('chat.theme.night', legacy);
        setUIPref('chat.theme.active', 'night');
      } else {
        setUIPref('chat.theme.day', legacy);
        setUIPref('chat.theme.active', 'day');
      }
    }
  }

  const { mode } = getDayNight();
  if (mode === 'auto' && autoTimer === null) {
    autoTimer = setInterval(() => { applyByMode().catch(console.warn); }, 10 * 60 * 1000);
  }

  await applyByMode();
}

// ── Cross-window sync ───────────────────────────────────────────────────────

const WATCHED_STORAGE_KEYS = new Set([
  'emerald.ui.chat.theme',
  'emerald.ui.chat.theme.day',
  'emerald.ui.chat.theme.night',
  'emerald.ui.chat.theme.active',
  'emerald.ui.chat.theme.mode',
]);

window.addEventListener('storage', event => {
  if (!WATCHED_STORAGE_KEYS.has(event.key ?? '')) return;
  applyByMode().catch(console.warn);
});
