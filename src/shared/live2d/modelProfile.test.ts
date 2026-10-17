import { describe, expect, it } from 'vitest';
import { availableProfile, expressionFor, findNativeMotion, listNativeMotions, protectedParameters, readModelProfile } from './modelProfile';

describe('asset-owned Live2D capabilities', () => {
  it('addresses empty groups precisely without random selection', () => {
    const motions = listNativeMotions({ '': [{ File: 'nod' }, { File: 'shake' }], Idle: [{ File: 'idle' }] });
    expect(findNativeMotion(motions, 'shake')).toEqual({ group: '', index: 1, file: 'shake' });
    expect(findNativeMotion(motions, 'missing')).toBeNull();
  });
  it('only exposes mapped expressions actually present on the model', () => {
    const profile = readModelProfile({ version: 1, expressions: { happy: 'weixiao.exp3.json', sad: 'absent' } });
    expect(expressionFor(profile, 'happy', ['weixiao.exp3.json'])).toBe('weixiao.exp3.json');
    expect(expressionFor(profile, 'sad', ['weixiao.exp3.json'])).toBeNull();
    expect(readModelProfile({ version: 99 })).toBeNull();
  });
  it('protects only the active authored curves and expression parameters', () => {
    const profile = readModelProfile({ version: 1, preserveNativeParameters: true,
      motionParameters: { nod: ['ParamAngleY'], idle: ['ParamBreath'] },
      expressionParameters: { smile: ['ParamMouthForm'] } });
    expect([...protectedParameters(profile, 'nod', 'smile')]).toEqual(['ParamAngleY', 'ParamMouthForm']);
    expect(protectedParameters(null, 'nod', 'smile').size).toBe(0);
  });
  it('does not advertise actions or touch reactions with missing dependencies', () => {
    const profile = readModelProfile({ version: 1,
      actions: { nod: { enter: 'nod' }, lean: { enter: 'on', exit: 'missing-off' } },
      hitAreas: { head: 'nod', hand: 'lean' }, expressions: { happy: 'missing-smile' } });
    const result = availableProfile(profile, [{ file: 'nod', group: '', index: 0 }], []);
    expect(Object.keys(result!.actions)).toEqual(['nod']);
    expect(result!.hitAreas).toEqual({ head: 'nod' });
    expect(result!.expressions).toEqual({});
  });
});
