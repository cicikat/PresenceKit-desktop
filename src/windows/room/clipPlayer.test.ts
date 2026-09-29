import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { selectIdleClip, isMorphOnlyClip, filterClipTracks, collectExcludedBoneNames } from './clipPlayer';

/** A clip whose only tracks are morph weights — what Blender emits per shape-keyed mesh. */
function morphClip(name: string, nodes: string[] = ['Head_Face_Neck']): THREE.AnimationClip {
  return new THREE.AnimationClip(name, 1, nodes.map(n =>
    new THREE.NumberKeyframeTrack(`${n}.morphTargetInfluences`, [0, 1], [0, 1])));
}

/** A clip that drives bone rotation, i.e. a real body animation. */
function boneClip(name: string, bones: string[] = ['DEF-spine.006']): THREE.AnimationClip {
  return new THREE.AnimationClip(name, 1, bones.map(b =>
    new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])));
}

describe('isMorphOnlyClip', () => {
  it('recognizes a Blender per-mesh shape-key export clip', () => {
    expect(isMorphOnlyClip(morphClip('球体动作'))).toBe(true);
  });

  it('does not treat a bone animation as morph-only', () => {
    expect(isMorphOnlyClip(boneClip('idle'))).toBe(false);
  });

  it('does not treat a mixed clip as morph-only, since it still drives bones', () => {
    const mixed = new THREE.AnimationClip('mixed', 1, [
      ...morphClip('m').tracks, ...boneClip('b').tracks,
    ]);
    expect(isMorphOnlyClip(mixed)).toBe(false);
  });

  it('treats an empty clip as not morph-only rather than crashing', () => {
    expect(isMorphOnlyClip(new THREE.AnimationClip('empty', 1, []))).toBe(false);
  });
});

describe('selectIdleClip', () => {
  it('returns null when a model has nothing but morph-only clips', () => {
    // The real Yexuan_Toon_v006 case: five clips, all shape-key weights. Playing any of
    // them would fight the performer for the same morph weights.
    const clips = ['Key动作.001', 'Key动作.002', '平面.002动作', '球体动作', 'Key.001动作.001']
      .map(n => morphClip(n));
    expect(selectIdleClip(clips)).toBeNull();
  });

  it('skips morph-only clips to find a real bone animation', () => {
    const clips = [morphClip('球体动作'), boneClip('breathe')];
    expect(selectIdleClip(clips)?.name).toBe('breathe');
  });

  it('prefers a clip named idle over any other bone clip', () => {
    const clips = [boneClip('dance'), boneClip('idle')];
    expect(selectIdleClip(clips)?.name).toBe('idle');
  });

  it('honours an explicit override even when it is a morph-only clip', () => {
    // The user asked for it by name; respecting that beats second-guessing them.
    const clips = [boneClip('idle'), morphClip('球体动作')];
    expect(selectIdleClip(clips, '球体动作')?.name).toBe('球体动作');
  });

  it('falls back to automatic selection when the override names nothing', () => {
    const clips = [boneClip('breathe')];
    expect(selectIdleClip(clips, 'no_such_clip')?.name).toBe('breathe');
  });

  it('returns null for no clips at all', () => {
    expect(selectIdleClip([])).toBeNull();
  });
});

describe('filterClipTracks', () => {
  it('drops tracks for performer-owned bones and reports what remains', () => {
    const clip = boneClip('idle', ['DEF-spine.006', 'DEF-spine.001', 'DEF-eye.L']);
    const remaining = filterClipTracks(clip, new Set(['DEF-spine.006', 'DEF-eye.L']));
    expect([...remaining]).toEqual(['DEF-spine.001']);
  });

  it('splits on the last dot so a dotted bone name survives', () => {
    // `DEF-spine.006.quaternion` must resolve to `DEF-spine.006`, not `DEF-spine`.
    const clip = boneClip('idle', ['DEF-spine.006']);
    expect(filterClipTracks(clip, new Set(['DEF-spine'])).has('DEF-spine.006')).toBe(true);
  });
});

describe('collectExcludedBoneNames', () => {
  it('excludes head and eyes plus every spring chain bone and its leaf', () => {
    const bone = (n: string) => { const b = new THREE.Bone(); b.name = n; return b; };
    const head = bone('DEF-spine.006');
    const chainBone = bone('DEF-hair_back_01.001');
    const leaf = bone('DEF-hair_back_01.002');
    const excluded = collectExcludedBoneNames(head, bone('DEF-eye.L'), bone('DEF-eye.R'), [
      { nodes: [{ bone: chainBone, childBone: leaf }] } as never,
    ]);
    expect([...excluded].sort()).toEqual(
      ['DEF-eye.L', 'DEF-eye.R', 'DEF-hair_back_01.001', 'DEF-hair_back_01.002', 'DEF-spine.006'],
    );
  });

  it('tolerates a model with no head or eye bones', () => {
    expect(collectExcludedBoneNames(null, null, null, []).size).toBe(0);
  });
});
