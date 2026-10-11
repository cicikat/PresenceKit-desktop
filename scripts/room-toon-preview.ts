// Local WebGL evidence fixture. No backend, Tauri mocks or animation writes; editor=1 uses local UI preferences.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomToonValidation } from '../src/windows/room/roomToonValidation';
import { DEFAULT_CEL } from '../src/shared/room/celConfig';
import { createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MaterialSection } from '../src/windows/room/MaterialSection';
import { DEFAULT_ROOM_SETTINGS, loadRoomSettings, subscribeRoomSettings } from '../src/shared/room/roomSettings';
import { initUIPrefs } from '../src/shared/uiPreferences';
import '../src/windows/room/EditorPanel.css';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#25252c');
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.36, 0.82); camera.lookAt(0, 1.30, 0);
if (new URLSearchParams(location.search).get('frame') === 'full') {
  camera.position.set(0, 1.15, 2.8); camera.lookAt(0, 0.8, 0);
}
const room = new THREE.Group(); scene.add(room);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ color: '#b6ae94' }));
floor.rotation.x = -Math.PI / 2; room.add(floor);
const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.15), new THREE.MeshLambertMaterial({ color: '#d9cbbc' }));
wall.position.set(0, 2, -3); room.add(wall);
const side = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4, 6), wall.material); side.position.set(-3, 2, 0); room.add(side);
scene.add(new THREE.AmbientLight('white', 0.5));
const key = new THREE.DirectionalLight('#fff5e0', 0.9); key.position.set(2, 4, 3); scene.add(key);
const fill = new THREE.DirectionalLight('white', 0.6); fill.position.set(0.5, 1.6, 2); scene.add(fill);
const model = (await new GLTFLoader().loadAsync('/room/character/TV_Character_Rigged_v03.glb')).scene;
const box = new THREE.Box3().setFromObject(model); model.scale.setScalar(1.6 / box.getSize(new THREE.Vector3()).y);
const scaled = new THREE.Box3().setFromObject(model), center = scaled.getCenter(new THREE.Vector3());
model.position.set(-center.x, -scaled.min.y, -center.z); scene.add(model); model.updateMatrixWorld(true);
const screen = await new THREE.TextureLoader().loadAsync('/room/character/tvface_normal.png'); screen.flipY = false; screen.colorSpace = THREE.SRGBColorSpace;
model.traverse(o => { const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
  for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m.name === 'TV_Screen_Expressions_Screen') {
    (m as THREE.MeshStandardMaterial).map = screen;
  }
});
const mode = new URLSearchParams(location.search).get('look') ?? 'before';
let effectiveMode = mode;
function snapshot() {
  const nodes: { object: THREE.Object3D; material?: THREE.Material | THREE.Material[]; matrix: number[]; visible: boolean; cast: boolean; receive: boolean }[] = [];
  scene.traverse(object => nodes.push({ object, material: (object as THREE.Mesh).material,
    matrix: object.matrix.toArray(), visible: object.visible, cast: object.castShadow, receive: object.receiveShadow }));
  return nodes;
}
function render() { if (effectiveMode === 'toon' || effectiveMode === 'soft' || effectiveMode === 'cel') toon.render(model, room); else renderer.render(scene, camera); }
scene.updateMatrixWorld(true);
const initial = snapshot(); const initialBackground = scene.background;
const toon = new RoomToonValidation(renderer, scene, camera, innerWidth, innerHeight);
toon.apply({ ...DEFAULT_CEL, mode: mode === 'cel' ? 'cel' : 'soft' });
for (let frame = 0; frame < 5; frame++) render();
const restored = initial.every(({ object, material, matrix, visible, cast, receive }) =>
  (object as THREE.Mesh).material === material && object.visible === visible &&
  object.castShadow === cast && object.receiveShadow === receive &&
  object.matrix.toArray().every((v, i) => v === matrix[i]));
document.body.dataset.restored = String(restored && scene.background === initialBackground);
document.body.dataset.mismatches = initial.filter(({ object, material, matrix, visible, cast, receive }) =>
  (object as THREE.Mesh).material !== material || object.visible !== visible || object.castShadow !== cast ||
  object.receiveShadow !== receive || object.matrix.toArray().some((v, i) => v !== matrix[i])).map(s => s.object.name || s.object.type).join(',');
document.body.dataset.ready = mode;
if (new URLSearchParams(location.search).get('editor') === '1') {
  await initUIPrefs();
  const root = document.createElement('div'); root.className = 'room-editor-panel';
  root.style.overflowY = 'auto'; root.style.display = 'block'; document.body.append(root);
  function EditorFixture() {
    const [settings, setSettings] = useState({ ...DEFAULT_ROOM_SETTINGS, ...loadRoomSettings(), characterFile: 'TV_Character_Rigged_v03.glb' });
    useEffect(() => {
      const update = (next: typeof settings) => {
        setSettings(next); const cfg = next.toon ?? { ...DEFAULT_CEL, mode: 'original' as const };
        effectiveMode = cfg.mode; toon.apply(cfg); render(); document.body.dataset.mode = cfg.mode;
      };
      update(settings); return subscribeRoomSettings(update);
    }, []);
    return createElement(MaterialSection, { settings });
  }
  createRoot(root).render(createElement(EditorFixture));
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); toon.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); render(); });
