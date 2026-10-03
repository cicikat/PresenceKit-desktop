// Look presets (work order 5): a named bundle of lights + color grade, so the two layers
// that make up a "look" are applied together. Pure data and functions; this module only
// type-imports roomSettings so roomSettings can import it back (switchRoomPlacement applies
// the remembered look) without a runtime cycle. User looks are validated in roomSettings.
import type { RoomLights, RoomSettings } from './roomSettings';
import type { GradeCfg } from './gradeConfig';

export interface LookPreset {
  name: string;
  lights: RoomLights;
  grade: GradeCfg;
}

export interface BuiltinLook extends LookPreset {
  /** i18n key for the display name; built-ins are never written into the user's save. */
  nameKey: string;
}

export const BUILTIN_PREFIX = 'builtin:';

const NEUTRAL_BLOOM = { on: false, strength: 0.4, radius: 0.4, threshold: 0.85 };

function lights(partial: Partial<RoomLights> & Pick<RoomLights, 'ambient' | 'key' | 'charFill'>): RoomLights {
  return { useSceneLights: false, moodTint: false, extra: [], shadows: false, ...partial };
}

/**
 * Built-ins demonstrate the two layers working together, so each sets both. Visual intent:
 * - daylight: bright neutral-warm key from above-right, soft fill, gentle contrast, light vignette.
 * - dusk: low warm orange key from the side, peach ambient, ACES filmic contrast, warm glow bloom.
 * - nightLamp: dim blue ambient with a warm lamp point light near the character, strong vignette.
 * - coolIndoor: bluish-white fluorescent feel, slightly desaturated, cool temperature shift.
 * - stageRim: dark stage with magenta and cyan rim lights on the character only, punchy contrast.
 */
export const BUILTIN_LOOKS: Record<string, BuiltinLook> = {
  [`${BUILTIN_PREFIX}daylight`]: {
    name: 'Daylight', nameKey: 'room.editor.look.daylight',
    lights: lights({
      ambient: { on: true, intensity: 0.6, color: '#ffffff' },
      key: { on: true, intensity: 1.3, color: '#fff4e0', pos: [3, 5, 3] },
      charFill: { on: true, intensity: 0.5, color: '#ffffff', pos: [0.5, 1.6, 2] },
    }),
    grade: {
      enabled: true, toneMapping: 'neutral', exposure: 1, temperature: 0.1, tint: 0,
      saturation: 1.05, contrast: 1.05, lift: 0, vignette: 0.1, bloom: NEUTRAL_BLOOM,
    },
  },
  [`${BUILTIN_PREFIX}dusk`]: {
    name: 'Dusk', nameKey: 'room.editor.look.dusk',
    lights: lights({
      ambient: { on: true, intensity: 0.35, color: '#ffc9a0' },
      key: { on: true, intensity: 1.1, color: '#ff9a55', pos: [-3, 2, 2.5] },
      charFill: { on: true, intensity: 0.5, color: '#ffb27a', pos: [0.5, 1.6, 2] },
    }),
    grade: {
      enabled: true, toneMapping: 'aces', exposure: 1.05, temperature: 0.45, tint: 0.08,
      saturation: 1.1, contrast: 1.12, lift: 0, vignette: 0.3,
      bloom: { on: true, strength: 0.35, radius: 0.5, threshold: 0.8 },
    },
  },
  [`${BUILTIN_PREFIX}nightLamp`]: {
    name: 'Night lamp', nameKey: 'room.editor.look.nightLamp',
    lights: lights({
      ambient: { on: true, intensity: 0.12, color: '#7a8cff' },
      key: { on: true, intensity: 0.35, color: '#8fa0ff', pos: [2, 3, 3] },
      charFill: { on: true, intensity: 0.4, color: '#ffcf8a', pos: [1.2, 1.3, 1.4] },
      extra: [{
        id: 'builtin-lamp', type: 'point', on: true, intensity: 1.6, color: '#ffc77a',
        pos: [1.2, 1.5, 1.2], distance: 6, angleDeg: 45, penumbra: 0.3, charOnly: false,
      }],
    }),
    grade: {
      enabled: true, toneMapping: 'agx', exposure: 1.1, temperature: 0.25, tint: -0.02,
      saturation: 0.95, contrast: 1.2, lift: -0.02, vignette: 0.5,
      bloom: { on: true, strength: 0.5, radius: 0.6, threshold: 0.7 },
    },
  },
  [`${BUILTIN_PREFIX}coolIndoor`]: {
    name: 'Cool indoor', nameKey: 'room.editor.look.coolIndoor',
    lights: lights({
      ambient: { on: true, intensity: 0.55, color: '#dbe9ff' },
      key: { on: true, intensity: 1, color: '#e6f0ff', pos: [2, 4, 3] },
      charFill: { on: true, intensity: 0.55, color: '#cfe0ff', pos: [0.5, 1.6, 2] },
    }),
    grade: {
      enabled: true, toneMapping: 'neutral', exposure: 1, temperature: -0.3, tint: 0,
      saturation: 0.95, contrast: 1.08, lift: 0, vignette: 0.15, bloom: NEUTRAL_BLOOM,
    },
  },
  [`${BUILTIN_PREFIX}stageRim`]: {
    name: 'Stage rim light', nameKey: 'room.editor.look.stageRim',
    lights: lights({
      ambient: { on: true, intensity: 0.15, color: '#ffffff' },
      key: { on: true, intensity: 0.4, color: '#ffffff', pos: [0, 3, 3] },
      charFill: { on: true, intensity: 0.3, color: '#9ab6ff', pos: [0.5, 1.6, 2] },
      extra: [
        {
          id: 'builtin-rim-a', type: 'spot', on: true, intensity: 2.5, color: '#ff7ad1',
          pos: [-2.5, 2.5, -2], distance: 0, angleDeg: 40, penumbra: 0.6, charOnly: true,
        },
        {
          id: 'builtin-rim-b', type: 'directional', on: true, intensity: 1.4, color: '#66ccff',
          pos: [2.5, 2, -2], distance: 0, angleDeg: 45, penumbra: 0.3, charOnly: true,
        },
      ],
    }),
    grade: {
      enabled: true, toneMapping: 'aces', exposure: 1, temperature: 0, tint: 0,
      saturation: 1.15, contrast: 1.25, lift: 0, vignette: 0.45,
      bloom: { on: true, strength: 0.6, radius: 0.55, threshold: 0.75 },
    },
  },
};

