import { getUIPref, setUIPref } from '../uiPreferences';

export type Framing = 'face' | 'upperBody' | 'full';

export interface LightCfg {
  on: boolean;
  intensity: number;
  color: string;
  pos?: [number, number, number];
}

export interface RoomLights {
  useSceneLights: boolean;
  ambient: LightCfg;
  key: LightCfg;
  charFill: LightCfg;
  moodTint: boolean;
}

export interface RoomProp {
  file: string;
  pos: [number, number, number];
  rot: [number, number, number];
  scale: number;
}

export interface RoomSettings {
  characterFile: string;
  sceneFile: string;
  framing: Framing;
  fovDeg: number;
  scaleMul: number;
  offset: [number, number, number];
  yawDeg: number;
  customView: { pos: [number, number, number]; target: [number, number, number] } | null;
  anchorMode: 'floor' | 'free';
  lights: RoomLights;
  props: RoomProp[];
}

export const DEFAULT_LIGHTS: RoomLights = {
  useSceneLights: false,
  ambient:  { on: true, intensity: 0.5, color: '#ffffff' },
  key:      { on: true, intensity: 0.9, color: '#fff5e0', pos: [2, 4, 3] },
  charFill: { on: true, intensity: 0.6, color: '#ffffff', pos: [0.5, 1.6, 2] },
  moodTint: false,
};

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  characterFile: 'character.glb',
  sceneFile: 'room.glb',
  framing: 'upperBody',
  fovDeg: 45,
  scaleMul: 1,
  offset: [0, 0, 0],
  yawDeg: 0,
  customView: null,
  anchorMode: 'free',
  lights: DEFAULT_LIGHTS,
  props: [],
};

const STORAGE_KEY = 'room.settings';
const CHANGE_EVENT = 'emerald:room-settings';

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}

function isHex(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s);
}

function validatePos(v: unknown): [number, number, number] | undefined {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(x => typeof x === 'number')) return undefined;
  return v as [number, number, number];
}

function validateLightCfg(raw: unknown, def: LightCfg): LightCfg {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    on: typeof r.on === 'boolean' ? r.on : def.on,
    intensity: clamp(typeof r.intensity === 'number' ? r.intensity : def.intensity, 0, 4),
    color: isHex(r.color) ? r.color : def.color,
    pos: validatePos(r.pos) ?? def.pos,
  };
}

function validateLights(raw: unknown): RoomLights {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    useSceneLights: typeof r.useSceneLights === 'boolean' ? r.useSceneLights : DEFAULT_LIGHTS.useSceneLights,
    ambient:  validateLightCfg(r.ambient,  DEFAULT_LIGHTS.ambient),
    key:      validateLightCfg(r.key,      DEFAULT_LIGHTS.key),
    charFill: validateLightCfg(r.charFill, DEFAULT_LIGHTS.charFill),
    moodTint: typeof r.moodTint === 'boolean' ? r.moodTint : DEFAULT_LIGHTS.moodTint,
  };
}

function validateProp(raw: unknown): RoomProp | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.file !== 'string' || !r.file) return null;
  const pos = validatePos(r.pos) ?? ([0, 0, 0] as [number, number, number]);
  const rot = validatePos(r.rot) ?? ([0, 0, 0] as [number, number, number]);
  const scale = typeof r.scale === 'number' && r.scale > 0 ? r.scale : 1;
  return { file: r.file, pos, rot, scale };
}

function validate(raw: unknown): RoomSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    characterFile: typeof r.characterFile === 'string' ? r.characterFile : DEFAULT_ROOM_SETTINGS.characterFile,
    sceneFile: typeof r.sceneFile === 'string' ? r.sceneFile : DEFAULT_ROOM_SETTINGS.sceneFile,
    framing: (['face', 'upperBody', 'full'] as const).includes(r.framing as Framing)
      ? (r.framing as Framing)
      : DEFAULT_ROOM_SETTINGS.framing,
    fovDeg: clamp(typeof r.fovDeg === 'number' ? r.fovDeg : DEFAULT_ROOM_SETTINGS.fovDeg, 20, 80),
    scaleMul: clamp(typeof r.scaleMul === 'number' ? r.scaleMul : DEFAULT_ROOM_SETTINGS.scaleMul, 0.2, 3),
    offset: (() => {
      const o = r.offset;
      if (Array.isArray(o) && o.length === 3 && o.every(v => typeof v === 'number'))
        return o as [number, number, number];
      return [0, 0, 0] as [number, number, number];
    })(),
    yawDeg: clamp(typeof r.yawDeg === 'number' ? r.yawDeg : DEFAULT_ROOM_SETTINGS.yawDeg, -180, 180),
    customView: (() => {
      const cv = r.customView;
      if (!cv || typeof cv !== 'object') return null;
      const c = cv as Record<string, unknown>;
      if (!Array.isArray(c.pos) || c.pos.length !== 3 || !c.pos.every((v: unknown) => typeof v === 'number')) return null;
      if (!Array.isArray(c.target) || c.target.length !== 3 || !c.target.every((v: unknown) => typeof v === 'number')) return null;
      return {
        pos: c.pos as [number, number, number],
        target: c.target as [number, number, number],
      };
    })(),
    anchorMode: r.anchorMode === 'floor' ? 'floor' : 'free',
    lights: validateLights(r.lights),
    props: Array.isArray(r.props)
      ? (r.props as unknown[]).map(validateProp).filter((p): p is RoomProp => p !== null)
      : [],
  };
}

export function loadRoomSettings(): RoomSettings {
  return validate(getUIPref<unknown>(STORAGE_KEY, {}));
}

export function saveRoomSettings(settings: RoomSettings): void {
  setUIPref<RoomSettings>(STORAGE_KEY, settings);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: settings }));
}

export function subscribeRoomSettings(fn: (s: RoomSettings) => void): () => void {
  const onCustom = (e: Event) => fn(validate((e as CustomEvent).detail));
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'emerald.ui.' + STORAGE_KEY) fn(loadRoomSettings());
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
