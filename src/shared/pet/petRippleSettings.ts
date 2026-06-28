export interface PetRippleSettings {
  enabled: boolean;
}

export const DEFAULT_PET_RIPPLE_SETTINGS: PetRippleSettings = {
  enabled: true,
};

const STORAGE_KEY = 'emerald.pet.ripple';
const CHANGE_EVENT = 'emerald:pet-ripple-settings';

function normalize(value: Partial<PetRippleSettings> | null | undefined): PetRippleSettings {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_PET_RIPPLE_SETTINGS.enabled,
  };
}

export function loadPetRippleSettings(): PetRippleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_PET_RIPPLE_SETTINGS;
  }
}

export function savePetRippleSettings(patch: Partial<PetRippleSettings>): PetRippleSettings {
  const next = normalize({ ...loadPetRippleSettings(), ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  } catch {
    // Keep the in-memory update usable when storage is unavailable.
  }
  return next;
}

export function subscribePetRippleSettings(listener: (settings: PetRippleSettings) => void) {
  const onCustom = (event: Event) =>
    listener(normalize((event as CustomEvent<PetRippleSettings>).detail));
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(loadPetRippleSettings());
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
