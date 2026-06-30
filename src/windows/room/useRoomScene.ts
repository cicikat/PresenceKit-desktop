import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { MOOD_TABLE } from '../../shared/state/store';
import type { Mood } from '../../shared/state/store';
import { MorphController } from './morphController';
import { MOOD_MORPHS, EXPR_KEYS } from './morphExpressions';
import { getActiveDirective } from './avatarDirective';
import { backendMoodToFrontend } from '../../shared/state/mood-mapping';
import { saveRoomSettings } from '../../shared/room/roomSettings';
import type { RoomSettings } from '../../shared/room/roomSettings';

// ─── types ───────────────────────────────────────────────────────────────────

type Framing = 'face' | 'upperBody' | 'full';

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  transformCtl: TransformControls;
  clock: THREE.Clock;
  sceneAmbient: THREE.AmbientLight;
  keyLight: THREE.DirectionalLight;
  charFill: THREE.DirectionalLight;
  rafId: number;
  resizeObs: ResizeObserver;
  targetLightColor: THREE.Color;
  targetLightIntensity: number;
  camBase: THREE.Vector3;
  proxyKey: THREE.Mesh;
  proxyFill: THREE.Mesh;
}

interface BlinkState {
  phase: 'idle' | 'blink';
  nextAt: number;
  startedAt: number;
}

// ─── constants ────────────────────────────────────────────────────────────────

const FRAME_H: Record<Framing, number>  = { face: 0.42, upperBody: 0.95, full: 1.75 };
const FRAME_CY: Record<Framing, number> = { face: 1.45, upperBody: 1.15, full: 0.85 };
const TARGET_H = 1.6;
const DEFAULT_FOV = 45;
const CHAR_LAYER = 1;

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalizeAndPosition(model: THREE.Object3D, s: RoomSettings): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.y === 0) return;
  const scale = (TARGET_H / size.y) * s.scaleMul;
  model.scale.setScalar(scale);
  model.rotation.y = THREE.MathUtils.degToRad(s.yawDeg);

  if (s.anchorMode === 'floor') {
    const box2 = new THREE.Box3().setFromObject(model);
    const center = box2.getCenter(new THREE.Vector3());
    model.position.x += -center.x + s.offset[0];
    model.position.z += -center.z + s.offset[2];
    model.position.y += -box2.min.y + s.offset[1];
  } else {
    const box2 = new THREE.Box3().setFromObject(model);
    const center = box2.getCenter(new THREE.Vector3());
    model.position.x += -center.x + s.offset[0];
    model.position.y += -center.y + s.offset[1];
    model.position.z += -center.z + s.offset[2];
  }
}

function resetModelTransform(model: THREE.Object3D): void {
  model.scale.setScalar(1);
  model.rotation.set(0, 0, 0);
  model.position.set(0, 0, 0);
}

function applyFraming(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  framing: Framing,
  fovDeg: number,
): number {
  const frameH = FRAME_H[framing] ?? 0.95;
  const cy = FRAME_CY[framing] ?? 1.15;
  const dist = (frameH / 2) / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) + 0.15;
  camera.fov = fovDeg;
  camera.updateProjectionMatrix();
  camera.position.set(0, cy, dist);
  camera.lookAt(0, cy, 0);
  controls.target.set(0, cy, 0);
  controls.update();
  return cy;
}

function applyCustomView(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  cv: { pos: [number, number, number]; target: [number, number, number] },
): void {
  camera.position.set(...cv.pos);
  controls.target.set(...cv.target);
  camera.lookAt(...cv.target);
  controls.update();
}

function applyView(refs: SceneRefs, settings: RoomSettings): void {
  const fov = settings.fovDeg ?? DEFAULT_FOV;
  if (settings.customView) {
    refs.camera.fov = fov;
    refs.camera.updateProjectionMatrix();
    applyCustomView(refs.camera, refs.controls, settings.customView);
  } else {
    applyFraming(refs.camera, refs.controls, settings.framing, fov);
  }
  refs.camBase.copy(refs.camera.position);
}

function lockControls(controls: OrbitControls): void {
  controls.enableRotate = false;
  controls.enableZoom   = false;
  controls.enablePan    = false;
}

function unlockControls(controls: OrbitControls): void {
  controls.enableRotate = true;
  controls.enableZoom   = true;
  controls.enablePan    = true;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle =  Infinity;
  controls.minPolarAngle   = 0;
  controls.maxPolarAngle   = Math.PI;
  controls.minDistance     = 0.3;
  controls.maxDistance     = 15;
}

function disposeModel(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m: THREE.Material) => {
        Object.values(m).forEach((v) => {
          if (v instanceof THREE.Texture) v.dispose();
        });
        m.dispose();
      });
    }
  });
}

function addRoomFallback(parent: THREE.Object3D): void {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshLambertMaterial({ color: 0xd4c5aa }),
  );
  floor.rotation.x = -Math.PI / 2;
  parent.add(floor);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8dfd0 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.15), wallMat);
  backWall.position.set(0, 2, -3);
  parent.add(backWall);
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4, 6), wallMat);
  leftWall.position.set(-3, 2, 0);
  parent.add(leftWall);
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4, 6), wallMat);
  rightWall.position.set(3, 2, 0);
  parent.add(rightWall);
}

