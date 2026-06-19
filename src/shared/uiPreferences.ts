const STORAGE_PREFIX = 'emerald.ui.';
const PREF_CHANGE_EVENT = 'emerald-ui-pref-change';

export function getUIPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setUIPref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT, { detail: { key } }));
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
}

export function onUIPrefChange(handler: (key: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<{ key: string }>).detail.key);
  window.addEventListener(PREF_CHANGE_EVENT, listener);
  return () => window.removeEventListener(PREF_CHANGE_EVENT, listener);
}
