import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CharacterPerformer, type FrameContext } from './performer';
import type { ActiveDirective } from '../../windows/room/avatarDirective';

const MORPH_KEYS = [
  'blink', 'mouthOpen', 'smile', 'sad', 'angry', 'surprised',
  'eyeLookLeft', 'eyeLookRight', 'eyeLookUp', 'eyeLookDown',
];

/** Minimal skinned model: one mesh carrying morph targets plus a named bone tree. */
function buildModel(opts: { morphKeys?: string[]; boneNames?: string[] } = {}): THREE.Object3D {
  const root = new THREE.Group();
  const keys = opts.morphKeys ?? MORPH_KEYS;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.morphTargetDictionary = Object.fromEntries(keys.map((k, i) => [k, i]));
  mesh.morphTargetInfluences = keys.map(() => 0);
  root.add(mesh);
  for (const name of opts.boneNames ?? ['DEF-spine.006', 'DEF-spine.003', 'DEF-shoulder.L', 'DEF-shoulder.R']) {
    const bone = new THREE.Bone();
    bone.name = name;
    root.add(bone);
  }
  return root;
}

const NO_BONES: ReadonlySet<string> = new Set();
function frame(over: Partial<FrameContext> = {}): FrameContext {
  return {
    t: 1, now: 10_000, mood: '平静', directive: null, talking: false,
    animatedBoneNames: NO_BONES, charGroup: null, hairDrivenByPhysics: false, ...over,
  };
}

function directive(over: Partial<ActiveDirective> = {}): ActiveDirective {
  return {
    expression: null, intensity: 1, gaze: null, gesture: null, posture: null,
    speaking: null, energy: 0.5, ttl_ms: 5000, receivedAt: 10_000, origin: 'local', ...over,
  };
}

const influence = (model: THREE.Object3D, key: string): number => {
  const mesh = model.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
  return mesh.morphTargetInfluences![mesh.morphTargetDictionary![key]];
};

