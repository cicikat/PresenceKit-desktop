import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { collectSceneCameraPresets, placementFromSceneCamera } from './sceneCameraPresets';

describe('scene camera presets', () => {
  it('reads multiple camera nodes from a glTF scene', async () => {
    const source = {
      asset: { version: '2.0' }, scene: 0,
      scenes: [{ nodes: [0, 1] }],
      nodes: [
        { name: 'Front', camera: 0, translation: [0, 1, 5] },
        { name: 'Side', camera: 1, translation: [5, 1, 0] },
      ],
      cameras: [
        { type: 'perspective', perspective: { yfov: Math.PI / 4, znear: 0.1 } },
        { type: 'perspective', perspective: { yfov: Math.PI / 3, znear: 0.1 } },
      ],
    };
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      new GLTFLoader().parse(JSON.stringify(source), '', resolve, reject);
    });
    expect(collectSceneCameraPresets(gltf.scene).map(p => p.name)).toEqual(['Front', 'Side']);
  });

  it('collects the scene cameras with their world transforms', () => {
    const scene = new THREE.Group();
    const parent = new THREE.Group();
    parent.position.set(10, 2, 0);
    scene.add(parent);
    const front = new THREE.PerspectiveCamera(45);
    front.name = 'Front';
    front.position.set(0, 1, 5);
    parent.add(front);
    const side = new THREE.PerspectiveCamera(60);
    side.name = 'Side';
    side.position.set(5, 1, 0);
    side.rotation.y = -Math.PI / 2;
    parent.add(side);

    const presets = collectSceneCameraPresets(scene);
    expect(presets.map(p => p.name)).toEqual(['Front', 'Side']);
    expect(presets[0].position).toEqual([10, 3, 5]);
    expect(presets[0].direction[2]).toBeCloseTo(-1);
    expect(presets[1].direction[0]).toBeCloseTo(1);
  });

  it('places the character ahead of the camera and facing back toward it', () => {
    const placement = placementFromSceneCamera({
      id: '0', name: 'Front', position: [0, 1, 5], direction: [0, 0, -1], fovDeg: 45,
    });
    expect(placement.offset).toEqual([0, 1, 2.5]);
    expect(placement.customView.target).toEqual([0, 1, 2.5]);
    expect(placement.yawDeg).toBeCloseTo(0);
  });
});