export function isBuiltinLookId(id: string): boolean {
  return id.startsWith(BUILTIN_PREFIX);
}

export function getLook(settings: RoomSettings, id: string): LookPreset | null {
  return BUILTIN_LOOKS[id] ?? settings.looks?.[id] ?? null;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Replaces lights + grade with the look's (deep-copied so later edits never mutate a preset). */
export function applyLook(settings: RoomSettings, look: LookPreset): RoomSettings {
  return { ...settings, lights: clone(look.lights), grade: clone(look.grade) };
}

export function snapshotLook(settings: RoomSettings, name: string): LookPreset {
  return {
    name,
    lights: clone(settings.lights),
    grade: clone(settings.grade ?? { ...BUILTIN_LOOKS[`${BUILTIN_PREFIX}daylight`].grade, enabled: false }),
  };
}

/** Saves the current lights+grade as a new user look and binds it to the current scene. */
export function saveNewLook(settings: RoomSettings, name: string, id: string): RoomSettings {
  const trimmed = name.trim();
  if (!trimmed) return settings;
  return setSceneLook(
    { ...settings, looks: { ...settings.looks, [id]: snapshotLook(settings, trimmed) } },
    settings.sceneFile,
    id,
  );
}

/** Overwrites an existing user look with the current lights+grade. Built-ins are read-only. */
export function updateLook(settings: RoomSettings, id: string): RoomSettings {
  const existing = settings.looks?.[id];
  if (isBuiltinLookId(id) || !existing) return settings;
  return { ...settings, looks: { ...settings.looks, [id]: snapshotLook(settings, existing.name) } };
}

/** Renames a user look; built-ins and blank names are ignored. */
export function renameLook(settings: RoomSettings, id: string, name: string): RoomSettings {
  const existing = settings.looks?.[id];
  const trimmed = name.trim();
  if (isBuiltinLookId(id) || !existing || !trimmed) return settings;
  return { ...settings, looks: { ...settings.looks, [id]: { ...existing, name: trimmed } } };
}

/** Deletes a user look and every scene binding that pointed at it. Built-ins can't be deleted. */
export function deleteLook(settings: RoomSettings, id: string): RoomSettings {
  if (isBuiltinLookId(id) || !settings.looks?.[id]) return settings;
  const looks = { ...settings.looks };
  delete looks[id];
  const lookByScene = Object.fromEntries(Object.entries(settings.lookByScene ?? {}).filter(([, v]) => v !== id));
  return { ...settings, looks, lookByScene };
}

export function setSceneLook(settings: RoomSettings, sceneFile: string, id: string | null): RoomSettings {
  const lookByScene = { ...settings.lookByScene };
  if (id) lookByScene[sceneFile] = id;
  else delete lookByScene[sceneFile];
  return { ...settings, lookByScene };
}

/** Applies a look and remembers it for the current scene. */
export function applyAndRemember(settings: RoomSettings, id: string): RoomSettings {
  const look = getLook(settings, id);
  if (!look) return settings;
  return setSceneLook(applyLook(settings, look), settings.sceneFile, id);
}

/** The look bound to the scene, or null when none (or it was deleted). */
export function resolveSceneLook(settings: RoomSettings, sceneFile: string): LookPreset | null {
  const id = settings.lookByScene?.[sceneFile];
  return id ? getLook(settings, id) : null;
}
