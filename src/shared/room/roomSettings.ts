import { getUIPref, setUIPref } from '../uiPreferences';

export type Framing = 'face' | 'upperBody' | 'full';
export type RenderMode = 'model3d' | 'live2d';

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

export type BoneRole = 'head' | 'chest' | 'spine' | 'shoulderL' | 'shoulderR' | 'leftEye' | 'rightEye';
export type BoneMap = Partial<Record<BoneRole, string>>;

export interface SpringParamsCfg {
  stiffness?: number;
  damping?: number;
  gravity?: number;
}

export interface PhysicsBonesCfg {
  default?: SpringParamsCfg;
  overrides?: Record<string, SpringParamsCfg>;
}

export interface RoomProp {
  file: string;
  pos: [number, number, number];
  rot: [number, number, number];
  scale: number;
}

export interface CharacterCfg {
  boneMap?: BoneMap;
  physicsBones?: PhysicsBonesCfg;
}

// Camera/staging fields that make sense per scene×character combination — see `perPlacement`.
export interface PlacementCfg {
  framing: Framing;
  fovDeg: number;
  scaleMul: number;
  offset: [number, number, number];
  yawDeg: number;
  customView: { pos: [number, number, number]; target: [number, number, number] } | null;
  anchorMode: 'floor' | 'free';
  props: RoomProp[];
  idleClip?: string;
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
  // Legacy global fields — migrated into `perCharacter[characterFile]` on load (see `validate`).
  // Kept optional here only so old persisted blobs still type-check through the migration path.
  boneMap?: BoneMap;
  physicsBones?: PhysicsBonesCfg;
  perCharacter?: Record<string, CharacterCfg>;
  idleClip?: string;
  renderMode?: RenderMode;
  // Remembered placement (framing/fov/scale/offset/yaw/customView/anchorMode/props/idleClip) per
  // `${sceneFile}|${characterFile}` combo — see `switchRoomPlacement`/`saveRoomSettings`. A combo
  // with no entry yet just keeps whatever the top-level fields currently are (legacy fallback).
  perPlacement?: Record<string, PlacementCfg>;
}

