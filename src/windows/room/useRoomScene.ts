import { loadScreenDriver, type ScreenDriver } from './screenDriver';
import { getCallActivity } from './callActivity';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { MOOD_TABLE } from '../../shared/state/store';
import type { Mood } from '../../shared/state/store';
import { getCallDirective } from './callDirectiveLayers';
import { saveRoomSettings, getCharacterCfg } from '../../shared/room/roomSettings';
import { CharacterPerformer } from '../../shared/character/performer';
import { setupCharacter } from './characterSetup';
import { collectSceneCameraPresets, placementFromSceneCamera } from './sceneCameraPresets';
import type { SceneCameraPreset } from './sceneCameraPresets';
import { MotionLibrary, setActiveMotionLibrary } from '../../shared/character/motionLibrary';
import { buildCharacterDiagnostics, publishCharacterDiagnostics } from '../../shared/character/diagnostics';
import type { BindingReport } from '../../shared/character/toonMaterial';
import type { MappingReport } from './morphController';
import { loadRoomModel, loadCharacterMaterials, loadCharacterToonTextures, loadCharacterExpressions, loadCharacterMotions, loadMotionFileUrl } from '../../shared/room/roomAssets';
import { applyToonBindings } from '../../shared/character/toonMaterial';
import type { RoomSettings } from '../../shared/room/roomSettings';
import {
  updateSpringChains,
  applySpringSettings,
  resetSpringChains,
  DEFAULT_SPRING_PARAMS,
} from './springBones';
import type { SpringChain } from './springBones';
import { collectExcludedBoneNames, filterClipTracks } from './clipPlayer';
import { editableIdEquals } from './sceneOutline';
import type { EditableId, LightKey } from './sceneOutline';
import type { LightCfg, RoomProp, RoomLights } from '../../shared/room/roomSettings';
import { DEFAULT_GRADE } from '../../shared/room/gradeConfig';
import { GradeRenderer } from './gradePass';
import { ExtraLightRig, LightHelperSet, fitDirectionalShadow } from './extraLights';
import { extraLightKey, extraLightId, isExtraLightKey, getLightCfg } from './sceneOutline';

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
  /** Orbit target at rest; breathing shifts it with the camera so the view direction never drifts. */
  tgtBase: THREE.Vector3;
  proxyKey: THREE.Mesh;
  proxyFill: THREE.Mesh;
  helpers: LightHelperSet;
  extraRig: ExtraLightRig;
}

/** Pushes the fixed lights (ambient/key/charFill) from settings onto the three.js objects. */
function syncFixedLights(refs: SceneRefs, lights: RoomLights, glbLights: THREE.Light[]): void {
  glbLights.forEach(l => { l.visible = lights.useSceneLights; });

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

  // Pick proxies follow the lights so a look applied mid-edit doesn't leave them behind.
  refs.proxyKey.position.copy(refs.keyLight.position);
  refs.proxyFill.position.copy(refs.charFill.position);
}

/** Edit-mode-only visuals: direction/cone helpers and the extra lights' pick proxies. */
function setEditVisuals(refs: SceneRefs, on: boolean): void {
  refs.helpers.setActive(on);
  refs.extraRig.setPlacement(on);
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
  refs.tgtBase.copy(refs.controls.target);
}

