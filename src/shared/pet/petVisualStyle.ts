export type PetVisualStyle = 'fluid' | 'scatter' | 'network' | 'live2d';
// 'model3d' reserved for future RoomWindow / virtual-space feature

export const DEFAULT_PET_VISUAL_STYLE: PetVisualStyle = 'network';

const STORAGE_KEY = 'emerald.pet.visual-style';
const CHANGE_EVENT = 'emerald:pet-visual-style';

function validate(value: unknown): PetVisualStyle {
  if (value === 'fluid' || value === 'scatter' || value === 'network' || value === 'live2d') return value;
  return DEFAULT_PET_VISUAL_STYLE;
}

export function loadPetVisualStyle(): PetVisualStyle {
  try {
    return validate(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PET_VISUAL_STYLE;
  }
}

export function savePetVisualStyle(style: PetVisualStyle): PetVisualStyle {
  try {
    localStorage.setItem(STORAGE_KEY, style);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: style }));
  } catch {}
  return style;
}

export function subscribePetVisualStyle(listener: (style: PetVisualStyle) => void) {
  const onCustom = (event: Event) => {
    listener(validate((event as CustomEvent).detail));
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(loadPetVisualStyle());
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
