import { getUIPref, setUIPref, onUIPrefChange } from '../uiPreferences';

export interface PetRippleSettings {
  enabled: boolean;
}

export const DEFAULT_PET_RIPPLE_SETTINGS: PetRippleSettings = {
  enabled: true,
};

const PREF_KEY = 'pet.ripple';
const LEGACY_STORAGE_KEY = 'emerald.pet.ripple';

function normalize(value: Partial<PetRippleSettings> | null | undefined): PetRippleSettings {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_PET_RIPPLE_SETTINGS.enabled,
  };
}

function migrateLegacy(): PetRippleSettings | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return null;
    const value = normalize(JSON.parse(raw));
    setUIPref(PREF_KEY, value);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}

export function loadPetRippleSettings(): PetRippleSettings {
  const stored = getUIPref<PetRippleSettings | null>(PREF_KEY, null);
  if (stored !== null) return normalize(stored);
  return migrateLegacy() ?? DEFAULT_PET_RIPPLE_SETTINGS;
}

export function savePetRippleSettings(patch: Partial<PetRippleSettings>): PetRippleSettings {
  const next = normalize({ ...loadPetRippleSettings(), ...patch });
  setUIPref(PREF_KEY, next);
  return next;
}

export function subscribePetRippleSettings(listener: (settings: PetRippleSettings) => void) {
  return onUIPrefChange(key => {
    if (key === PREF_KEY) listener(loadPetRippleSettings());
  });
}
