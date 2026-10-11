// Offline extraction: preserve the original GLB and export only its bind rig + authored clips.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/extract-shared-motion.mjs <source.glb> <motion.glb>');
if (path.resolve(input) === path.resolve(output)) throw new Error('Source must remain untouched');
if (fs.existsSync(output)) throw new Error('Output already exists; choose a new revision');
const bytes = fs.readFileSync(input), length = bytes.readUInt32LE(12);
const source = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
const bin = bytes.subarray(28 + length);
if (!source.animations?.length) throw new Error('Source has no authored animation');
const accessors = [], bufferViews = [], chunks = [], remap = new Map();
let byteLength = 0;
function accessor(index) {
  if (remap.has(index)) return remap.get(index);
  const a = source.accessors[index], v = source.bufferViews[a.bufferView];
  if (a.sparse || v.buffer !== 0) throw new Error('Sparse/external accessors require an offline GLTF exporter');
  const bytes = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  const padding = Buffer.alloc((4 - bytes.length % 4) % 4);
  bufferViews.push({ ...v, buffer: 0, byteOffset: byteLength });
  chunks.push(bytes, padding); byteLength += bytes.length + padding.length;
  accessors.push({ ...a, bufferView: bufferViews.length - 1 });
  remap.set(index, accessors.length - 1);
  return accessors.length - 1;
}
const parents = new Map();
source.nodes.forEach((n, i) => n.children?.forEach(c => parents.set(c, i)));
const worlds = new Map();
function nodeWorld(i) {
  if (worlds.has(i)) return worlds.get(i);
  const n = source.nodes[i];
  const m = n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(n.translation ?? [0, 0, 0]), new THREE.Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(n.scale ?? [1, 1, 1]));
  if (parents.has(i)) m.premultiply(nodeWorld(parents.get(i)));
  worlds.set(i, m); return m;
}
source.nodes.forEach((_, i) => nodeWorld(i));
const bind = new Map();
for (const skin of source.skins ?? []) {
  const a = source.accessors[skin.inverseBindMatrices], v = source.bufferViews[a.bufferView];
  if (a.componentType !== 5126 || a.type !== 'MAT4') throw new Error('Unsupported inverse binds');
  skin.joints.forEach((id, i) => {
    const values = Array.from({ length: 16 }, (_, k) => bin.readFloatLE((v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? 64) + k * 4));
    bind.set(id, new THREE.Matrix4().fromArray(values).invert());
  });
}
const nodes = source.nodes.map((n, i) => {
  const out = { name: n.name, children: n.children, extras: n.extras };
  const world = bind.get(i) ?? worlds.get(i);
  const parent = parents.get(i), parentWorld = parent === undefined ? new THREE.Matrix4() : bind.get(parent) ?? worlds.get(parent);
  out.matrix = parentWorld.clone().invert().multiply(world).toArray();
  return out;
});
const animations = source.animations.map(a => ({ ...a, samplers: a.samplers.map(s => ({ ...s, input: accessor(s.input), output: accessor(s.output) })),
  channels: a.channels.filter(c => ['rotation', 'translation', 'scale'].includes(c.target.path)) }));
const json = { asset: { version: '2.0', generator: 'PresenceKit offline motion extraction', extras: {
  sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), originalGenerator: source.asset.generator } },
  scene: source.scene ?? 0, scenes: source.scenes, nodes, animations,
  // Mark deform nodes for GLTFLoader even though this motion asset has no meshes.
  skins: (source.skins ?? []).map(s => ({ joints: s.joints, skeleton: s.skeleton })),
  accessors, bufferViews, buffers: [{ byteLength }] };
let jsonBytes = Buffer.from(JSON.stringify(json));
jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 32)]);
const binary = Buffer.concat(chunks), header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonBytes.length + binary.length, 8);
header.writeUInt32LE(jsonBytes.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([header, jsonBytes, binHeader, binary]));
console.log(JSON.stringify({ source: input, output, clips: animations.map(a => a.name), sourceSha256: json.asset.extras.sourceSha256, bytes: fs.statSync(output).size }));
