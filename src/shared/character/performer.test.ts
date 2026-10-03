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

  it('turns the eye about model up/left even when the bone axes are rig-style (Y along the gaze)', () => {
    // Rigify-like eye: local Y points forward (+Z in the model), so a local Euler y would roll it.
    const model = buildModel({ boneNames: ['DEF-eye.L', 'DEF-eye.R'] });
    const eyes = ['DEF-eye.L', 'DEF-eye.R'].map((n) => model.children.find((c) => c.name === n)!);
    for (const eye of eyes) eye.quaternion.set(0, -Math.SQRT1_2, -Math.SQRT1_2, 0);
    const performer = new CharacterPerformer(model);
    const forward = (eye: THREE.Object3D) => new THREE.Vector3(0, 1, 0).applyQuaternion(eye.quaternion);
    const settle = (g: { x: number; y: number }) => {
      for (let i = 0; i < 300; i++) performer.update(frame({ directive: directive({ gaze: { mode: 'point', ...g } }) }));
    };
    expect(forward(eyes[0]).toArray().map((v) => Math.round(v) + 0)).toEqual([0, 0, 1]);
    settle({ x: -1, y: 0 }); // directive x is mirrored: -1 looks to the character's left (+X)
    for (const eye of eyes) { expect(forward(eye).x).toBeGreaterThan(0.1); expect(Math.abs(forward(eye).y)).toBeLessThan(0.01); }
    settle({ x: 0, y: 1 });
    for (const eye of eyes) { expect(forward(eye).y).toBeGreaterThan(0.1); expect(Math.abs(forward(eye).x)).toBeLessThan(0.01); }
    settle({ x: 0, y: 0 });
    for (const eye of eyes) expect(forward(eye).z).toBeGreaterThan(0.999);
  });

  it('resolves bones under the names GLTFLoader produces (dots stripped from DEF-eye.L)', () => {
    const model = buildModel({ boneNames: ['DEF-spine006', 'DEF-eyeL', 'DEF-eyeR'] });
    const performer = new CharacterPerformer(model);
    expect(performer.bones.resolved.head?.name).toBe('DEF-spine006');
    expect(performer.bones.resolved.leftEye?.name).toBe('DEF-eyeL');
    expect(performer.routes.gaze).toBe('bone');
  });

  it('holds still on a broken torso chain instead of pulling skin seams apart', () => {
    // Flat bones: neck is not under chest, so the torso group is broken like the v008 export.
    const model = buildModel({ boneNames: ['DEF-spine003', 'DEF-spine004', 'DEF-spine006'] });
    const performer = new CharacterPerformer(model);
    expect(performer.idleMotionSafe).toBe(false);
    const chest = model.children.find((c) => c.name === 'DEF-spine003')!;
    const head = model.children.find((c) => c.name === 'DEF-spine006')!;
    for (let i = 0; i < 120; i++) performer.update(frame({ t: i / 10 }));
    expect(chest.scale.x).toBe(1);
    expect(chest.position.y).toBe(0);
    expect(head.rotation.x).toBe(0);
    expect(performer.standing.notes.join()).toContain('micro-motion skipped');
  });

  it('splits the turn between bones and morphs in mixed mode', () => {
    const model = buildModel({ boneNames: ['DEF-eye.L', 'DEF-eye.R'] });
    const performer = new CharacterPerformer(model, { routes: { gaze: 'mixed' } });
    expect(performer.routes.gaze).toBe('mixed');
    for (let i = 0; i < 300; i++) performer.update(frame({ directive: directive({ gaze: { mode: 'point', x: -1, y: 0 } }) }));
    expect(influence(model, 'eyeLookLeft')).toBeCloseTo(0.35, 2);
    const eye = model.children.find((c) => c.name === 'DEF-eye.L')!;
    expect(eye.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0.175, 2);
  });

  it('lets smile, speech and blink hold at once', () => {
    const model = buildModel();
    const performer = new CharacterPerformer(model);
    const happy = directive({ expression: 'happy', speaking: true });
    for (let i = 0; i < 200; i++) performer.update(frame({ now: 10_000 + i, directive: happy }));
    expect(influence(model, 'smile')).toBeGreaterThan(0.3);
    expect(influence(model, 'mouthOpen')).toBeGreaterThan(0.05);
    // Force a blink while the smile is held: blink must reach full closure regardless of the expression.
    const blinkAt = 10_000 + 200 + 60_000;
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      performer.update(frame({ now: blinkAt + i * 8, directive: { ...happy, receivedAt: blinkAt } }));
      peak = Math.max(peak, influence(model, 'blink'));
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(influence(model, 'smile')).toBeGreaterThan(0.3);
  });

  it('leaves head and eye bones alone while a clip owns them, and reports them unowned', () => {
    const model = buildModel({ boneNames: ['DEF-spine.006', 'DEF-eye.L', 'DEF-eye.R'] });
    const performer = new CharacterPerformer(model, { yield: { head: true, eyes: true } });
    expect(performer.ownedBones.every((b) => b === null)).toBe(true);
    const head = model.children.find((c) => c.name === 'DEF-spine.006')!;
    const eye = model.children.find((c) => c.name === 'DEF-eye.L')!;
    head.rotation.set(0.3, 0, 0); // as if a clip wrote it
    eye.rotation.set(0, 0.2, 0);
    for (let i = 0; i < 50; i++) performer.update(frame({ t: i / 10, directive: directive({ gaze: { mode: 'point', x: 1, y: 1 } }) }));
    expect(head.rotation.x).toBeCloseTo(0.3);
    expect(eye.rotation.y).toBeCloseTo(0.2);
    performer.setYield({ head: false, eyes: false });
    expect(performer.ownedBones.filter(Boolean).length).toBe(3);
    expect(head.rotation.x).toBeCloseTo(0); // eased back from rest, not from the clip's last pose
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
        // Yaw and pitch compose, so bound the total turn by the two per-axis limits combined.
        expect(eye.quaternion.angleTo(new THREE.Quaternion())).toBeLessThanOrEqual(Math.hypot(0.35, 0.26) + 0.01);
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

  it('leaves the head where the export put it when the torso chain is broken', () => {
    // Regression: the model's face and its hair/eyes are skinned to bones on two
    // unconnected branches (a Rigify export carrying both a control rig and a deform rig).
    // Spine/chest/neck offsets accumulate into the head, so posing the torso pushed the face
    // forward while hair and eyes stayed put — the hair appeared to slide behind the face.
    const root = new THREE.Group();
    const bone = (name: string, parent: THREE.Object3D, pos: [number, number, number]) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(...pos);
      parent.add(b);
      return b;
    };
    // Branch A: the deform chain that carries the face mesh.
    const hips = bone('DEF-hips', root, [0, 0.9, 0]);
    const spine = bone('DEF-spine.001', hips, [0, 0.1, 0]);
    const chest = bone('DEF-spine.003', spine, [0, 0.2, 0]);
    const neck = bone('DEF-spine.004', chest, [0, 0.1, 0]);
    const head = bone('DEF-spine.006', neck, [0, 0.1, 0]);
    // Branch B: hair and eyes, parented under a separate root the torso never reaches.
    const other = bone('ORG-spine.006', root, [0, 1.3, 0]);
    const hair = bone('DEF-hair_fringe.001', other, [0, 0.05, 0.05]);
    bone('DEF-eye.L', other, [0.03, 0.05, 0.06]);
    bone('DEF-eye.R', other, [-0.03, 0.05, 0.06]);
    root.updateMatrixWorld(true);

    const headBefore = head.getWorldPosition(new THREE.Vector3());
    const hairBefore = hair.getWorldPosition(new THREE.Vector3());
    const performer = new CharacterPerformer(root);

    // The torso group is refused, and the refusal is reported rather than silent.
    expect(performer.standing.skippedGroups).toContain('torso');
    expect(performer.standing.verified).toBe(false);
    expect(performer.standingPose.spine).toBeUndefined();
    expect(performer.standingPose.neck).toBeUndefined();

    // Face and hair keep their authored relative offset: neither branch was moved.
    root.updateMatrixWorld(true);
    const headAfter = head.getWorldPosition(new THREE.Vector3());
    const hairAfter = hair.getWorldPosition(new THREE.Vector3());
    expect(headAfter.distanceTo(headBefore)).toBeLessThan(1e-6);
    expect(hairAfter.distanceTo(hairBefore)).toBeLessThan(1e-6);
    const gapBefore = hairBefore.clone().sub(headBefore);
    const gapAfter = hairAfter.clone().sub(headAfter);
    expect(gapAfter.distanceTo(gapBefore)).toBeLessThan(1e-6);
  });

  it('still relaxes a rig whose chain is whole', () => {
    // The gate must not become a blanket opt-out: a well-formed rig keeps its standing pose.
    const root = new THREE.Group();
    const bone = (name: string, parent: THREE.Object3D, pos: [number, number, number]) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(...pos);
      parent.add(b);
      return b;
    };
    const hips = bone('DEF-hips', root, [0, 0.9, 0]);
    const spine = bone('DEF-spine.001', hips, [0, 0.1, 0]);
    const chest = bone('DEF-spine.003', spine, [0, 0.2, 0]);
    const neck = bone('DEF-spine.004', chest, [0, 0.1, 0]);
    bone('DEF-spine.006', neck, [0, 0.1, 0]);
    const shoulder = bone('DEF-shoulder.L', chest, [0.05, 0.08, 0]);
    const upperArm = bone('DEF-upper_arm.L', shoulder, [0.12, 0, 0]);
    bone('DEF-forearm.L', upperArm, [0.25, 0, 0]);
    root.updateMatrixWorld(true);

    const performer = new CharacterPerformer(root);
    expect(performer.standing.skippedGroups).toEqual([]);
    expect(performer.standingPose.spine).toBeDefined();
    expect(performer.standingPose.neck).toBeDefined();
    expect(Math.abs(spine.rotation.x)).toBeGreaterThan(0);
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
