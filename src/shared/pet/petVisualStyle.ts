import { getUIPref, setUIPref, onUIPrefChange } from '../uiPreferences';

export type PetVisualStyle = 'fluid' | 'scatter' | 'network' | 'live2d' | 'model3d';

export const DEFAULT_PET_VISUAL_STYLE: PetVisualStyle = 'network';

const PREF_KEY = 'pet.visual-style';
const LEGACY_STORAGE_KEY = 'emerald.pet.visual-style';

function validate(value: unknown): PetVisualStyle {
  if (value === 'fluid' || value === 'scatter' || value === 'network' || value === 'live2d' || value === 'model3d') return value;
  return DEFAULT_PET_VISUAL_STYLE;
}

function migrateLegacy(): PetVisualStyle | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return null;
    const value = validate(raw);
    setUIPref(PREF_KEY, value);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}

export function loadPetVisualStyle(): PetVisualStyle {
  const stored = getUIPref<PetVisualStyle | null>(PREF_KEY, null);
  if (stored !== null) return validate(stored);
  return migrateLegacy() ?? DEFAULT_PET_VISUAL_STYLE;
}

export function savePetVisualStyle(style: PetVisualStyle): PetVisualStyle {
  const value = validate(style);
  setUIPref(PREF_KEY, value);
  return value;
}

export function subscribePetVisualStyle(listener: (style: PetVisualStyle) => void) {
  return onUIPrefChange(key => {
    if (key === PREF_KEY) listener(loadPetVisualStyle());
  });
}
