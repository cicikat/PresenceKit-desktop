import * as THREE from 'three';

export interface SceneCameraPreset {
  id: string;
  name: string;
  position: [number, number, number];
  direction: [number, number, number];
  fovDeg: number;
}

export function collectSceneCameraPresets(scene: THREE.Object3D): SceneCameraPreset[] {
  scene.updateMatrixWorld(true);
  const presets: SceneCameraPreset[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.PerspectiveCamera)) return;
    const position = object.getWorldPosition(new THREE.Vector3());
    const direction = object.getWorldDirection(new THREE.Vector3()).normalize();
    presets.push({
      id: String(presets.length),
      name: object.name || `Camera ${presets.length + 1}`,
      position: position.toArray() as [number, number, number],
      direction: direction.toArray() as [number, number, number],
      fovDeg: THREE.MathUtils.clamp(object.fov, 20, 80),
    });
  });
  return presets;
}

export function placementFromSceneCamera(preset: SceneCameraPreset) {
  const camera = new THREE.Vector3(...preset.position);
  const forward = new THREE.Vector3(...preset.direction).normalize();
  const distance = Math.max(2.5, 0.9 / Math.tan(THREE.MathUtils.degToRad(preset.fovDeg) / 2));
  const target = camera.clone().addScaledVector(forward, distance);
  const toCamera = camera.clone().sub(target);
  return {
    customView: {
      pos: preset.position,
      target: target.toArray() as [number, number, number],
    },
    offset: target.toArray() as [number, number, number],
    yawDeg: THREE.MathUtils.radToDeg(Math.atan2(toCamera.x, toCamera.z)),
    fovDeg: preset.fovDeg,
    anchorMode: 'free' as const,
  };
}
