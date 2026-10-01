import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GRADE, validateGrade, gradeUniformsFrom, isNeutralGradeShader, needsComposer, applyGradeToRgb,
} from './gradeConfig';

describe('validateGrade', () => {
  it('falls back to defaults for garbage input', () => {
    expect(validateGrade(undefined)).toEqual(DEFAULT_GRADE);
    expect(validateGrade('x')).toEqual(DEFAULT_GRADE);
    expect(validateGrade({ exposure: 'hi', toneMapping: 'bogus', bloom: 5 })).toEqual(DEFAULT_GRADE);
  });

  it('clamps out-of-range numbers', () => {
    const g = validateGrade({
      exposure: 99, temperature: -5, saturation: 9, contrast: 0, lift: 1, vignette: 3,
      bloom: { on: true, strength: 99, radius: -1, threshold: 2 },
    });
    expect(g.exposure).toBe(3);
    expect(g.temperature).toBe(-1);
    expect(g.saturation).toBe(2);
    expect(g.contrast).toBe(0.5);
    expect(g.lift).toBe(0.2);
    expect(g.vignette).toBe(1);
    expect(g.bloom).toEqual({ on: true, strength: 3, radius: 0, threshold: 1 });
  });

  it('rejects NaN and Infinity', () => {
    expect(validateGrade({ exposure: NaN }).exposure).toBe(1);
    expect(validateGrade({ contrast: Infinity }).contrast).toBe(1);
  });

  it('keeps valid tone mapping names', () => {
    expect(validateGrade({ toneMapping: 'agx' }).toneMapping).toBe('agx');
  });
});

describe('gradeUniformsFrom', () => {
  it('produces identity uniforms for the default config', () => {
    const u = gradeUniformsFrom(DEFAULT_GRADE);
    expect(u.gain).toEqual([1, 1, 1]);
    expect(u.contrast).toBe(1);
    expect(u.saturation).toBe(1);
    expect(u.lift).toBe(0);
    expect(u.vignette).toBe(0);
    expect(isNeutralGradeShader(DEFAULT_GRADE)).toBe(true);
  });

  it('warms: more red, less blue', () => {
    const [r, , b] = gradeUniformsFrom({ ...DEFAULT_GRADE, temperature: 1 }).gain;
    expect(r).toBeGreaterThan(1);
    expect(b).toBeLessThan(1);
  });

  it('magenta tint lowers green', () => {
    expect(gradeUniformsFrom({ ...DEFAULT_GRADE, tint: 1 }).gain[1]).toBeLessThan(1);
  });
});

describe('applyGradeToRgb', () => {
  it('is identity for neutral uniforms', () => {
    const src: [number, number, number] = [0.2, 0.5, 0.8];
    const out = applyGradeToRgb(src, gradeUniformsFrom(DEFAULT_GRADE));
    out.forEach((v, i) => expect(v).toBeCloseTo(src[i]));
  });

  it('zero saturation yields gray', () => {
    const out = applyGradeToRgb([1, 0, 0], gradeUniformsFrom({ ...DEFAULT_GRADE, saturation: 0 }));
    expect(out[0]).toBeCloseTo(out[1]);
    expect(out[1]).toBeCloseTo(out[2]);
  });

  it('contrast leaves the 0.5 pivot unchanged', () => {
    const out = applyGradeToRgb([0.5, 0.5, 0.5], gradeUniformsFrom({ ...DEFAULT_GRADE, contrast: 1.8 }));
    expect(out[0]).toBeCloseTo(0.5);
  });
});

describe('needsComposer', () => {
  it('is false when disabled even if values are non-neutral', () => {
    expect(needsComposer({ ...DEFAULT_GRADE, temperature: 1 })).toBe(false);
  });
  it('is false when only tone mapping/exposure differ (the renderer handles those)', () => {
    expect(needsComposer({ ...DEFAULT_GRADE, enabled: true, toneMapping: 'aces', exposure: 1.4 })).toBe(false);
  });
  it('is true for a non-neutral shader or bloom', () => {
    expect(needsComposer({ ...DEFAULT_GRADE, enabled: true, vignette: 0.3 })).toBe(true);
    expect(needsComposer({ ...DEFAULT_GRADE, enabled: true, bloom: { ...DEFAULT_GRADE.bloom, on: true } })).toBe(true);
  });
});