function addCharFallback(parent: THREE.Object3D): void {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x7aa3cc });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.0, 8), bodyMat);
  body.position.set(0, 0.5, 0);
  parent.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), bodyMat);
  head.position.set(0, 1.25, 0);
  parent.add(head);
}

function scheduleNextBlink(state: BlinkState, mood: Mood): void {
  const entry = MOOD_TABLE[mood];
  const interval = (entry?.blinkInterval ?? 4500) as number;
  const jitter   = (entry?.blinkJitter   ?? 0.4)  as number;
  const variation = (Math.random() * 2 - 1) * jitter * interval;
  state.nextAt = performance.now() + Math.max(500, interval + variation);
  state.phase = 'idle';
}

function getBlinkPulse(state: BlinkState, now: number, mood: Mood): number {
  if (state.phase === 'idle' && now >= state.nextAt) {
    state.phase = 'blink';
    state.startedAt = now;
  }
  if (state.phase === 'blink') {
    const HALF = 60;
    const elapsed = now - state.startedAt;
    if (elapsed < HALF)        return elapsed / HALF;
    if (elapsed < HALF * 2)    return 1 - (elapsed - HALF) / HALF;
    scheduleNextBlink(state, mood);
    return 0;
  }
  return 0;
}

function resolveExpression(morph: MorphController, mood: Mood): Record<string, number> {
  const entry = MOOD_MORPHS[mood] ?? { primary: {}, fallback: {} };
  const tryFilter = (src: Record<string, number>) =>
    Object.fromEntries(Object.entries(src).filter(([k]) => morph.has(k)));
  const fromPrimary = tryFilter(entry.primary);
  if (Object.keys(fromPrimary).length > 0 || Object.keys(entry.primary).length === 0) {
    return fromPrimary;
  }
  return tryFilter(entry.fallback);
}

function collectGlbLights(root: THREE.Object3D, visible: boolean): THREE.Light[] {
  const found: THREE.Light[] = [];
  root.traverse(obj => {
    if ((obj as THREE.Light).isLight) {
      found.push(obj as THREE.Light);
      (obj as THREE.Light).visible = visible;
    }
  });
  return found;
}

function enableCharLayer(model: THREE.Object3D): void {
  model.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) obj.layers.enable(CHAR_LAYER);
  });
}

function findHeadBone(root: THREE.Object3D): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse(obj => {
    if (!found && obj instanceof THREE.Bone && obj.name.toLowerCase().includes('head')) {
      found = obj;
    }
  });
  return found;
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export interface RoomSceneAPI {
  freeLook: boolean;
  toggleFreeLook: () => void;
  saveCurrentView: () => void;
  placementMode: boolean;
  togglePlacementMode: () => void;
}

