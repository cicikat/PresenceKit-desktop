import { describe, it, expect } from 'vitest';
import { validateLights, DEFAULT_LIGHTS, MAX_EXTRA_LIGHTS } from './roomSettings';

describe('validateLights extra / shadows', () => {
  it('upgrades an old save with no extra/shadows to the defaults', () => {
    const old = { useSceneLights: true, ambient: { on: true, intensity: 0.7, color: '#ffffff' } };
    const l = validateLights(old);
    expect(l.extra).toEqual([]);
    expect(l.shadows).toBe(false);
    expect(l.useSceneLights).toBe(true);
    expect(l.ambient.intensity).toBe(0.7);
  });

  it('returns defaults for garbage input without throwing', () => {
    expect(validateLights(undefined)).toEqual(DEFAULT_LIGHTS);
    expect(validateLights({ extra: 'nope', shadows: 'yes' })).toEqual(DEFAULT_LIGHTS);
  });

  it('caps extra lights at the maximum', () => {
    const extra = Array.from({ length: 9 }, (_, i) => ({ id: `l${i}`, type: 'point' }));
    expect(validateLights({ extra }).extra).toHaveLength(MAX_EXTRA_LIGHTS);
  });

  it('falls back to defaults for a missing field, bad type and bad color', () => {
    const [e] = validateLights({ extra: [{ type: 'laser', color: 'red', intensity: 99 }] }).extra;
    expect(e.type).toBe('point');
    expect(e.color).toBe('#ffffff');
    expect(e.intensity).toBe(4);
    expect(e.id).toBeTruthy();
    expect(e.angleDeg).toBe(45);
    expect(e.charOnly).toBe(false);
  });

  it('keeps valid spot parameters and clamps out-of-range ones', () => {
    const [e] = validateLights({
      extra: [{ id: 'a', type: 'spot', angleDeg: 500, penumbra: 2, distance: -3, charOnly: true, color: '#aabbcc' }],
    }).extra;
    expect(e).toMatchObject({ id: 'a', type: 'spot', angleDeg: 90, penumbra: 1, distance: 0, charOnly: true, color: '#aabbcc' });
  });

  it('skips non-object entries and de-duplicates ids', () => {
    const extra = validateLights({ extra: [null, 3, { id: 'x' }, { id: 'x' }] }).extra;
    expect(extra).toHaveLength(2);
    expect(new Set(extra.map(e => e.id)).size).toBe(2);
  });
});
