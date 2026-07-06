import { getUIPref, setUIPref, onUIPrefChange } from '../uiPreferences';

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

const PREF_KEY = 'pet.mouse';
const LEGACY_STORAGE_KEY = 'emerald.pet.mouse';

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

function migrateLegacy(): PetMouseSettings | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return null;
    const value = normalizeSettings(JSON.parse(raw));
    setUIPref(PREF_KEY, value);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}

export function loadPetMouseSettings(): PetMouseSettings {
  const stored = getUIPref<PetMouseSettings | null>(PREF_KEY, null);
  if (stored !== null) return normalizeSettings(stored);
  return migrateLegacy() ?? DEFAULT_PET_MOUSE_SETTINGS;
}

export function savePetMouseSettings(patch: Partial<PetMouseSettings>): PetMouseSettings {
  const next = normalizeSettings({ ...loadPetMouseSettings(), ...patch });
  setUIPref(PREF_KEY, next);
  return next;
}

export function subscribePetMouseSettings(listener: (settings: PetMouseSettings) => void) {
  return onUIPrefChange(key => {
    if (key === PREF_KEY) listener(loadPetMouseSettings());
  });
}