function fitSceneClipRange(camera: THREE.PerspectiveCamera, controls: OrbitControls, scene: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(scene);
  if (bounds.isEmpty()) return;
  const diagonal = bounds.getSize(new THREE.Vector3()).length();
  const center = bounds.getCenter(new THREE.Vector3());
  camera.far = Math.max(100, diagonal * 2, camera.position.distanceTo(center) + diagonal);
  camera.updateProjectionMatrix();
  controls.maxDistance = Math.max(15, diagonal * 2);
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
  controls.maxDistance     = Math.max(15, controls.maxDistance);
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

/**
 * Deletes tracks for bones the performer and physics own, then starts the clip looping.
 * Clip selection happens earlier (the performer needs to know whether a clip exists at
 * all before it can resolve the body route), and which bones are excluded depends on the
 * routes the performer resolved — so the two steps cannot be collapsed back together.
 */
function startIdleClip(
  model: THREE.Object3D,
  clip: THREE.AnimationClip,
  ownedBones: (THREE.Bone | null)[],
  springChains: SpringChain[],
): { mixer: THREE.AnimationMixer; animatedBoneNames: Set<string> } {
  const excluded = collectExcludedBoneNames(
    ownedBones[0] ?? null, ownedBones[1] ?? null, ownedBones[2] ?? null, springChains,
  );
  const animatedBoneNames = filterClipTracks(clip, excluded);
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  return { mixer, animatedBoneNames };
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export interface RoomSceneAPI {
  freeLook: boolean;
  toggleFreeLook: () => void;
  saveCurrentView: () => void;
  placementMode: boolean;
  togglePlacementMode: () => void;
  applyCameraPreset: (id: string) => boolean;
  bringCharacterToView: () => boolean;
  /** Single source of truth for "what's selected" — unifies the old selectedLightRef /
   * selectedPropIdxRef pair so the panel (work order 2) and the raycaster can't disagree. */
  selection: EditableId | null;
  /** Attaches the gizmo to the given id (placement mode only). Returns false when there's
   * nothing to attach — not in placement mode, or the id has no gizmo (ambient/scene). */
  selectById: (id: EditableId | null) => boolean;
  /** Lifts the G/R/S key handling into a method so panel buttons (work order 2) and the
   * keyboard shortcut share one implementation. No-op outside placement mode. */
  setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  /** Current gizmo mode, mirrored for the panel's toolbar highlight (work order 2). */
  gizmoMode: 'translate' | 'rotate' | 'scale';
  /** Writes a light param straight to the three.js object (and mirrors it into settings).
   * Needed because the settings→scene sync effect is skipped during placement mode. */
  applyLightPatch: (key: LightKey, patch: Partial<LightCfg>) => void;
  /** Toggles a prop's visibility straight on the three.js object, same reasoning as
   * applyLightPatch — the props-reload effect is skipped during placement mode. */
  setPropHidden: (index: number, hidden: boolean) => void;
  /** Placement-mode direct writes for the panel's number fields (see applyLightPatch). */
  applyPropPatch: (index: number, patch: Partial<RoomProp>) => void;
  removeProp: (index: number) => void;
  applyCharacterPatch: (patch: { yawDeg?: number; scaleMul?: number }) => void;
  /** Applies lights+grade from a look preset while editing (see applyLightPatch). */
  applyLookSettings: (next: RoomSettings) => void;
  /** Current axis lock, mirrored for the panel's X/Y/Z buttons (work order 2). */
  axisLock: 'X' | 'Y' | 'Z' | null;
  setAxisConstraint: (axis: 'X' | 'Y' | 'Z' | null) => void;
}

export function useRoomScene(
  mountRef: React.RefObject<HTMLDivElement | null>,
  mood: Mood,
  talking: boolean,
  settings: RoomSettings,
  onCameraPresetsChange: (presets: SceneCameraPreset[]) => void,
): RoomSceneAPI {
  const refsRef            = useRef<SceneRefs | null>(null);
  const moodRef            = useRef(mood);
  const screenRef = useRef<ScreenDriver | null>(null);
  const performerRef       = useRef<CharacterPerformer | null>(null);
  const talkingRef         = useRef(talking);
  const settingsRef        = useRef<RoomSettings>(settings);
  const charGroupRef       = useRef<THREE.Group | null>(null);
  const roomGroupRef       = useRef<THREE.Group | null>(null);
  const propsGroupRef      = useRef<THREE.Group | null>(null);
  const glbSceneLightsRef  = useRef<THREE.Light[]>([]);
  const cameraPresetsRef = useRef<SceneCameraPreset[]>([]);
  const onCameraPresetsChangeRef = useRef(onCameraPresetsChange);
  onCameraPresetsChangeRef.current = onCameraPresetsChange;
  const disposedRef        = useRef(false);
  const gradeRef           = useRef<GradeRenderer | null>(null);
  const applyShadowsRef    = useRef<(() => void) | null>(null);
  const freeLookRef        = useRef(false);
  const [freeLook, setFreeLook] = useState(false);
  const springChainsRef    = useRef<SpringChain[]>([]);
  const motionRef          = useRef<MotionLibrary | null>(null);
  const mixerRef           = useRef<THREE.AnimationMixer | null>(null);
  const animatedBoneNamesRef = useRef<Set<string>>(new Set());

  // Placement mode
  const placementModeRef      = useRef(false);
  const [placementMode, setPlacementMode] = useState(false);
  // Single-truth selection — replaces the old selectedLightRef/selectedPropIdxRef pair.
  // The character is now an explicit `{ kind: 'character' }` id, not an implicit else-branch.
  const selectionRef          = useRef<EditableId | null>(null);
  const [selection, setSelection] = useState<EditableId | null>(null);
  const axisLockRef           = useRef<'X' | 'Y' | 'Z' | null>(null);
  const [axisLock, setAxisLock] = useState<'X' | 'Y' | 'Z' | null>(null);
  const [gizmoMode, setGizmoModeState] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const charBaseScaleRef      = useRef<number>(1);
  const placementKeyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const intensityLabelRef     = useRef<HTMLDivElement | null>(null);

  const registerSceneCameras = useCallback((scene: THREE.Object3D, refs: SceneRefs) => {
    cameraPresetsRef.current = collectSceneCameraPresets(scene);
    onCameraPresetsChangeRef.current(cameraPresetsRef.current);
    fitSceneClipRange(refs.camera, refs.controls, scene);
  }, []);

  // Keeps selectionRef (read by the render-loop-adjacent closures below) and the `selection`
  // state (read by the panel, work order 2) in lockstep — the two must never disagree about
  // what's currently picked.
  const setSelectionBoth = useCallback((id: EditableId | null) => {
    selectionRef.current = id;
    setSelection(id);
  }, []);

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

  // keep talkingRef current so the render-loop tick always reads the latest VN presenter state
  useEffect(() => {
    talkingRef.current = talking;
  }, [talking]);

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
      resetSpringChains(model, springChainsRef.current);
    }
    applyView(refs, settings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // sync physics slider/override changes to already-collected spring chains live (not gated on
  // placement mode: dragging the character's scale gizmo shouldn't block the gravity slider).
  useEffect(() => {
    const physicsBones = getCharacterCfg(settings, settings.characterFile).physicsBones;
    applySpringSettings(
      springChainsRef.current,
      physicsBones?.overrides ?? {},
      { ...DEFAULT_SPRING_PARAMS, ...physicsBones?.default },
    );
  }, [settings]);

  // Color grade is screen-level (not part of the placement gizmo state), so unlike lights it
  // stays live while editing; GradeRenderer only builds a composer when the grade is visible.
  useEffect(() => {
    gradeRef.current?.apply(settings.grade ?? DEFAULT_GRADE);
  }, [settings.grade]);

  // User-added lights and shadows. Unlike the fixed lights below this is NOT skipped in
  // placement mode, because the panel adds/removes lights while editing; position is only
  // written when not editing (the proxy owns it mid-drag).
  useEffect(() => {
    const refs = refsRef.current;
    if (!refs) return;
    refs.extraRig.sync(settings.lights.extra, {
      shadows: settings.lights.shadows,
      writePos: !placementModeRef.current,
    });
    applyShadowsRef.current?.();
    const sel = selectionRef.current;
    if (sel?.kind === 'light' && isExtraLightKey(sel.key) && !refs.extraRig.has(extraLightId(sel.key))) {
      refs.transformCtl.detach();
      setSelectionBoth(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.lights.extra, settings.lights.shadows]);

  // sync lights settings to scene objects (skip in placement mode)
  useEffect(() => {
    if (placementModeRef.current) return;
    const refs = refsRef.current;
    if (!refs) return;
    syncFixedLights(refs, settings.lights, glbSceneLightsRef.current);
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

    const oldModel = charGroup.children[0] ?? null;
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      if (oldModel) mixerRef.current.uncacheRoot(oldModel);
      mixerRef.current = null;
    }
    animatedBoneNamesRef.current = new Set();

    screenRef.current?.dispose(); screenRef.current = null;
    for (const child of [...charGroup.children]) {
      charGroup.remove(child);
      disposeModel(child);
    }
    performerRef.current = null;
    motionRef.current = null;
    setActiveMotionLibrary(null);
    springChainsRef.current = [];

    let cancelled = false;
    const loader = new GLTFLoader();
    const s = settingsRef.current;
    loadRoomModel(loader, 'character', s.characterFile,
      (gltf) => {
        if (cancelled || disposedRef.current) return;
        const model = gltf.scene;
        normalizeAndPosition(model, s);
        enableCharLayer(model);
        charGroup.add(model);
        applyShadowsRef.current?.();
        const diagExtra: { expressions?: MappingReport; materials?: BindingReport[] } = {};
        const publishDiag = () => {
          if (!cancelled && !disposedRef.current && performerRef.current) publishCharacterDiagnostics(buildCharacterDiagnostics(performerRef.current, diagExtra));
        };
        const materialReady = loadCharacterMaterials(s.characterFile).then(async (materials) => {
          if (!materials) return;
          const textures = await loadCharacterToonTextures(s.characterFile, materials);
          if (cancelled || disposedRef.current) { Object.values(textures).forEach((t) => t.dispose()); return; }
          diagExtra.materials = applyToonBindings(model, materials, { textures });
          publishDiag();
        });
        charBaseScaleRef.current = s.scaleMul > 0 ? model.scale.x / s.scaleMul : model.scale.x;
        const setup = setupCharacter(
          model, gltf.animations, getCharacterCfg(s, s.characterFile), s.idleClip, startIdleClip,
        );
        performerRef.current = setup.performer;
        void materialReady.catch(error => console.warn('[screen] material preparation failed:', error)).then(() => loadScreenDriver(s.characterFile, model,
          () => !cancelled && !disposedRef.current && performerRef.current === setup.performer)).then(driver => {
          if (cancelled || disposedRef.current || performerRef.current !== setup.performer) driver?.dispose();
          else screenRef.current = driver;
        });
        void loadCharacterExpressions(s.characterFile).then((cfg) => {
          if (cfg && !cancelled && !disposedRef.current && performerRef.current === setup.performer) { diagExtra.expressions = setup.performer.applyExpressions(cfg); publishDiag(); }
        });
        void loadCharacterMotions(s.characterFile).then(async (cfg) => {
          if (!cfg || cancelled || disposedRef.current || performerRef.current !== setup.performer) return;
          const lib = new MotionLibrary(model, setup.performer, gltf.animations);
          await lib.load(cfg, loadMotionFileUrl);
          if (cancelled || disposedRef.current || performerRef.current !== setup.performer) { lib.dispose(); return; }
          motionRef.current = lib;
          setActiveMotionLibrary(lib);
        });
        publishDiag();
        springChainsRef.current = setup.springChains;
        mixerRef.current = setup.mixer;
        animatedBoneNamesRef.current = setup.animatedBoneNames;
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
    cameraPresetsRef.current = [];
    onCameraPresetsChangeRef.current([]);
    refs.camera.far = 100;
    refs.camera.updateProjectionMatrix();

    let cancelled = false;
    const loader = new GLTFLoader();
    loadRoomModel(loader, 'scene', settingsRef.current.sceneFile,
      (gltf) => {
        if (cancelled || disposedRef.current) return;
        roomGroup.add(gltf.scene);
        applyShadowsRef.current?.();
        glbSceneLightsRef.current = collectGlbLights(gltf.scene, settingsRef.current.lights.useSceneLights);
        registerSceneCameras(gltf.scene, refs);
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
          obj.visible = !prop.hidden;
          obj.userData.__propIdx = idx;
          propsGroup.add(obj);
          applyShadowsRef.current?.();
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

    // Edit-mode helpers (direction/cone lines) and the user-added lights.
    const helpers = new LightHelperSet(scene);
    helpers.track('key', keyLight, 0xffee44);
    helpers.track('charFill', charFill, 0x44aaff);
    const extraRig = new ExtraLightRig(scene, helpers, CHAR_LAYER);
    extraRig.sync(initLights.extra, { shadows: initLights.shadows, writePos: true });

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
        const sel = selectionRef.current;
        if (!sel) return;

        switch (sel.kind) {
          case 'light': {
            if (sel.key === 'key') {
              keyLight.position.copy(proxyKey.position);
              const pos: [number, number, number] = [proxyKey.position.x, proxyKey.position.y, proxyKey.position.z];
              saveRoomSettings({ ...s, lights: { ...s.lights, key: { ...s.lights.key, pos } } });
            } else if (sel.key === 'charFill') {
              charFill.position.copy(proxyFill.position);
              const pos: [number, number, number] = [proxyFill.position.x, proxyFill.position.y, proxyFill.position.z];
              saveRoomSettings({ ...s, lights: { ...s.lights, charFill: { ...s.lights.charFill, pos } } });
            }
            else if (isExtraLightKey(sel.key)) {
              const id = extraLightId(sel.key);
              const proxy = extraRig.getProxy(id);
              const light = extraRig.getLight(id);
              if (proxy && light) {
                light.position.copy(proxy.position);
                const pos: [number, number, number] = [proxy.position.x, proxy.position.y, proxy.position.z];
                saveRoomSettings({
                  ...s,
                  lights: { ...s.lights, extra: s.lights.extra.map(e => (e.id === id ? { ...e, pos } : e)) },
                });
              }
            }
            // ambient has no position/gizmo, so there's nothing to react to here.
            applyShadowsRef.current?.();
            break;
          }
          case 'prop': {
            const propObj = propsGroupRef.current?.children.find(c => c.userData.__propIdx === sel.index);
            if (propObj) {
              const updatedProps = (s.props ?? []).map((p, i) =>
                i === sel.index
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
            break;
          }
          case 'character': {
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
            break;
          }
          case 'scene':
            // Scene root isn't individually placeable; no gizmo attaches to it.
            break;
        }
      }, 150);
    });
    scene.add(transformCtl.getHelper());

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
      const proxyHits = raycaster.intersectObjects([proxyKey, proxyFill, ...extraRig.proxies]);
      if (proxyHits.length > 0) {
        const hit = proxyHits[0].object;
        transformCtl.setMode('translate');
        const extraId = hit.userData.__extraId as string | undefined;
        if (extraId) {
          setSelectionBoth({ kind: 'light', key: extraLightKey(extraId) });
          transformCtl.attach(hit);
        } else if (hit === proxyKey) {
          setSelectionBoth({ kind: 'light', key: 'key' });
          transformCtl.attach(proxyKey);
        } else {
          setSelectionBoth({ kind: 'light', key: 'charFill' });
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
          const idx = (root.userData.__propIdx as number | undefined) ?? null;
          if (idx !== null) {
            setSelectionBoth({ kind: 'prop', index: idx });
            transformCtl.setMode('translate');
            transformCtl.attach(root);
            return;
          }
        }
      }

      // Character
      const charModel = charGroupRef.current?.children[0];
      if (charModel) {
        const charHits = raycaster.intersectObject(charModel, true);
        if (charHits.length > 0) {
          setSelectionBoth({ kind: 'character' });
          transformCtl.setMode('translate');
          transformCtl.attach(charModel);
          return;
        }
      }

      // Deselect on empty click
      transformCtl.detach();
      setSelectionBoth(null);
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
        gradeRef.current?.setSize(nw, nh);
      }),
      targetLightColor,
      targetLightIntensity,
      camBase: new THREE.Vector3(0, 1.15, 2.0),
      tgtBase: new THREE.Vector3(0, 1.15, 0),
      proxyKey,
      proxyFill,
      helpers,
      extraRig,
    };
    refs.resizeObs.observe(mount);
    refsRef.current = refs;

    const grade = new GradeRenderer(renderer, scene, camera, w, h);
    grade.apply(initSettings.grade ?? DEFAULT_GRADE);
    gradeRef.current = grade;

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

    // Shadows are opt-in (settings.lights.shadows). Also refits directional shadow frusta to the
    // current scene bounds, and is re-run after any model finishes loading. A no-op while off
    // and never turned on, so the default path costs nothing.
    applyShadowsRef.current = () => {
      const on = settingsRef.current.lights.shadows;
      const wasOn = renderer.shadowMap.enabled;
      if (!on && !wasOn) return;
      renderer.shadowMap.enabled = on;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      keyLight.castShadow = on;
      const mark = (group: THREE.Object3D, cast: boolean) => group.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = on && cast;
          obj.receiveShadow = on;
        }
      });
      mark(roomGroup, false);
      mark(charGroup, true);
      mark(propsGroup, true);
      if (on) {
        const bounds = new THREE.Box3();
        for (const g of [roomGroup, charGroup, propsGroup]) {
          const b = new THREE.Box3().setFromObject(g);
          if (!b.isEmpty()) bounds.union(b);
        }
        fitDirectionalShadow(keyLight, bounds);
        extraRig.lights.forEach(l => {
          if ((l as THREE.DirectionalLight).isDirectionalLight) fitDirectionalShadow(l as THREE.DirectionalLight, bounds);
        });
      }
      if (on !== wasOn) {
        // Existing programs were compiled without shadow code; force a rebuild once.
        scene.traverse(obj => {
          const mats = (obj as THREE.Mesh).material;
          if (mats) (Array.isArray(mats) ? mats : [mats]).forEach(m => { m.needsUpdate = true; });
        });
      }
    };
    applyShadowsRef.current();

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
    loadRoomModel(loader, 'scene', initSettings.sceneFile,
      (gltf) => {
        if (disposedRef.current) return;
        roomGroup.add(gltf.scene);
        applyShadowsRef.current?.();
        glbSceneLightsRef.current = collectGlbLights(gltf.scene, settingsRef.current.lights.useSceneLights);
        registerSceneCameras(gltf.scene, refs);
        roomLoaded = true;
        maybeRemovePlaceholder();
      },
      undefined,
      () => { addRoomFallback(roomGroup); roomLoaded = true; showPlaceholderNote(); maybeRemovePlaceholder(); },
    );

    // ── load character ──
    loadRoomModel(loader, 'character', initSettings.characterFile,
      (gltf) => {
        if (disposedRef.current) return;
        if (settingsRef.current.characterFile !== initSettings.characterFile) {
          charLoaded = true;
          maybeRemovePlaceholder();
          return;
        }
        const activeSettings = settingsRef.current;
        const model = gltf.scene;
        normalizeAndPosition(model, activeSettings);
        enableCharLayer(model);
        charGroup.add(model);
        applyShadowsRef.current?.();
        const sm = activeSettings.scaleMul;
        charBaseScaleRef.current = sm > 0 ? model.scale.x / sm : model.scale.x;
        const setup = setupCharacter(
          model, gltf.animations, getCharacterCfg(activeSettings, activeSettings.characterFile),
          activeSettings.idleClip, startIdleClip,
        );
        performerRef.current = setup.performer;
        void loadScreenDriver(activeSettings.characterFile, model,
          () => !disposedRef.current && performerRef.current === setup.performer).then(driver => {
          if (disposedRef.current || performerRef.current !== setup.performer) driver?.dispose();
          else screenRef.current = driver;
        });
        springChainsRef.current = setup.springChains;
        mixerRef.current = setup.mixer;
        animatedBoneNamesRef.current = setup.animatedBoneNames;
        applyView(refs, activeSettings);
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

      const dt  = refs.clock.getDelta();
      const t   = refs.clock.elapsedTime;
      const now = performance.now();
      const currentMood = moodRef.current;

      const directive = getCallDirective(now);
      const moodExpression: Record<Mood, string> = { '平静': 'neutral', '开心': 'happy', '低落': 'sad', '病娇': 'yandere', '分心': 'thinking', '生气': 'angry', '惊讶': 'surprised' };
      screenRef.current?.update(now, directive?.expression ?? moodExpression[currentMood],
        talkingRef.current ? 'speaking' : getCallActivity());

      performerRef.current?.prepareFrame();
      mixerRef.current?.update(dt);

      // All morph/bone performance layers live in the shared performer (CA-02) so Room and
      // Pet cannot drift apart. Room keeps only its own stage concerns: the physics chains
      // below, camera breathing, and mood light tinting.
      motionRef.current?.update(dt);
      performerRef.current?.update({
        t, now,
        mood: currentMood,
        directive,
        talking: talkingRef.current,
        animatedBoneNames: animatedBoneNamesRef.current,
        charGroup: charGroupRef.current,
        hairDrivenByPhysics: springChainsRef.current.length > 0,
      });

      // Physics spring chains (hair/tail/ribbons) — must run after head/gaze/micro-anim so it
      // inherits the final bone orientations for this frame. Head/breath/shoulder edits above
      // only touch local transforms, so force a matrixWorld pass first or the chain would read
      // last frame's parent.matrixWorld and lag/microjitter by one frame.
      charGroupRef.current?.updateMatrixWorld(true);
      updateSpringChains(springChainsRef.current, dt);

      // camera breathing — paused in free look and placement mode
      if (!freeLookRef.current && !placementModeRef.current) {
        const bx = Math.sin(t * 0.18) * 0.010;
        const by = Math.sin(t * 0.24) * 0.008;
        camera.position.set(refs.camBase.x + bx, refs.camBase.y + by, refs.camBase.z);
        controls.target.set(refs.tgtBase.x + bx, refs.tgtBase.y + by, refs.tgtBase.z);
      }

      if (settingsRef.current.lights.moodTint) {
        lerpColor.copy(refs.keyLight.color);
        lerpColor.lerp(refs.targetLightColor, lerpSpeed);
        refs.keyLight.color.copy(lerpColor);
        refs.keyLight.intensity += (refs.targetLightIntensity - refs.keyLight.intensity) * lerpSpeed;
      }

      controls.update();
      if (placementModeRef.current) helpers.update();
      (gradeRef.current ?? { render: () => renderer.render(scene, camera) }).render();
    }

    refs.clock.getDelta();
    tick();

    return () => {
      disposedRef.current = true;
      screenRef.current?.dispose(); screenRef.current = null;
      cancelAnimationFrame(refs.rafId);
      refs.resizeObs.disconnect();

      if (placementKeyHandlerRef.current) {
        window.removeEventListener('keydown', placementKeyHandlerRef.current);
        placementKeyHandlerRef.current = null;
      }
      intensityLabelRef.current?.remove();
      intensityLabelRef.current = null;

      scene.remove(transformCtl.getHelper());
      transformCtl.detach();
      transformCtl.dispose();
      proxyGeo.dispose();
      proxyKeyMat.dispose();
      proxyFillMat.dispose();

      refs.controls.dispose();
      performerRef.current = null;
      springChainsRef.current = [];
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
      animatedBoneNamesRef.current = new Set();

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

      motionRef.current = null;
      setActiveMotionLibrary(null);
      gradeRef.current?.dispose();
      gradeRef.current = null;
      helpers.dispose();
      extraRig.dispose();
      applyShadowsRef.current = null;
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
          setEditVisuals(refs, false);
          refs.transformCtl.detach();
        }
        if (placementKeyHandlerRef.current) {
          window.removeEventListener('keydown', placementKeyHandlerRef.current);
          placementKeyHandlerRef.current = null;
        }
        intensityLabelRef.current?.remove();
        intensityLabelRef.current = null;
        setSelectionBoth(null);
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
    refs.camBase.copy(refs.camera.position);
    refs.tgtBase.copy(refs.controls.target);
    const next = { ...settingsRef.current, customView: { pos, target } };
    settingsRef.current = next;
    saveRoomSettings(next);
  }, []);

  const togglePlacementMode = useCallback(() => {
    const refs = refsRef.current;

    if (placementModeRef.current) {
      // Exit
      placementModeRef.current = false;
      setPlacementMode(false);
      if (refs) {
        saveCurrentView();
        lockControls(refs.controls);
        refs.proxyKey.visible = false;
        refs.proxyFill.visible = false;
        setEditVisuals(refs, false);
        refs.transformCtl.detach();
      }
      if (placementKeyHandlerRef.current) {
        window.removeEventListener('keydown', placementKeyHandlerRef.current);
        placementKeyHandlerRef.current = null;
      }
      intensityLabelRef.current?.remove();
      intensityLabelRef.current = null;
      setSelectionBoth(null);
      // A scale-mode gizmo drag while in placement mode changes model world scale directly,
      // bypassing the settings effect (which is skipped in placement mode) — re-measure so
      // spring chains don't clamp hair to a now-stale rest length.
      const exitedModel = charGroupRef.current?.children[0];
      if (exitedModel) resetSpringChains(exitedModel, springChainsRef.current);
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
        unlockControls(refs.controls);
        refs.proxyKey.position.copy(refs.keyLight.position);
        refs.proxyFill.position.copy(refs.charFill.position);
        refs.proxyKey.visible  = true;
        refs.proxyFill.visible = true;
        setEditVisuals(refs, true);
      }

      axisLockRef.current = null;
      setAxisLock(null);
      setGizmoModeState('translate');

      const handler = (e: KeyboardEvent) => {
        const refs = refsRef.current;
        if (!refs || !placementModeRef.current) return;
        const tc = refs.transformCtl;
        const sel = selectionRef.current;
        const lightKey: LightKey | null = sel?.kind === 'light' ? sel.key : null;

        // Arrow keys: adjust selected light intensity
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          if (!lightKey) return;
          const cfg = getLightCfg(settingsRef.current.lights, lightKey);
          if (!cfg) return;
          const delta = e.key === 'ArrowRight' ? 0.1 : -0.1;
          const newIntensity = Math.max(0, Math.min(4, cfg.intensity + delta));
          applyLightPatchRef.current(lightKey, { intensity: newIntensity });
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
            const name = lightKey === 'key' ? 'key' : lightKey === 'charFill' ? 'fill' : lightKey === 'ambient' ? 'ambient' : 'extra';
            intensityLabelRef.current.textContent = `${name} ▸ ${newIntensity.toFixed(1)}`;
          }
          e.preventDefault();
          return;
        }

        switch (e.key.toLowerCase()) {
          case 'g':
            setGizmoModeRef.current('translate');
            setAxisConstraintRef.current(null);
            break;
          case 'r':
            setGizmoModeRef.current('rotate');
            setAxisConstraintRef.current(null);
            break;
          case 's':
            setGizmoModeRef.current('scale');
            setAxisConstraintRef.current(null);
            break;
          case 'x':
            setAxisConstraintRef.current(axisLockRef.current === 'X' ? null : 'X');
            break;
          case 'y':
            setAxisConstraintRef.current(axisLockRef.current === 'Y' ? null : 'Y');
            break;
          case 'z':
            setAxisConstraintRef.current(axisLockRef.current === 'Z' ? null : 'Z');
            break;
          case 'escape':
            if (tc.object) {
              tc.detach();
              setSelectionBoth(null);
              intensityLabelRef.current?.remove();
              intensityLabelRef.current = null;
            } else {
              // Exit placement mode
              placementModeRef.current = false;
              setPlacementMode(false);
              saveCurrentView();
              lockControls(refs.controls);
              refs.proxyKey.visible  = false;
              refs.proxyFill.visible = false;
              setEditVisuals(refs, false);
              tc.detach();
              if (placementKeyHandlerRef.current) {
                window.removeEventListener('keydown', placementKeyHandlerRef.current);
                placementKeyHandlerRef.current = null;
              }
              setSelectionBoth(null);
              intensityLabelRef.current?.remove();
              intensityLabelRef.current = null;
              const escModel = charGroupRef.current?.children[0];
              if (escModel) resetSpringChains(escModel, springChainsRef.current);
            }
            break;
        }
      };

      placementKeyHandlerRef.current = handler;
      window.addEventListener('keydown', handler);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveCurrentView]);

  const applyCameraPreset = useCallback((id: string): boolean => {
    const preset = cameraPresetsRef.current.find(item => item.id === id);
    const refs = refsRef.current;
    if (!preset || !refs) return false;
    if (placementModeRef.current) togglePlacementMode();
    if (freeLookRef.current) toggleFreeLook();
    const next = {
      ...settingsRef.current,
      ...placementFromSceneCamera(preset, TARGET_H * settingsRef.current.scaleMul),
      sceneCameraByScene: { ...settingsRef.current.sceneCameraByScene, [settingsRef.current.sceneFile]: id },
    };
    settingsRef.current = next;
    saveRoomSettings(next);
    applyView(refs, next);
    return true;
  }, [togglePlacementMode, toggleFreeLook]);

  const bringCharacterToView = useCallback((): boolean => {
    const refs = refsRef.current;
    if (!refs) return false;
    const position = refs.camera.getWorldPosition(new THREE.Vector3());
    const direction = refs.camera.getWorldDirection(new THREE.Vector3()).normalize();
    const placement = placementFromSceneCamera({
      id: 'current', name: 'current',
      position: position.toArray() as [number, number, number],
      direction: direction.toArray() as [number, number, number],
      fovDeg: refs.camera.fov,
    }, TARGET_H * settingsRef.current.scaleMul);
    const next = { ...settingsRef.current, ...placement };
    settingsRef.current = next;
    const model = charGroupRef.current?.children[0];
    if (model) {
      resetModelTransform(model);
      normalizeAndPosition(model, next);
      resetSpringChains(model, springChainsRef.current);
    }
    applyView(refs, next);
    saveRoomSettings(next);
    return true;
  }, []);

  const setGizmoMode = useCallback((mode: 'translate' | 'rotate' | 'scale') => {
    const tc = refsRef.current?.transformCtl;
    if (!tc || !placementModeRef.current) return;
    tc.setMode(mode);
    setGizmoModeState(mode);
  }, []);

  const setAxisConstraint = useCallback((axis: 'X' | 'Y' | 'Z' | null) => {
    const tc = refsRef.current?.transformCtl;
    if (!tc || !placementModeRef.current) return;
    axisLockRef.current = axis;
    setAxisLock(axis);
    tc.showX = !axis || axis === 'X';
    tc.showY = !axis || axis === 'Y';
    tc.showZ = !axis || axis === 'Z';
  }, []);
  // Same reasoning as setGizmoModeRef: the placement-mode keydown handler is built inside
  // togglePlacementMode's closure and must not become dependent on setAxisConstraint's
  // identity, so it calls through this ref instead.
  const setAxisConstraintRef = useRef(setAxisConstraint);
  setAxisConstraintRef.current = setAxisConstraint;

  // The props-reload effect is skipped during placement mode, so a panel-driven visibility
  // toggle must flip the live three.js object directly.
  const setPropHidden = useCallback((index: number, hidden: boolean) => {
    const s = settingsRef.current;
    const nextProps = (s.props ?? []).map((p, i) => (i === index ? { ...p, hidden } : p));
    const next = { ...s, props: nextProps };
    settingsRef.current = next;
    saveRoomSettings(next);

    const propObj = propsGroupRef.current?.children.find(c => c.userData.__propIdx === index);
    if (propObj) propObj.visible = !hidden;
  }, []);

  // The "sync lights settings to scene objects" effect bails out early while in placement mode
  // (dragging a light's gizmo would otherwise fight that effect every render). Panel edits made
  // during placement mode must therefore poke the three.js objects directly — this is that
  // direct write path, mirrored into settings so it isn't lost on the next real sync.
  // Same reasoning for the numeric prop/character edits: the props and placement-settings
  // effects don't run during placement mode, so the panel's number fields write the live
  // three.js objects here and mirror the result into settings.
  const applyPropPatch = useCallback((index: number, patch: Partial<RoomProp>) => {
    const s = settingsRef.current;
    const next = { ...s, props: (s.props ?? []).map((p, i) => (i === index ? { ...p, ...patch } : p)) };
    settingsRef.current = next;
    saveRoomSettings(next);
    const obj = propsGroupRef.current?.children.find(c => c.userData.__propIdx === index);
    if (!obj) return;
    if (patch.pos) obj.position.set(...patch.pos);
    if (patch.rot) obj.rotation.set(...patch.rot);
    if (patch.scale !== undefined) obj.scale.setScalar(patch.scale);
  }, []);

  const removeProp = useCallback((index: number) => {
    const refs = refsRef.current;
    const group = propsGroupRef.current;
    const s = settingsRef.current;
    const next = { ...s, props: (s.props ?? []).filter((_, i) => i !== index) };
    settingsRef.current = next;
    saveRoomSettings(next);
    if (!group) return;
    const obj = group.children.find(c => c.userData.__propIdx === index);
    if (obj) {
      if (refs?.transformCtl.object === obj) refs.transformCtl.detach();
      group.remove(obj);
      disposeModel(obj);
    }
    // Objects after the removed one shift down so __propIdx keeps matching settings.props.
    group.children.forEach(c => {
      const i = c.userData.__propIdx as number | undefined;
      if (i !== undefined && i > index) c.userData.__propIdx = i - 1;
    });
    const sel = selectionRef.current;
    if (sel?.kind === 'prop') {
      if (sel.index === index) setSelectionBoth(null);
      else if (sel.index > index) setSelectionBoth({ kind: 'prop', index: sel.index - 1 });
    }
  }, [setSelectionBoth]);

  const applyCharacterPatch = useCallback((patch: { yawDeg?: number; scaleMul?: number }) => {
    const s = settingsRef.current;
    const next = { ...s, ...patch };
    settingsRef.current = next;
    saveRoomSettings(next);
    const model = charGroupRef.current?.children[0];
    if (!model) return;
    if (patch.yawDeg !== undefined) model.rotation.y = THREE.MathUtils.degToRad(patch.yawDeg);
    if (patch.scaleMul !== undefined) model.scale.setScalar(charBaseScaleRef.current * patch.scaleMul);
  }, []);

  // Applies a whole new settings object that changes lights/grade at once (look presets). The
  // lights effect is skipped in placement mode, so push the result onto the scene directly.
  const applyLookSettings = useCallback((next: RoomSettings) => {
    settingsRef.current = next;
    saveRoomSettings(next);
    const refs = refsRef.current;
    if (!refs) return;
    syncFixedLights(refs, next.lights, glbSceneLightsRef.current);
    refs.extraRig.sync(next.lights.extra, { shadows: next.lights.shadows, writePos: true });
    applyShadowsRef.current?.();
    refs.transformCtl.detach();
    setSelectionBoth(null);
  }, [setSelectionBoth]);

  const applyLightPatch = useCallback((key: LightKey, patch: Partial<LightCfg>) => {
    const refs = refsRef.current;
    const s = settingsRef.current;
    if (!getLightCfg(s.lights, key)) return;
    const lights = isExtraLightKey(key)
      ? { ...s.lights, extra: s.lights.extra.map(e => (e.id === extraLightId(key) ? { ...e, ...patch } : e)) }
      : { ...s.lights, [key]: { ...s.lights[key], ...patch } };
    const next = { ...s, lights };
    settingsRef.current = next;
    saveRoomSettings(next);
    if (!refs) return;

    let light: THREE.Light | null;
    let proxy: THREE.Mesh | null = null;
    if (isExtraLightKey(key)) {
      light = refs.extraRig.getLight(extraLightId(key));
      proxy = refs.extraRig.getProxy(extraLightId(key));
    } else {
      light = key === 'ambient' ? refs.sceneAmbient : key === 'key' ? refs.keyLight : refs.charFill;
      proxy = key === 'key' ? refs.proxyKey : key === 'charFill' ? refs.proxyFill : null;
    }
    if (!light) return;
    if (patch.on !== undefined) light.visible = patch.on;
    if (patch.color !== undefined) light.color.set(patch.color);
    if (patch.intensity !== undefined) light.intensity = patch.intensity;
    if (patch.pos !== undefined && key !== 'ambient') {
      light.position.set(...patch.pos);
      proxy?.position.set(...patch.pos);
    }
  }, []);
  // The placement-mode keydown handler is built inside togglePlacementMode's closure (it needs
  // per-session axis-lock state), so it can't call the hook-level setGizmoMode directly without
  // becoming a dependency that would force togglePlacementMode to be redefined on every render.
  // Routing the call through a ref keeps the G/R/S implementation single-sourced in setGizmoMode
  // without adding that dependency.
  const applyLightPatchRef = useRef(applyLightPatch);
  applyLightPatchRef.current = applyLightPatch;
  const setGizmoModeRef = useRef(setGizmoMode);
  setGizmoModeRef.current = setGizmoMode;

  const selectById = useCallback((id: EditableId | null): boolean => {
    const refs = refsRef.current;
    if (!refs || !placementModeRef.current) return false;

    if (id === null) {
      refs.transformCtl.detach();
      setSelectionBoth(null);
      return false;
    }

    switch (id.kind) {
      case 'light': {
        if (id.key === 'ambient') {
          // No position to attach a gizmo to — selection updates, but there's nothing to drag.
          setSelectionBoth(id);
          return false;
        }
        const proxy = isExtraLightKey(id.key)
          ? refs.extraRig.getProxy(extraLightId(id.key))
          : id.key === 'key' ? refs.proxyKey : refs.proxyFill;
        setSelectionBoth(id);
        if (!proxy) return false;
        refs.transformCtl.attach(proxy);
        return true;
      }
      case 'prop': {
        const propObj = propsGroupRef.current?.children.find(c => c.userData.__propIdx === id.index);
        if (!propObj) {
          setSelectionBoth(id);
          return false;
        }
        setSelectionBoth(id);
        refs.transformCtl.attach(propObj);
        return true;
      }
      case 'character': {
        const model = charGroupRef.current?.children[0];
        if (!model) {
          setSelectionBoth(id);
          return false;
        }
        setSelectionBoth(id);
        refs.transformCtl.attach(model);
        return true;
      }
      case 'scene':
        // The scene root isn't individually placeable.
        setSelectionBoth(id);
        return false;
    }
  }, [setSelectionBoth]);

  return {
    freeLook, toggleFreeLook, saveCurrentView, placementMode, togglePlacementMode,
    applyCameraPreset, bringCharacterToView,
    selection, selectById, setGizmoMode, gizmoMode, applyLightPatch, setPropHidden,
    applyPropPatch, removeProp, applyCharacterPatch, applyLookSettings,
    axisLock, setAxisConstraint,
  };
}
