/** Test-only offline GLB replay. Real joints, inverse binds and FLOAT clips; no textures/GPU. */
import * as THREE from 'three';
import { vi } from 'vitest';
export const fixtureFs = await vi.importActual<{
  existsSync(path: string): boolean;
  readFileSync(path: string): Uint8Array & { readUInt32LE(offset: number): number; readFloatLE(offset: number): number; subarray(start: number, end?: number): { toString(): string; readFloatLE(offset: number): number } };
  writeFileSync(path: string, text: string): void;
}>('node:fs');
export function realGlb(file: string) {
  const bytes = fixtureFs.readFileSync(file), n = bytes.readUInt32LE(12);
  // TODO: type - glTF JSON fixture decoder, not the production asset importer.
  const json: any = JSON.parse(bytes.subarray(20, 20 + n).toString());
  const bin = new DataView(bytes.buffer, bytes.byteOffset + 28 + n, bytes.byteLength - 28 - n);
  const joints = new Set<number>((json.skins ?? []).flatMap((s: any) => s.joints));
  const nodes: THREE.Object3D[] = json.nodes.map((n: any, i: number) => {
    const o = joints.has(i) ? new THREE.Bone() : new THREE.Group();
    o.name = THREE.PropertyBinding.sanitizeNodeName(n.name ?? '');
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    return o;
  });
  json.nodes.forEach((n: any, i: number) => n.children?.forEach((c: number) => nodes[i].add(nodes[c])));
  const model = new THREE.Group();
  json.scenes[json.scene ?? 0].nodes.forEach((i: number) => model.add(nodes[i]));
  model.updateMatrixWorld(true);
  function values(i: number): number[] {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const width = ({ SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[a.type];
    if (a.componentType !== 5126 || !width) throw new Error('Fixture expects FLOAT accessors');
    return Array.from({ length: a.count * width }, (_, k) => bin.getFloat32((v.byteOffset ?? 0) + (a.byteOffset ?? 0)
      + Math.floor(k / width) * (v.byteStride ?? width * 4) + k % width * 4, true));
  }
  for (const s of json.skins ?? []) {
    const inverse = s.inverseBindMatrices === undefined ? null : values(s.inverseBindMatrices);
    const skeleton = new THREE.Skeleton(s.joints.map((i: number) => nodes[i] as THREE.Bone), inverse
      ? s.joints.map((_: number, i: number) => new THREE.Matrix4().fromArray(inverse, i * 16)) : undefined);
    // Geometry is irrelevant to the bind contract; do not instantiate source textures/materials.
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.bind(skeleton, new THREE.Matrix4()); model.add(mesh);
  }
  const clips: THREE.AnimationClip[] = (json.animations ?? []).map((a: any) => new THREE.AnimationClip(a.name, -1,
    a.channels.flatMap((c: any) => {
      const prop = ({ rotation: 'quaternion', translation: 'position', scale: 'scale' } as Record<string, string>)[c.target.path];
      if (!prop) return [];
      const s = a.samplers[c.sampler];
      if (s.interpolation === 'CUBICSPLINE') throw new Error('Fixture requires offline baked LINEAR clips');
      const Track = prop === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      return [new Track(`${nodes[c.target.node].name}.${prop}`, values(s.input), values(s.output), s.interpolation === 'STEP' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear)];
    })));
  return { model, clips, json };
}
