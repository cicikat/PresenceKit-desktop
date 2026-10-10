import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CharacterPerformer } from './performer';
import { filterClipTracks } from '../../windows/room/clipPlayer';

// Test-only Node IO; the app's DOM-only tsconfig deliberately has no Node types.
const { readFileSync } = await vi.importActual<{ readFileSync(path: string): {
  readUInt32LE(offset: number): number;
  subarray(start: number, end?: number): { toString(): string; readFloatLE(offset: number): number };
} }>('node:fs');

/** Replay the real GLB's node tree and FLOAT animation accessors without loading
 * textures/GPU. Names follow GLTFLoader's PropertyBinding sanitization. */
function asset() {
  const bytes = readFileSync('public/room/character/TV_Character_Rigged_v03.glb');
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const bin = bytes.subarray(28 + jsonLength);
  const nodes = json.nodes.map((n: any) => {
    const bone = new THREE.Bone();
    bone.name = THREE.PropertyBinding.sanitizeNodeName(n.name ?? '');
    if (n.translation) bone.position.fromArray(n.translation);
    if (n.rotation) bone.quaternion.fromArray(n.rotation);
    if (n.scale) bone.scale.fromArray(n.scale);
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(bone.position, bone.quaternion, bone.scale);
    return bone;
  });
  json.nodes.forEach((n: any, i: number) => n.children?.forEach((c: number) => nodes[i].add(nodes[c])));
  const model = new THREE.Group();
  json.scenes[json.scene ?? 0].nodes.forEach((i: number) => model.add(nodes[i]));
  function values(index: number): number[] {
    const a = json.accessors[index];
    const view = json.bufferViews[a.bufferView];
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
    if (a.componentType !== 5126 || !width) throw new Error('unsupported animation accessor');
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return Array.from({ length: a.count * width }, (_, i) => bin.readFloatLE(start + i * 4));
  }
  const tracks = json.animations[0].channels.flatMap((c: any) => {
    const sampler = json.animations[0].samplers[c.sampler];
    const property = { translation: 'position', rotation: 'quaternion', scale: 'scale' }[c.target.path];
    if (!property) return [];
    const Track = property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    return [new Track(`${nodes[c.target.node].name}.${property}`, values(sampler.input), values(sampler.output))];
  });
  return { model, clip: new THREE.AnimationClip('idle', -1, tracks) };
}

function runner(constant = false) {
  const { model, clip } = asset();
  const performer = new CharacterPerformer(model, { hasIdleClip: true });
  const excluded = new Set(performer.ownedBones.filter(Boolean).map(b => b!.name));
  const animated = filterClipTracks(clip, excluded);
  if (constant) for (const track of clip.tracks) {
    const width = track.getValueSize();
    for (let i = width; i < track.values.length; i++) track.values[i] = track.values[i % width];
  }
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip).play();
  const feet = [performer.bones.resolved.footL!, performer.bones.resolved.footR!];
  const chest = performer.bones.resolved.chest!;
  const originalPosition = chest.position.clone();
  function step(t: number, talking = false) {
    performer.prepareFrame();
    mixer.update(1 / 60);
    model.updateMatrixWorld(true);
    const before = feet.map(f => f.getWorldPosition(new THREE.Vector3()));
    const scale = chest.scale.clone();
    expect(chest.position.distanceTo(originalPosition)).toBeLessThan(1e-6);
    performer.update({ t, now: t * 1000, mood: '平静', directive: null, talking,
      animatedBoneNames: animated, charGroup: null, hairDrivenByPhysics: false });
    model.updateMatrixWorld(true);
    feet.forEach((f, i) => expect(f.getWorldPosition(new THREE.Vector3()).distanceTo(before[i])).toBeLessThan(1e-10));
    for (const axis of ['x', 'y', 'z'] as const) expect(Math.abs(chest.scale[axis] / scale[axis] - 1)).toBeLessThanOrEqual(0.003001);
    return { scale, quaternion: chest.quaternion.clone() };
  }
  return { model, clip, performer, mixer, action, chest, step };
}

describe('TV v03 real AnimationMixer regression', () => {
  it('demonstrates why a constant Mixer track does not overwrite a procedural edit', () => {
    const model = new THREE.Group();
    const bone = new THREE.Bone(); bone.name = 'chest'; model.add(bone);
    const mixer = new THREE.AnimationMixer(model);
    const clip = new THREE.AnimationClip('constant', 1, [new THREE.VectorKeyframeTrack('chest.scale', [0, 1], [1, 1, 1, 1, 1, 1])]);
    mixer.clipAction(clip).play();
    mixer.update(1 / 60); mixer.update(1 / 60);
    bone.scale.x += 0.01;
    mixer.update(1 / 60);
    expect(bone.scale.x).toBeCloseTo(1.01);
  });
  for (const constant of [false, true]) it(`${constant ? 'constant tracks' : 'normal Idle'}: 120 seconds without drift or added foot motion`, () => {
    const r = runner(constant);
    expect(r.performer.idleMotionSafe).toBe(true);
    for (let i = 0; i <= 7200; i++) r.step(i / 60, i >= 1800 && i < 3600);
    r.performer.prepareFrame();
    const base = r.chest.scale.clone();
    r.mixer.update(1 / 60);
    expect(r.chest.scale.distanceTo(base)).toBeLessThan(1e-6);
    expect(r.chest.scale.x).toBeCloseTo(1, 5);
  });

  it('smoothly crossfades two real mixer actions and speech on/off without accumulating offsets', () => {
    const r = runner();
    for (let i = 0; i < 120; i++) r.step(i / 60);
    r.performer.prepareFrame();
    const second = r.clip.clone();
    second.name = 'variation';
    const track = second.tracks.find(t => t.name === `${r.chest.name}.quaternion`)!;
    const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.02);
    for (let i = 0; i < track.values.length; i += 4) {
      const q = new THREE.Quaternion().fromArray(track.values, i).premultiply(delta);
      q.toArray(track.values, i);
    }
    const next = r.mixer.clipAction(second).reset().play();
    r.action.crossFadeTo(next, 0.4, false);
    let prev = r.chest.quaternion.clone();
    for (let i = 120; i < 360; i++) {
      const { quaternion } = r.step(i / 60, i < 240);
      expect(quaternion.angleTo(prev)).toBeLessThan(0.01);
      prev = quaternion;
    }
  });

  it('preserves nonuniform chest scale with quaternion-only tracks and unequal parent axes', () => {
    const r = runner(true);
    r.performer.prepareFrame();
    r.mixer.stopAllAction();
    r.chest.scale.set(1.1, 0.95, 1.03);
    const q = r.chest.quaternion.toArray();
    const clip = new THREE.AnimationClip('rotationOnly', 1, [new THREE.QuaternionKeyframeTrack(`${r.chest.name}.quaternion`, [0, 1], [...q, ...q])]);
    r.mixer.clipAction(clip).play();
    for (let i = 0; i < 7200; i++) r.step(i / 60);
    r.performer.prepareFrame();
    expect(r.chest.scale.toArray()).toEqual([1.1, 0.95, 1.03]);
  });
});
