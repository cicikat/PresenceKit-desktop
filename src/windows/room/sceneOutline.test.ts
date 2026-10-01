import { describe, it, expect } from 'vitest';
import { buildOutline, editableIdEquals, editableIdKey, groupOutline, paramControlsFor, canToggleVisibility, extraLightKey, isExtraLightKey, extraLightId, getLightCfg } from './sceneOutline';
import { DEFAULT_ROOM_SETTINGS, DEFAULT_LIGHTS } from '../../shared/room/roomSettings';
import type { RoomSettings, ExtraLightCfg } from '../../shared/room/roomSettings';

function settingsWithProps(): RoomSettings {
  return {
    ...DEFAULT_ROOM_SETTINGS,
    props: [
      { file: 'lamp.glb', pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 },
      { file: 'chair.glb', pos: [1, 0, 0], rot: [0, 0, 0], scale: 1 },
    ],
  };
}

describe('buildOutline', () => {
  it('orders items as character, scene, props (settings order), then lights', () => {
    const outline = buildOutline(settingsWithProps(), null);
    expect(outline.map(item => item.id.kind)).toEqual([
      'character', 'scene', 'prop', 'prop', 'light', 'light', 'light',
    ]);
  });

  it('maps each prop to its settings index in order', () => {
    const outline = buildOutline(settingsWithProps(), null);
    const props = outline.filter(item => item.id.kind === 'prop');
    expect(props.map(item => (item.id as { kind: 'prop'; index: number }).index)).toEqual([0, 1]);
    expect(props.map(item => item.label)).toEqual(['lamp.glb', 'chair.glb']);
  });

  it('marks ambient light as not transformable (no position) but key/charFill as transformable', () => {
    const outline = buildOutline(DEFAULT_ROOM_SETTINGS, null);
    const lights = outline.filter(item => item.id.kind === 'light');
    expect(lights.map(item => item.transformable)).toEqual([false, true, true]);
  });

  it('marks the scene root as not transformable and the character as transformable', () => {
    const outline = buildOutline(DEFAULT_ROOM_SETTINGS, null);
    expect(outline.find(item => item.id.kind === 'scene')?.transformable).toBe(false);
    expect(outline.find(item => item.id.kind === 'character')?.transformable).toBe(true);
  });

  it('prefers the loaded scene file name over settings.sceneFile when provided', () => {
    const outline = buildOutline(DEFAULT_ROOM_SETTINGS, 'actually-loaded.glb');
    expect(outline.find(item => item.id.kind === 'scene')?.label).toBe('actually-loaded.glb');
  });

  it('falls back to settings.sceneFile when nothing has loaded yet', () => {
    const outline = buildOutline(DEFAULT_ROOM_SETTINGS, null);
    expect(outline.find(item => item.id.kind === 'scene')?.label).toBe(DEFAULT_ROOM_SETTINGS.sceneFile);
  });

  it('reflects each light\'s on/off state as its visibility', () => {
    const settings: RoomSettings = {
      ...DEFAULT_ROOM_SETTINGS,
      lights: { ...DEFAULT_LIGHTS, key: { ...DEFAULT_LIGHTS.key, on: false } },
    };
    const outline = buildOutline(settings, null);
    const key = outline.find(item => item.id.kind === 'light' && item.id.key === 'key');
    expect(key?.visible).toBe(false);
  });
});

describe('editableIdEquals', () => {
  it('treats two character ids as equal', () => {
    expect(editableIdEquals({ kind: 'character' }, { kind: 'character' })).toBe(true);
  });

  it('treats null and non-null as unequal', () => {
    expect(editableIdEquals(null, { kind: 'character' })).toBe(false);
    expect(editableIdEquals({ kind: 'character' }, null)).toBe(false);
  });

  it('treats null and null as equal', () => {
    expect(editableIdEquals(null, null)).toBe(true);
  });

  it('distinguishes props by index', () => {
    expect(editableIdEquals({ kind: 'prop', index: 0 }, { kind: 'prop', index: 0 })).toBe(true);
    expect(editableIdEquals({ kind: 'prop', index: 0 }, { kind: 'prop', index: 1 })).toBe(false);
  });

  it('distinguishes lights by key', () => {
    expect(editableIdEquals({ kind: 'light', key: 'key' }, { kind: 'light', key: 'key' })).toBe(true);
    expect(editableIdEquals({ kind: 'light', key: 'key' }, { kind: 'light', key: 'charFill' })).toBe(false);
  });

  it('treats different kinds as unequal even if otherwise shaped the same', () => {
    expect(editableIdEquals({ kind: 'character' }, { kind: 'scene' })).toBe(false);
  });
});

