import { invoke } from '@tauri-apps/api/core';

const STORAGE_PREFIX = 'emerald.ui.';
const PREF_CHANGE_EVENT = 'emerald-ui-pref-change';
const SAVE_DEBOUNCE_MS = 300;

let prefs = new Map<string, unknown>();
let initialized = false;
let tauriAvailable = true;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function readLocalStorageMirror(): Map<string, unknown> {
  const map = new Map<string, unknown>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const rawKey = localStorage.key(i);
      if (!rawKey || !rawKey.startsWith(STORAGE_PREFIX)) continue;
      try {
        map.set(rawKey.slice(STORAGE_PREFIX.length), JSON.parse(localStorage.getItem(rawKey) as string));
      } catch {
        // skip malformed entry
      }
    }
  } catch {
    // localStorage unavailable
  }
  return map;
}

function mirrorAllToLocalStorage(): void {
  try {
    for (const [key, value] of prefs) {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    }
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
}

function scheduleSave(): void {
  if (!tauriAvailable) return;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const serialized = JSON.stringify(Object.fromEntries(prefs));
    invoke('save_ui_prefs', { contents: serialized }).catch(err => {
      console.warn('[uiPreferences] 保存失败:', err);
    });
  }, SAVE_DEBOUNCE_MS);
}

/** Must be awaited before the app renders (see main.tsx) so getUIPref reads real data on first paint. */
export async function initUIPrefs(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const localMirror = readLocalStorageMirror();

  try {
    const raw = await invoke<string>('load_ui_prefs');
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
    prefs = new Map(Object.entries(parsed));

    // Rescue data that only exists in localStorage (e.g. first run after the
    // file-backed store was introduced, or a prior identifier change wiped it).
    if (prefs.size === 0 && localMirror.size > 0) {
      prefs = localMirror;
      scheduleSave();
    }
  } catch {
    // Plain browser (`npm run dev` without Tauri) — localStorage only.
    tauriAvailable = false;
    prefs = localMirror;
  }

  mirrorAllToLocalStorage();
}

export function getUIPref<T>(key: string, fallback: T): T {
  if (prefs.has(key)) return prefs.get(key) as T;
  return fallback;
}

export function setUIPref<T>(key: string, value: T): void {
  prefs.set(key, value);
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
  window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT, { detail: { key } }));
  scheduleSave();
}

export function removeUIPref(key: string): void {
  prefs.delete(key);
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // localStorage unavailable — the file-backed map is still authoritative.
  }
  window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT, { detail: { key } }));
  scheduleSave();
}

export function onUIPrefChange(handler: (key: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<{ key: string }>).detail.key);
  window.addEventListener(PREF_CHANGE_EVENT, listener);
  return () => window.removeEventListener(PREF_CHANGE_EVENT, listener);
}

// Cross-window sync: another window's setUIPref wrote to localStorage, which fires
// a native `storage` event here (not in the writer's own window). Fold it into our
// in-memory Map and re-emit the same in-process event so onUIPrefChange subscribers
// don't need to know the difference between a local and a cross-window change.
window.addEventListener('storage', event => {
  if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) return;
  const key = event.key.slice(STORAGE_PREFIX.length);
  if (event.newValue === null) {
    prefs.delete(key);
  } else {
    try {
      prefs.set(key, JSON.parse(event.newValue));
    } catch {
      return;
    }
  }
  window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT, { detail: { key } }));
});
