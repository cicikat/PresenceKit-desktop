import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CharacterPerformer } from './performer';
import { MotionLibrary } from './motionLibrary';
import { parseMotionsConfig } from './motionConfig';

function model() {
  const root = new THREE.Group();
  for (const n of ['DEF-spine006', 'DEF-upper_armL']) { const b = new THREE.Bone(); b.name = n; root.add(b); }
  return root;
}

describe('CA-05 motion library', () => {
  it('retargets a character-own clip, keeps head with the performer, and reports a missing clip', async () => {
    const root = model();
    const own = new THREE.AnimationClip('Wave', 1, [
      new THREE.QuaternionKeyframeTrack('DEF-upper_armL.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0.38, 0.92]),
      new THREE.QuaternionKeyframeTrack('DEF-spine006.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.2, 0, 0.98]),
    ]);
    const lib = new MotionLibrary(root, new CharacterPerformer(root), [own]);
    const cfg = parseMotionsConfig({ schemaVersion: '1.0.0', motions: [
      { id: 'wave', clip: 'Wave' }, { id: 'ghost', clip: 'Nope' },
    ] });
    if (!cfg.ok) throw new Error('parse');
    await lib.load(cfg.config, async () => null);
    expect(lib.ids()).toEqual(['wave']);
    expect(lib.status.find((s) => s.id === 'ghost')).toMatchObject({ ready: false });
    expect(lib.play('wave')).toBe(true);
    lib.update(0.5);
    expect(root.getObjectByName('DEF-upper_armL')!.quaternion.z).toBeGreaterThan(0.05);
    expect(root.getObjectByName('DEF-spine006')!.quaternion.y).toBe(0); // head stays with the performer
    lib.dispose();
    expect(lib.play('wave')).toBe(false);
  });
});
