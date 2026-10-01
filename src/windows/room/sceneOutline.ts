// Single source of truth for "what can be selected in the room editor". Pure data/functions
// only — no three.js imports here, so this module is cheap to unit test and safe to import
// from both the hook (useRoomScene.ts) and the panel (EditorPanel.tsx, work order 2) without
// pulling in rendering concerns.
import type { RoomSettings, RoomProp } from '../../shared/room/roomSettings';

// RoomProp has no `hidden` field yet — placeholder type kept for the `propLabel` signature
// below, which stays shape-compatible once work order 2 adds the field.

/** `LightKey` only covers the three fixed lights for now; work order 3 extends it to `extra:<id>`. */
export type LightKey = 'ambient' | 'key' | 'charFill';

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
      // `RoomProp.hidden` lands in work order 2 together with the panel's eye icon; until then
      // every prop is visible, matching current (pre-outliner) behaviour exactly.
      visible: true,
    });
  });

  const lightKeys: LightKey[] = ['ambient', 'key', 'charFill'];
  for (const key of lightKeys) {
    const cfg = settings.lights[key];
    items.push({
      id: { kind: 'light', key },
      label: key,
      group: 'light',
      transformable: key !== 'ambient',
      hasLightParams: true,
      visible: cfg.on,
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