export function useRoomScene(
  mountRef: React.RefObject<HTMLDivElement | null>,
  mood: Mood,
  latestAssistantText: string | null,
  textUpdatedAt: number,
  settings: RoomSettings,
): RoomSceneAPI {
  const refsRef            = useRef<SceneRefs | null>(null);
  const moodRef            = useRef(mood);
  const morphRef           = useRef<MorphController | null>(null);
  const blinkStateRef      = useRef<BlinkState>({ phase: 'idle', nextAt: performance.now() + 2000, startedAt: 0 });
  const talkEndsAtRef      = useRef<number>(0);
  const prevTextUpdatedAt  = useRef<number>(0);
  const settingsRef        = useRef<RoomSettings>(settings);
  const charGroupRef       = useRef<THREE.Group | null>(null);
  const roomGroupRef       = useRef<THREE.Group | null>(null);
  const propsGroupRef      = useRef<THREE.Group | null>(null);
  const glbSceneLightsRef  = useRef<THREE.Light[]>([]);
  const disposedRef        = useRef(false);
  const freeLookRef        = useRef(false);
  const [freeLook, setFreeLook] = useState(false);
  const headBoneRef        = useRef<THREE.Bone | null>(null);
  const headBoneRestRef    = useRef(new THREE.Euler());

  // Placement mode
  const placementModeRef      = useRef(false);
  const [placementMode, setPlacementMode] = useState(false);
  const selectedLightRef      = useRef<'key' | 'charFill' | null>(null);
  const selectedPropIdxRef    = useRef<number | null>(null);
  const charBaseScaleRef      = useRef<number>(1);
  const placementKeyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const intensityLabelRef     = useRef<HTMLDivElement | null>(null);

  // keep settingsRef current
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // sync mood → light targets
  useEffect(() => {
    moodRef.current = mood;
    const s = refsRef.current;
    if (!s) return;
    const entry = MOOD_TABLE[mood];
    if (!entry) return;
    const hue = (entry.auraHue as number) / 360;
    const intensity = 0.3 + (entry.auraIntensity as number) * 0.7;
    s.targetLightColor.setHSL(hue, 0.35, 0.72);
    s.targetLightIntensity = Math.max(0.3, Math.min(1.2, intensity));
  }, [mood]);

  // new assistant message → start mouth-open speech
  useEffect(() => {
    if (!latestAssistantText || textUpdatedAt === 0) return;
    if (textUpdatedAt === prevTextUpdatedAt.current) return;
    prevTextUpdatedAt.current = textUpdatedAt;
    const talkMs = Math.max(800, Math.min(6000, latestAssistantText.length * 60));
    talkEndsAtRef.current = performance.now() + talkMs;
  }, [latestAssistantText, textUpdatedAt]);

  // re-apply framing/params when settings change (skip in placement mode)
  useEffect(() => {
    if (placementModeRef.current) return;
    const refs = refsRef.current;
    const charGroup = charGroupRef.current;
    if (!refs || !charGroup || charGroup.children.length === 0 || freeLookRef.current) return;
    const model = charGroup.children[0];
    if (model) {
      resetModelTransform(model);
      normalizeAndPosition(model, settings);
    }
    applyView(refs, settings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // sync lights settings to scene objects (skip in placement mode)
  useEffect(() => {
    if (placementModeRef.current) return;
    const refs = refsRef.current;
    if (!refs) return;
    const { lights } = settings;

    glbSceneLightsRef.current.forEach(l => { l.visible = lights.useSceneLights; });

    refs.sceneAmbient.visible = lights.ambient.on;
    refs.sceneAmbient.color.set(lights.ambient.color);
    refs.sceneAmbient.intensity = lights.ambient.intensity;

    refs.keyLight.visible = lights.key.on;
    if (!lights.moodTint) {
      refs.keyLight.color.set(lights.key.color);
      refs.keyLight.intensity = lights.key.intensity;
    }
    if (lights.key.pos) refs.keyLight.position.set(...lights.key.pos);

    refs.charFill.visible = lights.charFill.on;
    refs.charFill.color.set(lights.charFill.color);
    refs.charFill.intensity = lights.charFill.intensity;
    if (lights.charFill.pos) refs.charFill.position.set(...lights.charFill.pos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // reload character when file changes (skip first render — main effect handles initial load)
  const charFileTracked = useRef(settings.characterFile);
  useEffect(() => {
    if (charFileTracked.current === settings.characterFile) return;
    charFileTracked.current = settings.characterFile;

    const refs = refsRef.current;
    const charGroup = charGroupRef.current;
    if (!refs || !charGroup || disposedRef.current) return;

    for (const child of [...charGroup.children]) {
      charGroup.remove(child);
      disposeModel(child);
    }
    morphRef.current = null;
    headBoneRef.current = null;

    let cancelled = false;
    const loader = new GLTFLoader();
    const s = settingsRef.current;
    loader.load(
      `/room/character/${encodeURIComponent(s.characterFile)}`,
      (gltf) => {
        if (cancelled || disposedRef.current) return;
        const model = gltf.scene;
        normalizeAndPosition(model, s);
        enableCharLayer(model);
        charGroup.add(model);
        morphRef.current = new MorphController(model);
        charBaseScaleRef.current = s.scaleMul > 0 ? model.scale.x / s.scaleMul : model.scale.x;
        const hb = findHeadBone(model);
        headBoneRef.current = hb;
        if (hb) headBoneRestRef.current.copy(hb.rotation);
        if (import.meta.env.DEV) console.log('[room] char reloaded, morph keys:', morphRef.current.names());
        if (!freeLookRef.current && !placementModeRef.current) applyView(refs, s);
      },
      undefined,
      () => {
        if (cancelled || disposedRef.current) return;
        addCharFallback(charGroup);
      },
    );
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.characterFile]);

  // reload scene when file changes (skip first render)
  const sceneFileTracked = useRef(settings.sceneFile);
  useEffect(() => {
    if (sceneFileTracked.current === settings.sceneFile) return;
    sceneFileTracked.current = settings.sceneFile;

    const refs = refsRef.current;
    const roomGroup = roomGroupRef.current;
    if (!refs || !roomGroup || disposedRef.current) return;

    for (const child of [...roomGroup.children]) {
      roomGroup.remove(child);
      disposeModel(child);
    }
    glbSceneLightsRef.current = [];

    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      `/room/scene/${encodeURIComponent(settingsRef.current.sceneFile)}`,
      (gltf) => {
        if (cancelled || disposedRef.current) return;
        roomGroup.add(gltf.scene);
        glbSceneLightsRef.current = collectGlbLights(gltf.scene, settingsRef.current.lights.useSceneLights);
      },
      undefined,
      () => {
        if (cancelled || disposedRef.current) return;
        addRoomFallback(roomGroup);
      },
    );
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sceneFile]);

  // reload props when settings.props changes (skip in placement mode)
  useEffect(() => {
    if (placementModeRef.current) return;
    const propsGroup = propsGroupRef.current;
    if (!propsGroup || disposedRef.current) return;

    for (const child of [...propsGroup.children]) {
      propsGroup.remove(child);
      disposeModel(child);
    }

    const propList = settings.props ?? [];
    if (propList.length === 0) return;

    let cancelled = false;
    const loader = new GLTFLoader();
    propList.forEach((prop, idx) => {
      loader.load(
        `/room/props/${encodeURIComponent(prop.file)}`,
        (gltf) => {
          if (cancelled || disposedRef.current) return;
          const obj = gltf.scene;
          obj.position.set(prop.pos[0], prop.pos[1], prop.pos[2]);
          obj.rotation.set(prop.rot[0], prop.rot[1], prop.rot[2]);
          obj.scale.setScalar(prop.scale);
          obj.userData.__propIdx = idx;
          propsGroup.add(obj);
        },
        undefined,
        () => { /* graceful: skip missing prop */ },
      );
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.props]);

  // ── main scene setup (once) ───────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    disposedRef.current = false;

    // ── renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const { clientWidth: w, clientHeight: h } = mount;
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    // ── scene & camera ──
    const scene  = new THREE.Scene();
    const initSettings = settingsRef.current;
    const camera = new THREE.PerspectiveCamera(initSettings.fovDeg ?? DEFAULT_FOV, w / h, 0.1, 100);
    camera.position.set(0, 1.15, 2.0);
    camera.lookAt(0, 1.15, 0);

    // ── lights (from settings) ──
    const initLights = initSettings.lights;

    const sceneAmbient = new THREE.AmbientLight(initLights.ambient.color, initLights.ambient.intensity);
    sceneAmbient.visible = initLights.ambient.on;
    scene.add(sceneAmbient);

    const keyLight = new THREE.DirectionalLight(initLights.key.color, initLights.key.intensity);
    keyLight.visible = initLights.key.on;
    if (initLights.key.pos) keyLight.position.set(...initLights.key.pos);
    scene.add(keyLight);

    const charFill = new THREE.DirectionalLight(initLights.charFill.color, initLights.charFill.intensity);
    charFill.visible = initLights.charFill.on;
    if (initLights.charFill.pos) charFill.position.set(...initLights.charFill.pos);
    charFill.layers.set(CHAR_LAYER);
    scene.add(charFill);

    const targetLightColor = new THREE.Color().copy(keyLight.color);
    let targetLightIntensity = keyLight.intensity;

    const initEntry = MOOD_TABLE[moodRef.current];
    if (initEntry) {
      const hue = (initEntry.auraHue as number) / 360;
      const intensity = 0.3 + (initEntry.auraIntensity as number) * 0.7;
      targetLightColor.setHSL(hue, 0.35, 0.72);
      targetLightIntensity = Math.max(0.3, Math.min(1.2, intensity));
    }

    // ── orbit controls ──
    const controls = new OrbitControls(camera, renderer.domElement);
    lockControls(controls);

    // ── proxy spheres for light placement ──
    const proxyGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const proxyKeyMat  = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.75, depthTest: false });
    const proxyFillMat = new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.75, depthTest: false });
    const proxyKey  = new THREE.Mesh(proxyGeo, proxyKeyMat);
    const proxyFill = new THREE.Mesh(proxyGeo, proxyFillMat);
    proxyKey.renderOrder  = 999;
    proxyFill.renderOrder = 999;
    proxyKey.visible  = false;
    proxyFill.visible = false;
    scene.add(proxyKey);
    scene.add(proxyFill);

    // ── TransformControls ──
    const transformCtl = new TransformControls(camera, renderer.domElement);
    transformCtl.addEventListener('dragging-changed', (event) => {
      controls.enabled = !(event as unknown as { value: boolean }).value;
    });

    let objChangeThrottle: ReturnType<typeof setTimeout> | null = null;
    transformCtl.addEventListener('objectChange', () => {
      if (objChangeThrottle) clearTimeout(objChangeThrottle);
      objChangeThrottle = setTimeout(() => {
        const s = settingsRef.current;
        const lightKey = selectedLightRef.current;

        if (lightKey === 'key') {
          keyLight.position.copy(proxyKey.position);
          const pos: [number, number, number] = [proxyKey.position.x, proxyKey.position.y, proxyKey.position.z];
          saveRoomSettings({ ...s, lights: { ...s.lights, key: { ...s.lights.key, pos } } });
        } else if (lightKey === 'charFill') {
          charFill.position.copy(proxyFill.position);
          const pos: [number, number, number] = [proxyFill.position.x, proxyFill.position.y, proxyFill.position.z];
          saveRoomSettings({ ...s, lights: { ...s.lights, charFill: { ...s.lights.charFill, pos } } });
        } else if (selectedPropIdxRef.current !== null) {
          const propObj = propsGroupRef.current?.children.find(
            c => c.userData.__propIdx === selectedPropIdxRef.current,
          );
          if (propObj) {
            const updatedProps = (s.props ?? []).map((p, i) =>
              i === selectedPropIdxRef.current
                ? {
                    ...p,
                    pos: [propObj.position.x, propObj.position.y, propObj.position.z] as [number, number, number],
                    rot: [propObj.rotation.x, propObj.rotation.y, propObj.rotation.z] as [number, number, number],
                    scale: propObj.scale.x,
                  }
                : p,
            );
            saveRoomSettings({ ...s, props: updatedProps });
          }
        } else {
          // Character
          const model = charGroupRef.current?.children[0];
          if (!model) return;
          const newYawDeg = THREE.MathUtils.radToDeg(model.rotation.y);
          const worldBox = new THREE.Box3().setFromObject(model);
          const worldCenter = worldBox.getCenter(new THREE.Vector3());
          const newOffset: [number, number, number] = s.anchorMode === 'floor'
            ? [worldCenter.x, worldBox.min.y, worldCenter.z]
            : [worldCenter.x, worldCenter.y, worldCenter.z];
          const newScaleMul = charBaseScaleRef.current > 0
            ? model.scale.x / charBaseScaleRef.current
            : s.scaleMul;
          saveRoomSettings({ ...s, offset: newOffset, yawDeg: newYawDeg, scaleMul: Math.max(0.2, Math.min(3, newScaleMul)) });
        }
      }, 150);
    });
    scene.add(transformCtl as unknown as THREE.Object3D);

    // ── raycaster for placement selection (click) ──
    const raycaster = new THREE.Raycaster();
    const mouse2d = new THREE.Vector2();
    renderer.domElement.addEventListener('click', (e) => {
      if (!placementModeRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse2d.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse2d, camera);

      // Proxies first
      const proxyHits = raycaster.intersectObjects([proxyKey, proxyFill]);
      if (proxyHits.length > 0) {
        const hit = proxyHits[0].object;
        transformCtl.setMode('translate');
        if (hit === proxyKey) {
          selectedLightRef.current = 'key';
          selectedPropIdxRef.current = null;
          transformCtl.attach(proxyKey);
        } else {
          selectedLightRef.current = 'charFill';
          selectedPropIdxRef.current = null;
          transformCtl.attach(proxyFill);
        }
        return;
      }

      // Props
      const pg = propsGroupRef.current;
      if (pg && pg.children.length > 0) {
        const propHits = raycaster.intersectObjects(pg.children, true);
        if (propHits.length > 0) {
          let root = propHits[0].object;
          while (root.parent && root.parent !== pg) root = root.parent;
          selectedLightRef.current = null;
          selectedPropIdxRef.current = (root.userData.__propIdx as number | undefined) ?? null;
          transformCtl.setMode('translate');
          transformCtl.attach(root);
          return;
        }
      }

      // Character
      const charModel = charGroupRef.current?.children[0];
      if (charModel) {
        const charHits = raycaster.intersectObject(charModel, true);
        if (charHits.length > 0) {
          selectedLightRef.current = null;
          selectedPropIdxRef.current = null;
          transformCtl.setMode('translate');
          transformCtl.attach(charModel);
          return;
        }
      }

      // Deselect on empty click
      transformCtl.detach();
      selectedLightRef.current = null;
      selectedPropIdxRef.current = null;
    });

    // ── shared refs ──
    const refs: SceneRefs = {
      renderer, scene, camera, controls, transformCtl,
      clock: new THREE.Clock(),
      sceneAmbient, keyLight, charFill,
      rafId: 0,
      resizeObs: new ResizeObserver(() => {
        const { clientWidth: nw, clientHeight: nh } = mount;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      }),
      targetLightColor,
      targetLightIntensity,
      camBase: new THREE.Vector3(0, 1.15, 2.0),
      proxyKey,
      proxyFill,
    };
    refs.resizeObs.observe(mount);
    refsRef.current = refs;

    // ── groups ──
    const roomGroup = new THREE.Group();
    scene.add(roomGroup);
    roomGroupRef.current = roomGroup;

    const charGroup = new THREE.Group();
    scene.add(charGroup);
    charGroupRef.current = charGroup;

    const propsGroup = new THREE.Group();
    scene.add(propsGroup);
    propsGroupRef.current = propsGroup;

    // ── placeholder note ──
    let placeholderNote: HTMLDivElement | null = null;
    let roomLoaded = false;
    let charLoaded = false;

    function maybeRemovePlaceholder() {
      if (roomLoaded && charLoaded && placeholderNote) {
        placeholderNote.remove();
        placeholderNote = null;
      }
    }

    function showPlaceholderNote() {
      if (placeholderNote) return;
      placeholderNote = document.createElement('div');
      Object.assign(placeholderNote.style, {
        position: 'absolute', bottom: '72px', left: '50%', transform: 'translateX(-50%)',
        background: 'oklch(0.15 0.02 60 / 0.65)', color: 'oklch(0.90 0.02 60)',
        fontSize: '11px', padding: '4px 10px', borderRadius: '6px',
        fontFamily: 'var(--font-mono, monospace)', pointerEvents: 'none', zIndex: '10',
        backdropFilter: 'blur(4px)',
      });
      placeholderNote.textContent = '占位模型——把 glb 放进 public/room/ 即可替换';
      mount.style.position = 'relative';
      mount.appendChild(placeholderNote);
    }

    const loader = new GLTFLoader();

    // ── load room ──
    loader.load(
      `/room/scene/${encodeURIComponent(initSettings.sceneFile)}`,
      (gltf) => {
        roomGroup.add(gltf.scene);
        glbSceneLightsRef.current = collectGlbLights(gltf.scene, initSettings.lights.useSceneLights);
        roomLoaded = true;
        maybeRemovePlaceholder();
      },
      undefined,
      () => { addRoomFallback(roomGroup); roomLoaded = true; showPlaceholderNote(); maybeRemovePlaceholder(); },
    );

    // ── load character ──
    loader.load(
      `/room/character/${encodeURIComponent(initSettings.characterFile)}`,
      (gltf) => {
        if (disposedRef.current) return;
        const model = gltf.scene;
        normalizeAndPosition(model, initSettings);
        enableCharLayer(model);
        charGroup.add(model);
        morphRef.current = new MorphController(model);
        const sm = initSettings.scaleMul;
        charBaseScaleRef.current = sm > 0 ? model.scale.x / sm : model.scale.x;
        const hb = findHeadBone(model);
        headBoneRef.current = hb;
        if (hb) headBoneRestRef.current.copy(hb.rotation);
        if (import.meta.env.DEV) console.log('[room] morph keys:', morphRef.current.names());
        applyView(refs, initSettings);
        charLoaded = true;
        maybeRemovePlaceholder();
      },
      undefined,
      () => {
        if (disposedRef.current) return;
        addCharFallback(charGroup);
        charLoaded = true;
        showPlaceholderNote();
        maybeRemovePlaceholder();
      },
    );

    // ── render loop ──
    const lerpColor = new THREE.Color();
    const lerpSpeed = 0.03;

    function tick() {
      refs.rafId = requestAnimationFrame(tick);
      if (document.hidden) return;

      const t   = refs.clock.getElapsedTime();
      const now = performance.now();
      const currentMood = moodRef.current;
      const morph = morphRef.current;

      const directive = getActiveDirective(now);

      if (morph) {
        // Hair sway: dual left/right keys; fallback to legacy hairSway
        if (morph.has('hairSwayLeft') || morph.has('hairSwayRight')) {
          const sway = Math.sin(t * 0.6);
          morph.set('hairSwayLeft',  Math.max(0,  sway));
          morph.set('hairSwayRight', Math.max(0, -sway));
        } else if (morph.has('hairSway')) {
          morph.set('hairSway', 0.5 + 0.5 * Math.sin(t * 0.6));
        }

        // Expression layer: directive overrides mood when active
        let targets: Record<string, number>;
        if (directive?.expression) {
          const dMood = backendMoodToFrontend(directive.expression);
          const base = resolveExpression(morph, dMood);
          const s = directive.intensity;
          targets = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v * s]));
        } else {
          targets = resolveExpression(morph, currentMood);
        }
        const moodBlinkBaseline = targets['blink'] ?? 0;
        for (const key of EXPR_KEYS) {
          morph.lerp(key, targets[key] ?? 0, 0.08);
        }
        const pulse = getBlinkPulse(blinkStateRef.current, now, currentMood);
        morph.set('blink', Math.max(moodBlinkBaseline, pulse));

        // Speaking: directive.speaking overrides talkEndsAtRef when not null
        const talking = directive?.speaking !== null && directive?.speaking !== undefined
          ? directive.speaking
          : now < talkEndsAtRef.current;
        const mouthTarget = talking
          ? (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 11))) * (0.8 + Math.random() * 0.2)
          : 0;
        morph.lerp('mouthOpen', mouthTarget, 0.5);

        // Gaze layer: directive gaze → eyeLook morphs (graceful if model lacks them)
        if (directive?.gaze) {
          const g = directive.gaze;
          if (g.mode === 'user') {
            morph.lerp('eyeLookLeft', 0, 0.05);
            morph.lerp('eyeLookRight', 0, 0.05);
            morph.lerp('eyeLookUp', 0, 0.05);
            morph.lerp('eyeLookDown', 0, 0.05);
          } else if (g.mode === 'away') {
            morph.lerp('eyeLookLeft', 0.5, 0.05);
            morph.lerp('eyeLookRight', 0, 0.05);
            morph.lerp('eyeLookUp', 0, 0.05);
            morph.lerp('eyeLookDown', 0.2, 0.05);
          } else if (g.mode === 'point') {
            morph.lerp('eyeLookLeft', Math.max(0, -g.x) * 0.7, 0.05);
            morph.lerp('eyeLookRight', Math.max(0, g.x) * 0.7, 0.05);
            morph.lerp('eyeLookUp', Math.max(0, g.y) * 0.5, 0.05);
            morph.lerp('eyeLookDown', Math.max(0, -g.y) * 0.5, 0.05);
          }
          // idle mode: no override, existing idle drift handles it
        } else {
          // No active directive: lerp gaze morphs back to neutral
          morph.lerp('eyeLookLeft', 0, 0.04);
          morph.lerp('eyeLookRight', 0, 0.04);
          morph.lerp('eyeLookUp', 0, 0.04);
          morph.lerp('eyeLookDown', 0, 0.04);
        }
      }

      // Gesture layer: head bone rotations + lean_in z-offset (graceful if no Head bone)
      {
        const headBone = headBoneRef.current;
        const rest = headBoneRestRef.current;
        const charGroup = charGroupRef.current;
        if (directive?.gesture) {
          const elapsedMs = now - directive.receivedAt;
          const rampIn = Math.min(1, elapsedMs / 200);
          const osc = Math.sin(elapsedMs * 0.015) * rampIn;
          if (headBone) {
            switch (directive.gesture) {
              case 'nod':
                headBone.rotation.x = rest.x + osc * 0.15;
                headBone.rotation.y = rest.y;
                headBone.rotation.z = rest.z;
                break;
              case 'shake':
                headBone.rotation.x = rest.x;
                headBone.rotation.y = rest.y + osc * 0.15;
                headBone.rotation.z = rest.z;
                break;
              case 'tilt':
                headBone.rotation.x = rest.x;
                headBone.rotation.y = rest.y;
                headBone.rotation.z = rest.z + rampIn * 0.18;
                break;
              default:
                headBone.rotation.set(rest.x, rest.y, rest.z);
            }
          }
          if (directive.gesture === 'lean_in' && charGroup) {
            charGroup.position.z = -rampIn * 0.1;
          }
        } else {
          // Lerp head bone and charGroup back to rest
          if (headBone) {
            headBone.rotation.x += (rest.x - headBone.rotation.x) * 0.1;
            headBone.rotation.y += (rest.y - headBone.rotation.y) * 0.1;
            headBone.rotation.z += (rest.z - headBone.rotation.z) * 0.1;
          }
          if (charGroup) {
            charGroup.position.z += (0 - charGroup.position.z) * 0.1;
          }
        }
      }

      // camera breathing — paused in free look and placement mode
      if (!freeLookRef.current && !placementModeRef.current) {
        camera.position.set(
          refs.camBase.x + Math.sin(t * 0.18) * 0.010,
          refs.camBase.y + Math.sin(t * 0.24) * 0.008,
          refs.camBase.z,
        );
      }

      if (settingsRef.current.lights.moodTint) {
        lerpColor.copy(refs.keyLight.color);
        lerpColor.lerp(refs.targetLightColor, lerpSpeed);
        refs.keyLight.color.copy(lerpColor);
        refs.keyLight.intensity += (refs.targetLightIntensity - refs.keyLight.intensity) * lerpSpeed;
      }

      controls.update();
      renderer.render(scene, camera);
    }

    refs.clock.getDelta();
    tick();

    return () => {
      disposedRef.current = true;
      cancelAnimationFrame(refs.rafId);
      refs.resizeObs.disconnect();

      if (placementKeyHandlerRef.current) {
        window.removeEventListener('keydown', placementKeyHandlerRef.current);
        placementKeyHandlerRef.current = null;
      }
      intensityLabelRef.current?.remove();
      intensityLabelRef.current = null;

      transformCtl.detach();
      transformCtl.dispose();
      proxyGeo.dispose();
      proxyKeyMat.dispose();
      proxyFillMat.dispose();

      refs.controls.dispose();
      morphRef.current = null;

      if (objChangeThrottle) clearTimeout(objChangeThrottle);

      refs.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m: THREE.Material) => {
            Object.values(m).forEach((v) => {
              if (v instanceof THREE.Texture) v.dispose();
            });
            m.dispose();
          });
        }
      });

      refs.renderer.dispose();
      try { refs.renderer.forceContextLoss(); } catch {}
      refs.renderer.domElement.remove();
      if (placeholderNote) placeholderNote.remove();
      refsRef.current = null;
      charGroupRef.current = null;
      roomGroupRef.current = null;
      propsGroupRef.current = null;
      glbSceneLightsRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── free look API ─────────────────────────────────────────────────────────

  const toggleFreeLook = useCallback(() => {
    const refs = refsRef.current;
    if (freeLookRef.current) {
      freeLookRef.current = false;
      setFreeLook(false);
      if (refs) {
        lockControls(refs.controls);
        applyView(refs, settingsRef.current);
      }
    } else {
      // Exit placement mode first if active
      if (placementModeRef.current) {
        placementModeRef.current = false;
        setPlacementMode(false);
        if (refs) {
          refs.proxyKey.visible = false;
          refs.proxyFill.visible = false;
          refs.transformCtl.detach();
        }
        if (placementKeyHandlerRef.current) {
          window.removeEventListener('keydown', placementKeyHandlerRef.current);
          placementKeyHandlerRef.current = null;
        }
        intensityLabelRef.current?.remove();
        intensityLabelRef.current = null;
        selectedLightRef.current = null;
        selectedPropIdxRef.current = null;
      }
      freeLookRef.current = true;
      setFreeLook(true);
      if (refs) unlockControls(refs.controls);
    }
  }, []);

  const saveCurrentView = useCallback(() => {
    const refs = refsRef.current;
    if (!refs) return;
    const pos: [number, number, number] = [
      refs.camera.position.x,
      refs.camera.position.y,
      refs.camera.position.z,
    ];
    const target: [number, number, number] = [
      refs.controls.target.x,
      refs.controls.target.y,
      refs.controls.target.z,
    ];
    saveRoomSettings({ ...settingsRef.current, customView: { pos, target } });
  }, []);

  const togglePlacementMode = useCallback(() => {
    const refs = refsRef.current;

    if (placementModeRef.current) {
      // Exit
      placementModeRef.current = false;
      setPlacementMode(false);
      if (refs) {
        refs.proxyKey.visible = false;
        refs.proxyFill.visible = false;
        refs.transformCtl.detach();
      }
      if (placementKeyHandlerRef.current) {
        window.removeEventListener('keydown', placementKeyHandlerRef.current);
        placementKeyHandlerRef.current = null;
      }
      intensityLabelRef.current?.remove();
      intensityLabelRef.current = null;
      selectedLightRef.current = null;
      selectedPropIdxRef.current = null;
    } else {
      // Exit free look first
      if (freeLookRef.current) {
        freeLookRef.current = false;
        setFreeLook(false);
        if (refs) {
          lockControls(refs.controls);
          applyView(refs, settingsRef.current);
        }
      }

      placementModeRef.current = true;
      setPlacementMode(true);

      if (refs) {
        refs.proxyKey.position.copy(refs.keyLight.position);
        refs.proxyFill.position.copy(refs.charFill.position);
        refs.proxyKey.visible  = true;
        refs.proxyFill.visible = true;
      }

      // Per-session axis constraint state
      let lockedAxis: 'X' | 'Y' | 'Z' | null = null;

      function setAxisConstraint(axis: 'X' | 'Y' | 'Z' | null) {
        lockedAxis = axis;
        const tc = refsRef.current?.transformCtl;
        if (!tc) return;
        tc.showX = !axis || axis === 'X';
        tc.showY = !axis || axis === 'Y';
        tc.showZ = !axis || axis === 'Z';
      }

      const handler = (e: KeyboardEvent) => {
        const refs = refsRef.current;
        if (!refs || !placementModeRef.current) return;
        const tc = refs.transformCtl;
        const lightKey = selectedLightRef.current;

        // Arrow keys: adjust selected light intensity
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          if (!lightKey) return;
          const delta = e.key === 'ArrowRight' ? 0.1 : -0.1;
          const light = lightKey === 'key' ? refs.keyLight : refs.charFill;
          const newIntensity = Math.max(0, Math.min(4, light.intensity + delta));
          light.intensity = newIntensity;
          const s = settingsRef.current;
          saveRoomSettings({
            ...s,
            lights: { ...s.lights, [lightKey]: { ...s.lights[lightKey], intensity: newIntensity } },
          });
          // Show intensity label
          const mount = mountRef.current;
          if (mount) {
            if (!intensityLabelRef.current) {
              const el = document.createElement('div');
              Object.assign(el.style, {
                position: 'absolute', top: '10px', right: '14px',
                background: 'oklch(0.15 0.03 240 / 0.80)', color: 'oklch(0.88 0.04 240)',
                fontSize: '11px', padding: '3px 9px', borderRadius: '5px',
                fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.8px',
                pointerEvents: 'none', zIndex: '8', backdropFilter: 'blur(4px)',
              });
              mount.appendChild(el);
              intensityLabelRef.current = el;
            }
            const name = lightKey === 'key' ? 'key' : 'fill';
            intensityLabelRef.current.textContent = `${name} ▸ ${newIntensity.toFixed(1)}`;
          }
          e.preventDefault();
          return;
        }

        switch (e.key.toLowerCase()) {
          case 'g':
            tc.setMode('translate');
            setAxisConstraint(null);
            break;
          case 'r':
            tc.setMode('rotate');
            setAxisConstraint(null);
            break;
          case 's':
            tc.setMode('scale');
            setAxisConstraint(null);
            break;
          case 'x':
            setAxisConstraint(lockedAxis === 'X' ? null : 'X');
            break;
          case 'y':
            setAxisConstraint(lockedAxis === 'Y' ? null : 'Y');
            break;
          case 'z':
            setAxisConstraint(lockedAxis === 'Z' ? null : 'Z');
            break;
          case 'escape':
            if (tc.object) {
              tc.detach();
              selectedLightRef.current = null;
              selectedPropIdxRef.current = null;
              intensityLabelRef.current?.remove();
              intensityLabelRef.current = null;
            } else {
              // Exit placement mode
              placementModeRef.current = false;
              setPlacementMode(false);
              refs.proxyKey.visible  = false;
              refs.proxyFill.visible = false;
              tc.detach();
              if (placementKeyHandlerRef.current) {
                window.removeEventListener('keydown', placementKeyHandlerRef.current);
                placementKeyHandlerRef.current = null;
              }
              selectedLightRef.current = null;
              selectedPropIdxRef.current = null;
              intensityLabelRef.current?.remove();
              intensityLabelRef.current = null;
            }
            break;
        }
      };

      placementKeyHandlerRef.current = handler;
      window.addEventListener('keydown', handler);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { freeLook, toggleFreeLook, saveCurrentView, placementMode, togglePlacementMode };
}
