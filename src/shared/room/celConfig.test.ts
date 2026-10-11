import { describe, expect, it } from 'vitest';
import { DEFAULT_CEL, celRegion, celCategory, resolveCel, validateCel, validateCelPresets } from './celConfig';

describe('local Room material settings', () => {
  it('keeps old saves opt-in and explicit original overrides the URL', () => {
    expect(validateCel(undefined)).toBeUndefined();
    expect(resolveCel(undefined, false).mode).toBe('original');
    expect(resolveCel(undefined, true).mode).toBe('cel');
    expect(resolveCel({ ...DEFAULT_CEL, mode: 'original' }, true).mode).toBe('original');
  });
  it('round trips category colors independently and rejects invalid persisted values', () => {
    const cfg = validateCel({ ...DEFAULT_CEL, palettes: { porcelain: { shade: '#123456' } },
      outlinePx: 900, bandWidth: -4, bandSaturation: NaN, mode: 'bad' })!;
    expect(cfg.palettes.porcelain.shade).toBe('#123456');
    expect(cfg.palettes.metal).toEqual(DEFAULT_CEL.palettes.metal);
    expect(cfg).toMatchObject({ outlinePx: 6, bandWidth: 0, bandSaturation: 0.95, mode: 'original' });
    expect(validateCel(JSON.parse(JSON.stringify(cfg)))).toEqual(cfg);
  });
  it('moves the narrow terminator with the light threshold rather than camera-facing normals', () => {
    const cfg = { ...DEFAULT_CEL, shadowCoverage: 0.7, bandWidth: 0.04 };
    expect(celRegion(0.4, cfg)).toBe('band');
    expect(celRegion(0.5, cfg)).toBe('lit');
    expect(celRegion(0, cfg)).toBe('shade');
    expect(celRegion(-0.9, cfg)).toBe('deep');
    expect(celRegion(0.4, { ...cfg, shadowCoverage: 0.8 })).toBe('shade');
    expect(celRegion(0.4, { ...cfg, bandWidth: 0 })).not.toBe('band');
  });
  it('assigns different palettes to sleeve, shoulder metal, cape, skin and accents', () => {
    expect(['Outfit_Porcelain', 'TV_Details_Silver', 'Cape_Accessories_Indigo', 'Hands_Skin', 'TV_Details_Cobalt'].map(celCategory))
      .toEqual(['porcelain', 'metal', 'dark', 'skin', 'accent']);
  });
  it('preserves user presets across JSON reload and filters malformed saved entries', () => {
    const saved = { 'user-test': { name: ' Blue-gray ', config: { ...DEFAULT_CEL, outlinePx: 5 } },
      builtin: { name: 'bad', config: DEFAULT_CEL }, 'user-empty': { name: '', config: DEFAULT_CEL } };
    const clean = validateCelPresets(JSON.parse(JSON.stringify(saved)))!;
    expect(Object.keys(clean)).toEqual(['user-test']);
    expect(clean['user-test'].name).toBe('Blue-gray');
    expect(clean['user-test'].config.outlinePx).toBe(5);
    expect(clean['user-test'].config.palettes).toEqual(DEFAULT_CEL.palettes);
  });
});