describe('editableIdKey', () => {
  it('produces distinct, stable keys per kind', () => {
    expect(editableIdKey({ kind: 'character' })).toBe('character');
    expect(editableIdKey({ kind: 'scene' })).toBe('scene');
    expect(editableIdKey({ kind: 'prop', index: 2 })).toBe('prop:2');
    expect(editableIdKey({ kind: 'light', key: 'charFill' })).toBe('light:charFill');
  });
});

describe('panel logic helpers', () => {
  it('groups the outline in fixed order and drops empty groups', () => {
    const groups = groupOutline(buildOutline(DEFAULT_ROOM_SETTINGS, null));
    expect(groups.map(g => g.group)).toEqual(['character', 'scene', 'light']);
    expect(groups[2].items).toHaveLength(3);
  });

  it('includes the prop group when props exist', () => {
    expect(groupOutline(buildOutline(settingsWithProps(), null)).map(g => g.group))
      .toEqual(['character', 'scene', 'prop', 'light']);
  });

  it('shows no position control for ambient but does for key', () => {
    expect(paramControlsFor({ kind: 'light', key: 'ambient' })).not.toContain('lightPos');
    expect(paramControlsFor({ kind: 'light', key: 'key' })).toContain('lightPos');
  });

  it('gives props a delete control and characters a yaw control', () => {
    expect(paramControlsFor({ kind: 'prop', index: 0 })).toContain('propDelete');
    expect(paramControlsFor({ kind: 'character' })).toContain('yaw');
  });

  it('disables visibility toggling for character and scene only', () => {
    expect(canToggleVisibility({ kind: 'character' })).toBe(false);
    expect(canToggleVisibility({ kind: 'scene' })).toBe(false);
    expect(canToggleVisibility({ kind: 'prop', index: 0 })).toBe(true);
    expect(canToggleVisibility({ kind: 'light', key: 'key' })).toBe(true);
  });

  it('reflects a hidden prop as not visible in the outline', () => {
    const s = settingsWithProps();
    s.props[1] = { ...s.props[1], hidden: true };
    const props = buildOutline(s, null).filter(i => i.group === 'prop');
    expect(props.map(p => p.visible)).toEqual([true, false]);
  });
});

describe('extra lights in the outline', () => {
  const withExtras = (): RoomSettings => ({
    ...DEFAULT_ROOM_SETTINGS,
    lights: {
      ...DEFAULT_LIGHTS,
      extra: [
        { id: 'a', type: 'point', on: true, intensity: 1, color: '#ffffff', pos: [0, 1, 0] },
        { id: 'b', type: 'spot', on: false, intensity: 1, color: '#ffffff', pos: [1, 1, 0] },
      ],
    },
  });

  it('appends extras after the fixed lights, transformable, with their type as label', () => {
    const lights = buildOutline(withExtras(), null).filter(i => i.group === 'light');
    expect(lights.map(i => i.label)).toEqual(['ambient', 'key', 'charFill', 'point', 'spot']);
    expect(lights.slice(3).every(i => i.transformable)).toBe(true);
    expect(lights.map(i => i.visible)).toEqual([true, true, true, true, false]);
  });

  it('encodes and decodes the extra key in one way only', () => {
    expect(extraLightKey('a')).toBe('extra:a');
    expect(isExtraLightKey('extra:a')).toBe(true);
    expect(isExtraLightKey('key')).toBe(false);
    expect(extraLightId(extraLightKey('x-1'))).toBe('x-1');
  });

  it('resolves fixed and extra light configs, and undefined for a removed extra', () => {
    const { lights } = withExtras();
    expect(getLightCfg(lights, 'key')).toBe(lights.key);
    expect((getLightCfg(lights, extraLightKey('b')) as ExtraLightCfg | undefined)?.type).toBe('spot');
    expect(getLightCfg(lights, extraLightKey('gone'))).toBeUndefined();
  });

  it('gives extras shape and delete controls but fixed lights none', () => {
    expect(paramControlsFor({ kind: 'light', key: extraLightKey('a') })).toEqual(
      expect.arrayContaining(['lightPos', 'extraShape', 'extraDelete']));
    expect(paramControlsFor({ kind: 'light', key: 'key' })).not.toContain('extraDelete');
  });

  it('keeps two extras distinct for selection equality', () => {
    expect(editableIdEquals({ kind: 'light', key: extraLightKey('a') }, { kind: 'light', key: extraLightKey('b') })).toBe(false);
    expect(editableIdKey({ kind: 'light', key: extraLightKey('a') })).toBe('light:extra:a');
  });
});
