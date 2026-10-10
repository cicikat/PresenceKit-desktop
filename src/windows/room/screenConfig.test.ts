import { describe, it, expect } from 'vitest';
import { parseScreenConfig, screenClipId, screenFrame } from './screenConfig';
const raw = () => ({ schemaVersion: '1.0.0', target: { node: 'screen', materialName: 'screen' }, clips: { normal: { type: 'image', uri: 'normal.png' }, talk: { type: 'sequence', frames: [{ uri: 'a.png', durationMs: 50 }, { uri: 'b.png', durationMs: 100 }], loop: true, endBehavior: 'hold' } }, mappings: { expressions: { neutral: 'normal' }, activityStates: { speaking: 'talk' } } });
describe('opt-in screen playback contract', () => {
  it('keeps activity and expression independent with explicit fallback', () => {
    const c = parseScreenConfig(raw()); expect(screenClipId(c, 'angry', 'idle')).toBe('normal'); expect(screenClipId(c, 'angry', 'speaking')).toBe('talk');
  });
  it('uses variable frame durations and finite end behavior', () => {
    const c = parseScreenConfig(raw()).clips.talk; if (c.type !== 'sequence') throw Error();
    expect(screenFrame(c, 49)).toBe('a.png'); expect(screenFrame(c, 50)).toBe('b.png'); expect(screenFrame(c, 151)).toBe('a.png');
    expect(screenFrame({ ...c, loop: false, endBehavior: 'neutral' }, 150)).toBeNull();
  });
  it.each(['../x.png', 'https://a/x.png', 'x.svg', 'a/b.png', 'a\\b.png'])('rejects unsafe/unsupported resource %s', uri => {
    const r = raw(); r.clips.normal.uri = uri; expect(() => parseScreenConfig(r)).toThrow();
  });
  it('rejects unknown code presets, absent neutral, overlong sequences and dangling mappings', () => {
    const r: any = raw(); r.clips.bad = { type: 'procedural', preset: 'eval', base: 'normal', fallback: 'normal' }; expect(() => parseScreenConfig(r)).toThrow();
    delete r.clips.bad; r.mappings.expressions.neutral = 'missing'; expect(() => parseScreenConfig(r)).toThrow();
    r.mappings.expressions.neutral = 'normal'; r.clips.talk.frames = Array(61).fill({ uri: 'a.png', durationMs: 40 }); expect(() => parseScreenConfig(r)).toThrow();
  });
});
