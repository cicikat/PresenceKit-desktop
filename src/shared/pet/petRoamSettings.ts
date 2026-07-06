import { getUIPref, setUIPref, onUIPrefChange } from '../uiPreferences';

export interface PetRoamSettings {
  enabled: boolean;
}

export const DEFAULT_PET_ROAM_SETTINGS: PetRoamSettings = {
  enabled: false,
};

const PREF_KEY = 'pet.roam';
const LEGACY_STORAGE_KEY = 'emerald.pet.roam';

function normalize(value: Partial<PetRoamSettings> | null | undefined): PetRoamSettings {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_PET_ROAM_SETTINGS.enabled,
  };
}

function migrateLegacy(): PetRoamSettings | null {
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

export function loadPetRoamSettings(): PetRoamSettings {
  const stored = getUIPref<PetRoamSettings | null>(PREF_KEY, null);
  if (stored !== null) return normalize(stored);
  return migrateLegacy() ?? DEFAULT_PET_ROAM_SETTINGS;
}

export function savePetRoamSettings(patch: Partial<PetRoamSettings>): PetRoamSettings {
  const next = normalize({ ...loadPetRoamSettings(), ...patch });
  setUIPref(PREF_KEY, next);
  return next;
}

export function subscribePetRoamSettings(listener: (settings: PetRoamSettings) => void) {
  return onUIPrefChange(key => {
    if (key === PREF_KEY) listener(loadPetRoamSettings());
  });
}
