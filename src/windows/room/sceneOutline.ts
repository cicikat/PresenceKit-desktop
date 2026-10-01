// Single source of truth for "what can be selected in the room editor". Pure data/functions
// only — no three.js imports here, so this module is cheap to unit test and safe to import
// from both the hook (useRoomScene.ts) and the panel (EditorPanel.tsx, work order 2) without
// pulling in rendering concerns.
import type { RoomSettings, RoomProp, RoomLights, LightCfg, ExtraLightCfg } from '../../shared/room/roomSettings';

/**
 * Fixed lights are named; user-added lights are encoded as the string `extra:<id>` (one
 * encoding only — never a `{ extra }` object form). Use the helpers below instead of
 * building or splitting the prefix by hand.
 */
export type FixedLightKey = 'ambient' | 'key' | 'charFill';
export type ExtraLightKey = `extra:${string}`;
export type LightKey = FixedLightKey | ExtraLightKey;

export function extraLightKey(id: string): ExtraLightKey { return `extra:${id}`; }
export function isExtraLightKey(key: LightKey): key is ExtraLightKey { return key.startsWith('extra:'); }
export function extraLightId(key: ExtraLightKey): string { return key.slice('extra:'.length); }

/** Resolves a light key to its config, or undefined when an extra light no longer exists. */
export function getLightCfg(lights: RoomLights, key: LightKey): LightCfg | ExtraLightCfg | undefined {
  if (isExtraLightKey(key)) {
    const id = extraLightId(key);
    return lights.extra.find(e => e.id === id);
  }
  return lights[key];
}

export type EditableId =
  | { kind: 'character' }
  | { kind: 'scene' }
  | { kind: 'prop'; index: number }
  | { kind: 'light'; key: LightKey };

export interface OutlineItem {
  id: EditableId;
  /** Panel display label — an i18n key or a model filename, never literal Chinese here. */
  label: string;
  group: 'character' | 'scene' | 'prop' | 'light';
  /** Whether a gizmo can attach to this item. Ambient light (no position) and the scene root
   * (not individually placeable) are not transformable. */
  transformable: boolean;
  /** Whether the panel should show color/intensity controls for this row. */
  hasLightParams: boolean;
  /** Drives the panel's eye icon. */
  visible: boolean;
}

function propLabel(prop: RoomProp, index: number): string {
  return prop.file || `prop-${index}`;
}

/**
 * Builds the outline in a fixed order — character, scene, props (settings order), lights —
 * so the panel renders it verbatim without re-sorting.
 */
export function buildOutline(settings: RoomSettings, loadedSceneFile: string | null): OutlineItem[] {
  const items: OutlineItem[] = [];

  items.push({
    id: { kind: 'character' },
    label: settings.characterFile,
    group: 'character',
    transformable: true,
    hasLightParams: false,
    visible: true,
  });

  items.push({
    id: { kind: 'scene' },
    label: loadedSceneFile ?? settings.sceneFile,
    group: 'scene',
    transformable: false,
    hasLightParams: false,
    visible: true,
  });

  (settings.props ?? []).forEach((prop, index) => {
    items.push({
      id: { kind: 'prop', index },
      label: propLabel(prop, index),
      group: 'prop',
      transformable: true,
      hasLightParams: false,
      visible: !prop.hidden,
    });
  });

  const fixedKeys: FixedLightKey[] = ['ambient', 'key', 'charFill'];
  for (const key of fixedKeys) {
    items.push({
      id: { kind: 'light', key },
      label: key,
      group: 'light',
      transformable: key !== 'ambient',
      hasLightParams: true,
      visible: settings.lights[key].on,
    });
  }
  for (const extra of settings.lights.extra) {
    items.push({
      id: { kind: 'light', key: extraLightKey(extra.id) },
      label: extra.type,
      group: 'light',
      transformable: true,
      hasLightParams: true,
      visible: extra.on,
    });
  }

  return items;
}

export function editableIdEquals(a: EditableId | null, b: EditableId | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'prop' && b.kind === 'prop') return a.index === b.index;
  if (a.kind === 'light' && b.kind === 'light') return a.key === b.key;
  return true;
}

/** Stable string key for React list keys / dataset attributes. */
export function editableIdKey(id: EditableId): string {
  switch (id.kind) {
    case 'prop': return `prop:${id.index}`;
    case 'light': return `light:${id.key}`;
    default: return id.kind;
  }
}

export const OUTLINE_GROUPS = ['character', 'scene', 'prop', 'light'] as const;

/** Groups an outline for panel rendering, preserving item order and dropping empty groups. */
export function groupOutline(items: OutlineItem[]): { group: OutlineItem['group']; items: OutlineItem[] }[] {
  return OUTLINE_GROUPS
    .map(group => ({ group, items: items.filter(item => item.group === group) }))
    .filter(g => g.items.length > 0);
}

export type ParamControl =
  | 'yaw' | 'scale' | 'sceneFile' | 'useSceneLights'
  | 'propPos' | 'propRot' | 'propDelete'
  | 'lightColor' | 'lightIntensity' | 'lightPos' | 'extraShape' | 'extraDelete';

/** Which inline controls the panel shows for the selected item (ambient has no position). */
export function paramControlsFor(id: EditableId): ParamControl[] {
  switch (id.kind) {
    case 'character': return ['yaw', 'scale'];
    case 'scene': return ['sceneFile', 'useSceneLights'];
    case 'prop': return ['propPos', 'propRot', 'scale', 'propDelete'];
    case 'light':
      if (id.key === 'ambient') return ['lightColor', 'lightIntensity'];
      if (isExtraLightKey(id.key)) return ['lightColor', 'lightIntensity', 'lightPos', 'extraShape', 'extraDelete'];
      return ['lightColor', 'lightIntensity', 'lightPos'];
  }
}

/** The eye icon only applies to props and lights; character/scene hiding has no meaning in a call. */
export function canToggleVisibility(id: EditableId): boolean {
  return id.kind === 'prop' || id.kind === 'light';
}