// Rig config is keyed by characterFile so switching between models with incompatible
// skeletons (e.g. Rigify ↔ Auto-Rig Pro) doesn't leak one model's boneMap/physicsBones
// onto the other. Falls back to the legacy top-level fields for stores not yet migrated.
export function getCharacterCfg(settings: RoomSettings, characterFile: string): CharacterCfg {
  return settings.perCharacter?.[characterFile] ?? {
    boneMap: settings.boneMap,
    physicsBones: settings.physicsBones,
  };
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
  renderMode: 'model3d',
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

function validateCustomView(raw: unknown): { pos: [number, number, number]; target: [number, number, number] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const pos = validatePos(c.pos);
  const target = validatePos(c.target);
  return pos && target ? { pos, target } : null;
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

function validateSpringParamsCfg(raw: unknown): SpringParamsCfg | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: SpringParamsCfg = {};
  if (typeof r.stiffness === 'number') out.stiffness = r.stiffness;
  if (typeof r.damping === 'number') out.damping = r.damping;
  if (typeof r.gravity === 'number') out.gravity = r.gravity;
  return Object.keys(out).length > 0 ? out : undefined;
}

function validateBoneMap(raw: unknown): BoneMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const bm = raw as Record<string, unknown>;
  const roles: BoneRole[] = ['head', 'chest', 'spine', 'shoulderL', 'shoulderR', 'leftEye', 'rightEye'];
  const out: BoneMap = {};
  for (const role of roles) {
    if (typeof bm[role] === 'string' && bm[role]) out[role] = bm[role] as string;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validatePhysicsBones(raw: unknown): PhysicsBonesCfg | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: PhysicsBonesCfg = {};
  const def = validateSpringParamsCfg(r.default);
  if (def) out.default = def;
  if (r.overrides && typeof r.overrides === 'object') {
    const overrides: Record<string, SpringParamsCfg> = {};
    for (const [name, v] of Object.entries(r.overrides as Record<string, unknown>)) {
      const cfg = validateSpringParamsCfg(v);
      if (cfg) overrides[name] = cfg;
    }
    if (Object.keys(overrides).length > 0) out.overrides = overrides;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validateCharacterCfg(raw: unknown): CharacterCfg | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: CharacterCfg = {};
  const boneMap = validateBoneMap(r.boneMap);
  if (boneMap) out.boneMap = boneMap;
  const physicsBones = validatePhysicsBones(r.physicsBones);
  if (physicsBones) out.physicsBones = physicsBones;
  return Object.keys(out).length > 0 ? out : undefined;
}

function validatePerCharacter(raw: unknown): Record<string, CharacterCfg> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, CharacterCfg> = {};
  for (const [file, v] of Object.entries(raw as Record<string, unknown>)) {
    const cfg = validateCharacterCfg(v);
    if (cfg) out[file] = cfg;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validatePlacementCfg(raw: unknown): PlacementCfg {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    framing: (['face', 'upperBody', 'full'] as const).includes(r.framing as Framing)
      ? (r.framing as Framing)
      : DEFAULT_ROOM_SETTINGS.framing,
    fovDeg: clamp(typeof r.fovDeg === 'number' ? r.fovDeg : DEFAULT_ROOM_SETTINGS.fovDeg, 20, 80),
    scaleMul: clamp(typeof r.scaleMul === 'number' ? r.scaleMul : DEFAULT_ROOM_SETTINGS.scaleMul, 0.2, 3),
    offset: validatePos(r.offset) ?? DEFAULT_ROOM_SETTINGS.offset,
    yawDeg: clamp(typeof r.yawDeg === 'number' ? r.yawDeg : DEFAULT_ROOM_SETTINGS.yawDeg, -180, 180),
    customView: validateCustomView(r.customView),
    anchorMode: r.anchorMode === 'floor' ? 'floor' : 'free',
    props: Array.isArray(r.props)
      ? (r.props as unknown[]).map(validateProp).filter((p): p is RoomProp => p !== null)
      : DEFAULT_ROOM_SETTINGS.props,
    idleClip: typeof r.idleClip === 'string' && r.idleClip ? r.idleClip : undefined,
  };
}

function validatePerPlacement(raw: unknown): Record<string, PlacementCfg> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, PlacementCfg> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    out[key] = validatePlacementCfg(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validate(raw: unknown): RoomSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const characterFile = typeof r.characterFile === 'string' ? r.characterFile : DEFAULT_ROOM_SETTINGS.characterFile;

  // One-time migration: legacy top-level boneMap/physicsBones (global, pre-perCharacter) get
  // copied into perCharacter[characterFile] the first time this settings blob is validated,
  // then dropped from the top level so they stop leaking onto other character files.
  const legacyBoneMap = validateBoneMap(r.boneMap);
  const legacyPhysicsBones = validatePhysicsBones(r.physicsBones);
  const perCharacter = validatePerCharacter(r.perCharacter) ?? {};
  if ((legacyBoneMap || legacyPhysicsBones) && !perCharacter[characterFile]) {
    perCharacter[characterFile] = { boneMap: legacyBoneMap, physicsBones: legacyPhysicsBones };
  }

  return {
    characterFile,
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
    customView: validateCustomView(r.customView),
    anchorMode: r.anchorMode === 'floor' ? 'floor' : 'free',
    lights: validateLights(r.lights),
    props: Array.isArray(r.props)
      ? (r.props as unknown[]).map(validateProp).filter((p): p is RoomProp => p !== null)
      : [],
    // Legacy fields are cleared once migrated into perCharacter (see above); getCharacterCfg()
    // still falls back to reading them for callers holding an unmigrated blob (e.g. presets).
    boneMap: perCharacter[characterFile] ? undefined : legacyBoneMap,
    physicsBones: perCharacter[characterFile] ? undefined : legacyPhysicsBones,
    perCharacter: Object.keys(perCharacter).length > 0 ? perCharacter : undefined,
    idleClip: typeof r.idleClip === 'string' && r.idleClip ? r.idleClip : undefined,
    renderMode: r.renderMode === 'live2d' ? 'live2d' : 'model3d',
    perPlacement: validatePerPlacement(r.perPlacement),
  };
}

export function loadRoomSettings(): RoomSettings {
  return validate(getUIPref<unknown>(STORAGE_KEY, {}));
}

export function placementKey(sceneFile: string, characterFile: string): string {
  return `${sceneFile}|${characterFile}`;
}

export function snapshotPlacement(settings: RoomSettings): PlacementCfg {
  return {
    framing: settings.framing,
    fovDeg: settings.fovDeg,
    scaleMul: settings.scaleMul,
    offset: settings.offset,
    yawDeg: settings.yawDeg,
    customView: settings.customView,
    anchorMode: settings.anchorMode,
    props: settings.props,
    idleClip: settings.idleClip,
  };
}

// Snapshots the currently-active scene×model placement, then applies the target combo's
// remembered placement — or leaves the top-level fields untouched if that combo has never
// been configured (legacy fallback: behaves exactly like the pre-perPlacement global blob).
export function switchRoomPlacement(
  settings: RoomSettings,
  next: { characterFile?: string; sceneFile?: string },
): RoomSettings {
  const oldKey = placementKey(settings.sceneFile, settings.characterFile);
  const perPlacement = { ...(settings.perPlacement ?? {}), [oldKey]: snapshotPlacement(settings) };

  const characterFile = next.characterFile ?? settings.characterFile;
  const sceneFile = next.sceneFile ?? settings.sceneFile;
  const newKey = placementKey(sceneFile, characterFile);

  const base: RoomSettings = { ...settings, characterFile, sceneFile, perPlacement };
  const remembered = perPlacement[newKey];
  return remembered ? { ...base, ...remembered } : base;
}

export function saveRoomSettings(settings: RoomSettings): void {
  // Keep the single source of truth (top-level fields) mirrored into perPlacement[currentKey]
  // on every save, so in-place tweaks (offset drag, fov slider, …) aren't lost on the next switch.
  const key = placementKey(settings.sceneFile, settings.characterFile);
  const next: RoomSettings = {
    ...settings,
    perPlacement: { ...(settings.perPlacement ?? {}), [key]: snapshotPlacement(settings) },
  };
  setUIPref<RoomSettings>(STORAGE_KEY, next);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
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
