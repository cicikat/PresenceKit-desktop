import { getUIPref, setUIPref } from '../uiPreferences';
import type { RoomSettings } from './roomSettings';

export interface RoomPreset {
  id: string;
  name: string;
  settings: RoomSettings;
}

const STORAGE_KEY = 'room.presets';

export function loadRoomPresets(): RoomPreset[] {
  return getUIPref<RoomPreset[]>(STORAGE_KEY, []);
}

function saveRoomPresets(presets: RoomPreset[]): void {
  setUIPref<RoomPreset[]>(STORAGE_KEY, presets);
}

export function createPreset(name: string, settings: RoomSettings): RoomPreset[] {
  const preset: RoomPreset = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    settings: { ...settings },
  };
  const presets = [...loadRoomPresets(), preset];
  saveRoomPresets(presets);
  return presets;
}

export function deletePreset(id: string): RoomPreset[] {
  const presets = loadRoomPresets().filter(p => p.id !== id);
  saveRoomPresets(presets);
  return presets;
}
