import { describe, expect, it } from 'vitest';
import {
  faceUsesMorphs, gazeUsesBones, gazeUsesMorphs, resolveRoutes, validatePerformanceRoutes,
  type RigCapability,
} from './performanceRoutes';

const none: RigCapability = {
  expressionMorphs: false, gazeMorphs: false, eyeBones: false,
  faceBones: false, idleClip: false, headBone: false,
};
const cap = (over: Partial<RigCapability>): RigCapability => ({ ...none, ...over });

describe('CA-02 performance routing', () => {
  it('auto resolves a morph-only model to the current behavior', () => {
    const r = resolveRoutes(undefined, cap({ expressionMorphs: true, gazeMorphs: true, headBone: true }));
    expect(r).toMatchObject({ face: 'morph', gaze: 'morph', body: 'procedural' });
    expect(r.notes).toEqual([]);
  });

  it('auto layers a clip under procedural motion when one exists', () => {
    expect(resolveRoutes(undefined, cap({ idleClip: true })).body).toBe('clip+procedural');
  });

  it('auto prefers eye bones and never combines drivers implicitly', () => {
    const r = resolveRoutes(undefined, cap({ gazeMorphs: true, eyeBones: true, headBone: true }));
    expect(r.gaze).toBe('bone');
    expect(gazeUsesMorphs(r.gaze)).toBe(false);
    expect(gazeUsesBones(r.gaze)).toBe(true);
  });

  it('mixed is only reachable when explicitly requested and both drivers exist', () => {
    const both = cap({ gazeMorphs: true, eyeBones: true });
    expect(resolveRoutes({ gaze: 'mixed' }, both).gaze).toBe('mixed');
    const degraded = resolveRoutes({ gaze: 'mixed' }, cap({ expressionMorphs: true, eyeBones: true }));
    expect(degraded.gaze).toBe('bone');
    expect(degraded.notes).toHaveLength(1);
  });

  it('auto layers face bones over morphs but keeps morphs authoritative', () => {
    const r = resolveRoutes(undefined, cap({ expressionMorphs: true, faceBones: true }));
    expect(r.face).toBe('morph+bone');
    expect(faceUsesMorphs(r.face)).toBe(true);
  });

  it('degrades a requested driver the model lacks and explains why', () => {
    const r = resolveRoutes({ face: 'bone', gaze: 'bone' }, cap({ expressionMorphs: true, headBone: true }));
    expect(r.face).toBe('off');
    expect(r.gaze).toBe('headOnly');
    expect(r.notes).toHaveLength(2);
  });

  it('reports gaze unavailable only when no driver at all remains', () => {
    const r = resolveRoutes(undefined, none);
    expect(r).toMatchObject({ face: 'off', gaze: 'off', body: 'procedural' });
    expect(r.notes).toHaveLength(2);
  });

  it('honors explicit off without inventing a fallback', () => {
    const all = cap({ expressionMorphs: true, gazeMorphs: true, eyeBones: true, idleClip: true, headBone: true });
    expect(resolveRoutes({ face: 'off', gaze: 'off', body: 'off' }, all))
      .toMatchObject({ face: 'off', gaze: 'off', body: 'off', notes: [] });
  });

  it('drops auto and unknown values so stored config stays minimal', () => {
    expect(validatePerformanceRoutes({ face: 'auto', gaze: 'auto', body: 'auto' })).toBeUndefined();
    expect(validatePerformanceRoutes({ face: 'wat', gaze: 12 })).toBeUndefined();
    expect(validatePerformanceRoutes({ face: 'bone', gaze: 'auto' })).toEqual({ face: 'bone' });
    expect(validatePerformanceRoutes(['bone'])).toBeUndefined();
  });
});