describe('CA-02 shared performer', () => {
  it('routes a morph-only model to morph gaze and reports no degradation', () => {
    const performer = new CharacterPerformer(buildModel());
    expect(performer.routes).toMatchObject({ face: 'morph', gaze: 'morph', body: 'procedural' });
    expect(performer.routes.notes).toEqual([]);
  });

  it('drives eye bones instead of morphs once both eyes exist', () => {
    const model = buildModel({ boneNames: ['DEF-spine.006', 'DEF-eye.L', 'DEF-eye.R'] });
    const performer = new CharacterPerformer(model);
    expect(performer.routes.gaze).toBe('bone');
    const leftEye = model.children.find((c) => c.name === 'DEF-eye.L')!;
    for (let i = 0; i < 200; i++) {
      performer.update(frame({ directive: directive({ gaze: { mode: 'point', x: 1, y: 0 } }) }));
    }
    expect(Math.abs(leftEye.rotation.y)).toBeGreaterThan(0.01);
    // The morph driver must stay silent, or the gaze would be applied twice.
    expect(influence(model, 'eyeLookLeft')).toBe(0);
    expect(influence(model, 'eyeLookRight')).toBe(0);
  });

  it('keeps eye bone rotation inside the configured limits at extreme targets', () => {
    const model = buildModel({ boneNames: ['DEF-eye.L', 'DEF-eye.R'] });
    const performer = new CharacterPerformer(model);
    const eyes = ['DEF-eye.L', 'DEF-eye.R'].map((n) => model.children.find((c) => c.name === n)!);
    for (const gaze of [{ x: 1, y: 1 }, { x: -1, y: -1 }]) {
      for (let i = 0; i < 400; i++) {
        performer.update(frame({ directive: directive({ gaze: { mode: 'point', ...gaze } }) }));
      }
      for (const eye of eyes) {
        expect(Math.abs(eye.rotation.y)).toBeLessThanOrEqual(0.36);
        expect(Math.abs(eye.rotation.x)).toBeLessThanOrEqual(0.27);
      }
    }
  });

  it('lets blink close fully while a smile is held', () => {
    const model = buildModel();
    const performer = new CharacterPerformer(model);
    const happy = directive({ expression: 'happy' });
    // Settle the expression, then advance past the blink schedule until a full close lands.
    for (let i = 0; i < 200; i++) performer.update(frame({ directive: happy }));
    expect(influence(model, 'smile')).toBeGreaterThan(0.5);
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      performer.update(frame({ now: 10_000 + i * 20, directive: happy }));
      peak = Math.max(peak, influence(model, 'blink'));
    }
    expect(peak).toBeGreaterThan(0.95);
    expect(influence(model, 'smile')).toBeGreaterThan(0.5);
  });

  it('keeps the mouth moving while speaking and closes it afterwards', () => {
    const model = buildModel();
    const performer = new CharacterPerformer(model);
    let openPeak = 0;
    for (let i = 0; i < 100; i++) {
      performer.update(frame({ t: i * 0.05, talking: true }));
      openPeak = Math.max(openPeak, influence(model, 'mouthOpen'));
    }
    expect(openPeak).toBeGreaterThan(0.3);
    for (let i = 0; i < 100; i++) performer.update(frame({ t: 10 + i * 0.05, talking: false }));
    expect(influence(model, 'mouthOpen')).toBeLessThan(0.01);
  });

  it('does not accumulate bone drift over a long idle run', () => {
    const model = buildModel();
    const performer = new CharacterPerformer(model);
    const head = model.children.find((c) => c.name === 'DEF-spine.006')!;
    const chest = model.children.find((c) => c.name === 'DEF-spine.003')!;
    for (let i = 0; i < 20_000; i++) performer.update(frame({ t: i / 60, now: 10_000 + i * 16 }));
    expect(Math.abs(head.rotation.x)).toBeLessThan(0.1);
    expect(Math.abs(chest.position.y)).toBeLessThan(0.1);
    expect(chest.scale.x).toBeGreaterThan(0.9);
    expect(chest.scale.x).toBeLessThan(1.1);
  });

  it('adds offsets instead of absolute writes for bones a clip already drove', () => {
    const model = buildModel();
    const performer = new CharacterPerformer(model, { hasIdleClip: true });
    expect(performer.routes.body).toBe('clip+procedural');
    const chest = model.children.find((c) => c.name === 'DEF-spine.003')! as THREE.Bone;
    const animated: ReadonlySet<string> = new Set(['DEF-spine.003']);
    // Simulate the mixer writing this frame's clip pose before the performer runs.
    for (let i = 0; i < 500; i++) {
      chest.position.y = 0.5;
      performer.update(frame({ t: i / 60, animatedBoneNames: animated }));
    }
    // Additive: stays near the clip's value rather than snapping to the load-time base of 0.
    expect(chest.position.y).toBeGreaterThan(0.4);
    expect(chest.position.y).toBeLessThan(0.6);
  });

  it('zeroes gaze morphs when gaze is routed off', () => {
    const model = buildModel();
    const performer = new CharacterPerformer(model, { routes: { gaze: 'off' } });
    performer.update(frame({ directive: directive({ gaze: { mode: 'point', x: 1, y: 1 } }) }));
    expect(influence(model, 'eyeLookLeft')).toBe(0);
    expect(influence(model, 'eyeLookUp')).toBe(0);
  });

  it('falls back to head-turn gaze when the model has no eye driver at all', () => {
    const model = buildModel({ morphKeys: ['blink', 'mouthOpen', 'smile'] });
    const performer = new CharacterPerformer(model);
    expect(performer.routes.gaze).toBe('headOnly');
    const head = model.children.find((c) => c.name === 'DEF-spine.006')!;
    for (let i = 0; i < 400; i++) {
      performer.update(frame({ t: 0, directive: directive({ gaze: { mode: 'point', x: 1, y: 0 } }) }));
    }
    expect(Math.abs(head.rotation.y)).toBeGreaterThan(0.05);
  });

  it('skips the hair morph fallback when physics owns the hair', () => {
    const model = buildModel({ morphKeys: [...MORPH_KEYS, 'hairSwayLeft', 'hairSwayRight'] });
    const performer = new CharacterPerformer(model);
    performer.update(frame({ t: 2.5, hairDrivenByPhysics: true }));
    expect(influence(model, 'hairSwayLeft')).toBe(0);
    performer.update(frame({ t: 2.5, hairDrivenByPhysics: false }));
    expect(influence(model, 'hairSwayLeft')).toBeGreaterThan(0);
  });

  it('claims eye bones only while the bone gaze driver is active', () => {
    const boneNames = ['DEF-spine.006', 'DEF-eye.L', 'DEF-eye.R'];
    const owned = (routes?: { gaze: 'bone' | 'morph' }) =>
      new CharacterPerformer(buildModel({ boneNames }), { routes })
        .ownedBones.filter(Boolean).map((b) => b!.name);
    expect(owned()).toEqual(['DEF-spine.006', 'DEF-eye.L', 'DEF-eye.R']);
    // Routed to morphs, the eye bones stay with the clip instead of being silently frozen.
    expect(owned({ gaze: 'morph' })).toEqual(['DEF-spine.006']);
  });
});
