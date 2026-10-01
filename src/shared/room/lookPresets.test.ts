import { describe, it, expect } from 'vitest';
import {
  BUILTIN_LOOKS, applyLook, applyAndRemember, saveNewLook, updateLook, deleteLook,
  setSceneLook, resolveSceneLook, isBuiltinLookId, getLook,
} from './lookPresets';
import {
  DEFAULT_ROOM_SETTINGS, DEFAULT_LIGHTS, validateLights, switchRoomPlacement,
} from './roomSettings';
import type { RoomSettings } from './roomSettings';
import { validateGrade, DEFAULT_GRADE } from './gradeConfig';

const base = (): RoomSettings => ({ ...DEFAULT_ROOM_SETTINGS, sceneFile: 'a.glb' });

describe('built-in looks', () => {
  it('ships exactly five', () => {
    expect(Object.keys(BUILTIN_LOOKS)).toHaveLength(5);
  });

  for (const [id, look] of Object.entries(BUILTIN_LOOKS)) {
    it(`${id} passes the same validation as saved data (no value is silently clamped)`, () => {
      expect(validateLights(look.lights)).toEqual(look.lights);
      expect(validateGrade(look.grade)).toEqual(look.grade);
      expect(look.grade.enabled).toBe(true);
      expect(look.nameKey).toMatch(/^room\.editor\.look\./);
    });
  }

  it('actually changes both layers relative to the neutral default', () => {
    for (const look of Object.values(BUILTIN_LOOKS)) {
      expect(look.lights).not.toEqual(DEFAULT_LIGHTS);
      expect(look.grade).not.toEqual(DEFAULT_GRADE);
    }
  });
});

describe('apply / save / update / delete', () => {
  it('applying a look replaces lights and grade with deep copies', () => {
    const look = BUILTIN_LOOKS['builtin:dusk'];
    const next = applyLook(base(), look);
    expect(next.lights).toEqual(look.lights);
    expect(next.lights).not.toBe(look.lights);
    next.lights.key.intensity = 99;
    expect(look.lights.key.intensity).not.toBe(99);
  });

  it('saves the current state as a user look and binds it to the scene', () => {
    const s = saveNewLook(base(), '  My look ', 'u1');
    expect(s.looks?.u1.name).toBe('My look');
    expect(s.lookByScene).toEqual({ 'a.glb': 'u1' });
  });

  it('ignores an empty name', () => {
    expect(saveNewLook(base(), '   ', 'u1')).toEqual(base());
  });

  it('updating overwrites a user look but never touches built-ins', () => {
    let s = saveNewLook(base(), 'L', 'u1');
    s = { ...s, lights: { ...s.lights, shadows: true } };
    expect(updateLook(s, 'u1').looks?.u1.lights.shadows).toBe(true);
    expect(updateLook(s, 'builtin:dusk')).toBe(s);
    expect(updateLook(s, 'missing')).toBe(s);
  });

  it('deleting removes the look and every scene binding to it; built-ins are protected', () => {
    let s = saveNewLook(base(), 'L', 'u1');
    s = setSceneLook(s, 'b.glb', 'u1');
    const d = deleteLook(s, 'u1');
    expect(d.looks?.u1).toBeUndefined();
    expect(d.lookByScene).toEqual({});
    expect(deleteLook(s, 'builtin:dusk')).toBe(s);
  });
});

describe('per-scene memory', () => {
  it('remembers an applied built-in look for the scene', () => {
    const s = applyAndRemember(base(), 'builtin:dusk');
    expect(s.lookByScene?.['a.glb']).toBe('builtin:dusk');
    expect(resolveSceneLook(s, 'a.glb')?.name).toBe('Dusk');
  });

  it('resolves to null for an unbound scene or a deleted look', () => {
    expect(resolveSceneLook(base(), 'a.glb')).toBeNull();
    const dangling = { ...base(), lookByScene: { 'a.glb': 'gone' } };
    expect(resolveSceneLook(dangling, 'a.glb')).toBeNull();
    expect(getLook(base(), 'gone')).toBeNull();
    expect(isBuiltinLookId('builtin:x')).toBe(true);
  });

  it('switching to a scene with a remembered look re-applies it', () => {
    const withMemory = { ...applyAndRemember(base(), 'builtin:dusk'), lights: DEFAULT_LIGHTS, grade: DEFAULT_GRADE };
    const toB = switchRoomPlacement(withMemory, { sceneFile: 'b.glb' });
    expect(toB.lights).toEqual(DEFAULT_LIGHTS);
    const back = switchRoomPlacement(toB, { sceneFile: 'a.glb' });
    expect(back.lights).toEqual(BUILTIN_LOOKS['builtin:dusk'].lights);
    expect(back.grade).toEqual(BUILTIN_LOOKS['builtin:dusk'].grade);
  });

  it('switching only the character does not touch lights', () => {
    const s = applyAndRemember(base(), 'builtin:dusk');
    const next = switchRoomPlacement({ ...s, lights: DEFAULT_LIGHTS }, { characterFile: 'other.glb' });
    expect(next.lights).toEqual(DEFAULT_LIGHTS);
  });
});
