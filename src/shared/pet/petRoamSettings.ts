export interface PetRoamSettings {
  enabled: boolean;
}

export const DEFAULT_PET_ROAM_SETTINGS: PetRoamSettings = {
  enabled: false,
};

const STORAGE_KEY = 'emerald.pet.roam';
const CHANGE_EVENT = 'emerald:pet-roam-settings';

function normalize(value: Partial<PetRoamSettings> | null | undefined): PetRoamSettings {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_PET_ROAM_SETTINGS.enabled,
  };
}

export function loadPetRoamSettings(): PetRoamSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_PET_ROAM_SETTINGS;
  }
}

export function savePetRoamSettings(patch: Partial<PetRoamSettings>): PetRoamSettings {
  const next = normalize({ ...loadPetRoamSettings(), ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  } catch {
    // Keep the in-memory update usable when storage is unavailable.
  }
  return next;
}

export function subscribePetRoamSettings(listener: (settings: PetRoamSettings) => void) {
  const onCustom = (event: Event) =>
    listener(normalize((event as CustomEvent<PetRoamSettings>).detail));
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(loadPetRoamSettings());
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
