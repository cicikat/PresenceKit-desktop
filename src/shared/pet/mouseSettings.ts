export interface PetMouseSettings {
  enabled: boolean;
  botherMinMinutes: number;
  botherMaxMinutes: number;
}

export const DEFAULT_PET_MOUSE_SETTINGS: PetMouseSettings = {
  enabled: true,
  botherMinMinutes: 2,
  botherMaxMinutes: 5,
};

const STORAGE_KEY = 'emerald.pet.mouse';
const CHANGE_EVENT = 'emerald:pet-mouse-settings';

function clampMinutes(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(30, Math.max(0.25, parsed)) : fallback;
}

function normalizeSettings(value: Partial<PetMouseSettings> | null | undefined): PetMouseSettings {
  const min = clampMinutes(value?.botherMinMinutes, DEFAULT_PET_MOUSE_SETTINGS.botherMinMinutes);
  const max = clampMinutes(value?.botherMaxMinutes, DEFAULT_PET_MOUSE_SETTINGS.botherMaxMinutes);
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_PET_MOUSE_SETTINGS.enabled,
    botherMinMinutes: Math.min(min, max),
    botherMaxMinutes: Math.max(min, max),
  };
}

export function loadPetMouseSettings(): PetMouseSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_PET_MOUSE_SETTINGS;
  }
}

export function savePetMouseSettings(patch: Partial<PetMouseSettings>): PetMouseSettings {
  const next = normalizeSettings({ ...loadPetMouseSettings(), ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  } catch {
    // Keep the in-memory update usable when storage is unavailable.
  }
  return next;
}

export function subscribePetMouseSettings(listener: (settings: PetMouseSettings) => void) {
  const onCustom = (event: Event) => {
    listener(normalizeSettings((event as CustomEvent<PetMouseSettings>).detail));
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(loadPetMouseSettings());
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
