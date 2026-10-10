// Installs only the five PNGs/sidecars. Never edits or replaces a GLB.
// Usage: node scripts/prepare-tv-behavior-assets.mjs --faces <directory>
// Optional: --character-dir <directory> --models <comma-separated filenames>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const source = arg('--faces');
if (!source) throw new Error('Provide --faces with the directory containing normal/thinking/speaking/angry/sad.png');
const directory = arg('--character-dir') ?? 'public/room/character';
const models = (arg('--models') ?? 'TV_Character_Rigged_v02.glb,TV_Character_Rigged_v03.glb').split(',');
const template = JSON.parse(fs.readFileSync('docs/examples/tv-screen-five-png.example.json', 'utf8'));
const images = Object.entries(template.clips).map(([id, clip]) => {
  const data = fs.readFileSync(path.join(source, `${id}.png`));
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Not PNG: ${id}`);
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  if (width < 16 || height < 16 || width > 2048 || height > 2048) throw new Error(`Invalid PNG dimensions: ${id}`);
  return { id, name: clip.uri, data, width, height };
});
for (const name of models) {
  if (!/^[A-Za-z0-9_-]+\.glb$/.test(name)) throw new Error('Provide a plain model filename');
  const bytes = fs.readFileSync(path.join(directory, name));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const node = json.nodes.find(n => n.name === template.target.node);
  const primitive = node && json.meshes[node.mesh]?.primitives[template.target.slot];
  if (!primitive || json.materials[primitive.material]?.name !== template.target.materialName || primitive.attributes.TEXCOORD_0 === undefined) throw new Error(`Screen binding does not match ${name}`);
}
const backup = path.join('.tmp', 'tv-behavior-assets', new Date().toISOString().replaceAll(':', '-'));
fs.mkdirSync(backup, { recursive: true });
for (const item of images) {
  const target = path.join(directory, item.name);
  if (fs.existsSync(target)) fs.copyFileSync(target, path.join(backup, item.name));
  fs.writeFileSync(target, item.data);
  console.log(`${item.name}: ${item.width}x${item.height}, sha256 ${crypto.createHash('sha256').update(item.data).digest('hex')}`);
}
for (const name of models) {
  const sidecar = name.replace(/\.glb$/, '.screen.json');
  const target = path.join(directory, sidecar);
  if (fs.existsSync(target)) fs.copyFileSync(target, path.join(backup, sidecar));
  fs.writeFileSync(target, JSON.stringify(template, null, 2).replaceAll('\n', '\r\n') + '\r\n');
  console.log(`${sidecar}: five PNG states configured; GLB unchanged`);
}
console.log(`Previous local resources backed up under ${backup}`);
