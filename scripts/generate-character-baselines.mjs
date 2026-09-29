// Reproducible, deliberately simple GLB fixtures for character contract tests.
// They contain no private model data and are not visual acceptance assets.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destination = fileURLToPath(new URL('../tests/fixtures/characters/', import.meta.url));
const positions = new Float32Array([
  -0.2, 0, -0.1, 0.2, 0, -0.1, 0.2, 1.6, -0.1, -0.2, 1.6, -0.1,
  -0.2, 0, 0.1, 0.2, 0, 0.1, 0.2, 1.6, 0.1, -0.2, 1.6, 0.1,
]);
const indices = new Uint16Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
  0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
]);

function glb(spec) {
  const binary = [];
  const doc = {
    asset: { version: '2.0', generator: 'PresenceKit anonymous baseline generator' },
    scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [],
    materials: [{ doubleSided: true, pbrMetallicRoughness: {
      baseColorFactor: [0.45, 0.65, 0.9, 1], metallicFactor: 0, roughnessFactor: 1,
    } }],
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [],
  };
  let offset = 0;
  function add(array, componentType, type, count, target, extra = {}) {
    const source = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const padding = (4 - offset % 4) % 4;
    if (padding) binary.push(Buffer.alloc(padding));
    offset += padding;
    const view = doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: source.length, ...(target ? { target } : {}) }) - 1;
    binary.push(source);
    offset += source.length;
    return doc.accessors.push({ bufferView: view, componentType, count, type, ...extra }) - 1;
  }
  const primitive = {
    attributes: { POSITION: add(positions, 5126, 'VEC3', 8, 34962, { min: [-0.2, 0, -0.1], max: [0.2, 1.6, 0.1] }) },
    indices: add(indices, 5123, 'SCALAR', indices.length, 34963), material: 0,
  };
  if (spec.morph) {
    const delta = new Float32Array(positions.length);
    for (let i = 0; i < 8; i++) if (positions[i * 3 + 1] > 1) delta[i * 3] = 0.04;
    primitive.targets = [{ POSITION: add(delta, 5126, 'VEC3', 8, 34962, {
      min: [0, 0, 0], max: [0.04, 0, 0],
    }) }];
    doc.meshes.push({ primitives: [primitive], weights: [0], extras: { targetNames: ['eyeLookRight'] } });
  } else doc.meshes.push({ primitives: [primitive] });

  const meshNode = doc.nodes.push({ name: 'AnonymousProxy', mesh: 0 }) - 1;
  doc.scenes[0].nodes.push(meshNode);
  if (spec.bones) {
    const roles = spec.half
      ? ['hips', 'spine', 'chest', 'neck', 'head', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand']
      : ['hips', 'spine', 'chest', 'neck', 'head', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
    if (spec.eyes) roles.push('leftEye', 'rightEye');
    const names = Object.fromEntries(roles.map((role, index) => [role, spec.alternate ? `Joint_${index}` : role]));
    const joints = roles.map(role => doc.nodes.push({ name: names[role] }) - 1);
    const byRole = Object.fromEntries(roles.map((role, index) => [role, joints[index]]));
    const attach = (parent, child) => { if (byRole[child] !== undefined) (doc.nodes[byRole[parent]].children ??= []).push(byRole[child]); };
    for (const [parent, child] of [
      ['hips', 'spine'], ['spine', 'chest'], ['chest', 'neck'], ['neck', 'head'],
      ['chest', 'leftShoulder'], ['leftShoulder', 'leftUpperArm'], ['leftUpperArm', 'leftLowerArm'], ['leftLowerArm', 'leftHand'],
      ['chest', 'rightShoulder'], ['rightShoulder', 'rightUpperArm'], ['rightUpperArm', 'rightLowerArm'], ['rightLowerArm', 'rightHand'],
      ['hips', 'leftUpperLeg'], ['leftUpperLeg', 'leftLowerLeg'], ['leftLowerLeg', 'leftFoot'],
      ['hips', 'rightUpperLeg'], ['rightUpperLeg', 'rightLowerLeg'], ['rightLowerLeg', 'rightFoot'],
      ['head', 'leftEye'], ['head', 'rightEye'],
    ]) attach(parent, child);
    if (spec.alternate) {
      doc.nodes[byRole.hips].rotation = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
      doc.nodes[byRole.hips].scale = [1.2, 1.2, 1.2];
    }
    doc.scenes[0].nodes.push(byRole.hips);
    const jointsAttribute = new Uint8Array(8 * 4);
    const weights = new Float32Array(8 * 4);
    for (let i = 0; i < 8; i++) weights[i * 4] = 1;
    primitive.attributes.JOINTS_0 = add(jointsAttribute, 5121, 'VEC4', 8, 34962);
    primitive.attributes.WEIGHTS_0 = add(weights, 5126, 'VEC4', 8, 34962);
    doc.skins = [{ joints, skeleton: byRole.hips }];
    doc.nodes[meshNode].skin = 0;
    const times = new Float32Array([0, 1, 2]);
    const quaternions = new Float32Array([0, 0, 0, 1, 0, 0, 0.04, 0.9992, 0, 0, 0, 1]);
    doc.animations = [{ name: 'idle', samplers: [{
      input: add(times, 5126, 'SCALAR', 3, undefined, { min: [0], max: [2] }),
      output: add(quaternions, 5126, 'VEC4', 3), interpolation: 'LINEAR',
    }], channels: [{ sampler: 0, target: { node: byRole.chest, path: 'rotation' } }] }];
  }
  const bin = Buffer.concat(binary);
  doc.buffers[0].byteLength = bin.length;
  const json = Buffer.from(JSON.stringify(doc));
  const jsonPadding = (4 - json.length % 4) % 4;
  const binPadding = (4 - bin.length % 4) % 4;
  const total = 12 + 8 + json.length + jsonPadding + 8 + bin.length + binPadding;
  const output = Buffer.alloc(total);
  output.write('glTF', 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(total, 8);
  output.writeUInt32LE(json.length + jsonPadding, 12); output.write('JSON', 16);
  json.copy(output, 20); output.fill(0x20, 20 + json.length, 20 + json.length + jsonPadding);
  const chunk = 20 + json.length + jsonPadding;
  output.writeUInt32LE(bin.length + binPadding, chunk); output.write('BIN\0', chunk + 4);
  bin.copy(output, chunk + 8);
  return output;
}

await mkdir(destination, { recursive: true });
for (const [name, spec] of Object.entries({
  'plain.glb': {},
  'morph-only.glb': { morph: true },
  'full-standard.glb': { bones: true, eyes: true, morph: true },
  'full-alternate.glb': { bones: true, eyes: true, alternate: true },
  'morph-no-eye-bones.glb': { bones: true, morph: true },
  'half-no-eyes.glb': { bones: true, half: true },
})) {
  await writeFile(join(destination, name), glb(spec));
  process.stdout.write(`${name}\n`);
}
