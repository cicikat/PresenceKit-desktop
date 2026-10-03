import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseMotionsConfig } from './motionConfig';
import { retargetClip, type RigSide } from './retarget';

type Q4 = [number, number, number, number];
const qa = (axis: 'x' | 'y' | 'z', a: number): Q4 => {
  const v = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  const q = new THREE.Quaternion().setFromAxisAngle(v, a);
  return [q.x, q.y, q.z, q.w];
};
const source: RigSide = {
  names: { hips: 'Hips', upperArmL: 'ArmL', head: 'Head' },
  rest: { hips: [0, 0, 0, 1], upperArmL: qa('z', 0.5), head: [0, 0, 0, 1] },
  hipHeight: 1,
};
const target: RigSide = {
  names: { hips: 'DEF-hips', upperArmL: 'DEF-arm', head: 'DEF-head' },
  rest: { hips: [0, 0, 0, 1], upperArmL: qa('z', -0.4), head: [0, 0, 0, 1] },
  hipHeight: 2,
};

function clip(): THREE.AnimationClip {
  return new THREE.AnimationClip('wave', 1, [
    new THREE.QuaternionKeyframeTrack('ArmL.quaternion', [0, 1], [...qa('z', 0.5), ...qa('z', 0.8)]),
    new THREE.QuaternionKeyframeTrack('Head.quaternion', [0, 1], [0, 0, 0, 1, ...qa('y', 0.2)]),
    new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 1, 0, 1, 1, 0]),
    new THREE.VectorKeyframeTrack('ArmL.position', [0, 1], [0, 0, 0, 0, 0, 0]),
  ]);
}

describe('CA-05 retarget', () => {
  it('maps source rest to target rest and keeps the animated delta', () => {
    const { clip: out } = retargetClip(clip(), source, target);
    const arm = out.tracks.find((t) => t.name === 'DEF-arm.quaternion')!;
    const at = (i: number) => new THREE.Quaternion(arm.values[i * 4], arm.values[i * 4 + 1], arm.values[i * 4 + 2], arm.values[i * 4 + 3]);
    expect(at(0).angleTo(new THREE.Quaternion().fromArray(qa('z', -0.4)))).toBeLessThan(1e-5);
    expect(at(1).angleTo(new THREE.Quaternion().fromArray(qa('z', -0.1)))).toBeLessThan(1e-5);
  });
  it('drops position tracks in place and scales hips for root motion keep', () => {
    expect(retargetClip(clip(), source, target).clip.tracks.some((t) => t.name.endsWith('.position'))).toBe(false);
    const kept = retargetClip(clip(), source, target, { rootMotion: 'keep' }).clip.tracks.find((t) => t.name === 'DEF-hips.position')!;
    expect(Array.from(kept.values)).toEqual([0, 2, 0, 2, 2, 0]);
  });
  it('applies masks and performer exclusions, and reports roles the target lacks', () => {
    expect(retargetClip(clip(), source, target, { mask: 'arms' }).clip.tracks.map((t) => t.name)).toEqual(['DEF-arm.quaternion']);
    expect(retargetClip(clip(), source, target, { excludeRoles: ['head'] }).clip.tracks.some((t) => t.name.startsWith('DEF-head'))).toBe(false);
    const half: RigSide = { names: { hips: 'DEF-hips' }, rest: { hips: [0, 0, 0, 1] } };
    expect(retargetClip(clip(), source, half).missingOnTarget.sort()).toEqual(['head', 'upperArmL']);
  });
});

describe('CA-05 motions config', () => {
  const base = { id: 'wave', clip: 'Wave', file: 'wave.glb', loop: false, mask: 'arms', priority: 5, headEye: 'performer' };
  const ok = { schemaVersion: '1.0.0', motions: [base] };
  it('parses with defaults', () => {
    const r = parseMotionsConfig(ok);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.config.motions[0]).toMatchObject({ rootMotion: 'inPlace', fadeInMs: 200, mask: 'arms' });
  });
  it('rejects traversal, duplicates and bad enums', () => {
    expect(parseMotionsConfig({ ...ok, motions: [{ ...base, file: '../x.glb' }] })).toMatchObject({ ok: false });
    expect(parseMotionsConfig({ ...ok, motions: [base, base] })).toMatchObject({ ok: false });
    expect(parseMotionsConfig({ ...ok, motions: [{ ...base, mask: 'legs' }] })).toMatchObject({ ok: false });
  });
});
