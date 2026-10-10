import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Mood } from '../state/store';
import type { BoneMap } from '../room/roomSettings';
import { MotionLibrary, setActiveMotionLibrary } from '../character/motionLibrary';
import { buildCharacterDiagnostics, publishCharacterDiagnostics } from '../character/diagnostics';
import type { BindingReport } from '../character/toonMaterial';
import type { MappingReport } from '../../windows/room/morphController';
import { loadRoomModel, loadCharacterMaterials, loadCharacterToonTextures, loadCharacterExpressions, loadCharacterMotions, loadMotionFileUrl } from '../room/roomAssets';
import { applyToonBindings } from '../character/toonMaterial';
import type { ActiveDirective } from '../../windows/room/avatarDirective';
import { CharacterPerformer } from '../character/performer';
import type { PerformanceRoutes } from '../character/performanceRoutes';
import { selectIdleClip, startIdleClip } from '../../windows/room/clipPlayer';
import { loadScreenDriver, type ScreenDriver } from '../../windows/room/screenDriver';
import { useCharacterBehavior } from '../character/useCharacterBehavior';

export const RIG_TARGET_H = 1.6;

export interface CharacterRigHandle {
  charGroup: THREE.Group;
  animate: (t: number, now: number, mood: Mood, directive: ActiveDirective | null, thinking?: boolean) => void;
  onNewSpeech: (text: string) => void;
}

export function disposeRigModel(obj: THREE.Object3D): void {
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

export function normalizeCharacter(model: THREE.Object3D, scaleMul = 1): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.y === 0) return;
  const scale = (RIG_TARGET_H / size.y) * scaleMul;
  model.scale.setScalar(scale);
  const box2 = new THREE.Box3().setFromObject(model);
  const center = box2.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= box2.min.y;
  model.position.z -= center.z;
}

/**
 * Pet-window rig. The stage (window, camera, roaming, dragging) stays here; every
 * per-frame write to the character goes through the shared `CharacterPerformer`, so
 * Pet and Room cannot drift apart. Both replay authored Idle clips. Pet does not
 * run spring chains yet, so its hair remains on the morph fallback.
 */
export function useCharacterRig(
  characterFile: string,
  boneMap?: BoneMap,
  onModelLoaded?: () => void,
  routes?: PerformanceRoutes,
  idleClipName?: string,
): CharacterRigHandle {
  const charGroupRef = useRef<THREE.Group | null>(null);
  const behavior = useCharacterBehavior('pet');
  const screenRef = useRef<ScreenDriver | null>(null);
  if (!charGroupRef.current) charGroupRef.current = new THREE.Group();
  const charGroup = charGroupRef.current;
  const performerRef = useRef<CharacterPerformer | null>(null);
  const pendingSpeechRef = useRef<string | null>(null);
  const motionRef = useRef<MotionLibrary | null>(null);
  const lastTRef = useRef<number | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animatedBonesRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    lastTRef.current = null;
    screenRef.current?.dispose(); screenRef.current = null;

    for (const child of [...charGroup.children]) {
      charGroup.remove(child);
      disposeRigModel(child);
    }
    performerRef.current = null;
    motionRef.current = null;
    setActiveMotionLibrary(null);

    const loader = new GLTFLoader();
    loadRoomModel(loader, 'character', characterFile,
      (gltf) => {
        if (cancelled) { disposeRigModel(gltf.scene); return; }
        const model = gltf.scene;
        normalizeCharacter(model);
        charGroup.add(model);
        const materialReady = loadCharacterMaterials(characterFile).then(async (materials) => {
          if (!materials) return;
          const textures = await loadCharacterToonTextures(characterFile, materials);
          if (cancelled) { Object.values(textures).forEach((t) => t.dispose()); return; }
          extra.materials = applyToonBindings(model, materials, { textures });
          publish();
        });
        const idle = selectIdleClip(gltf.animations, idleClipName);
        const performer = new CharacterPerformer(model, { boneMap, routes, hasIdleClip: idle !== null });
        if (idle && (performer.routes.body === 'clip' || performer.routes.body === 'clip+procedural')) {
          const started = startIdleClip(model, idle, performer.ownedBones);
          mixerRef.current = started.mixer;
          animatedBonesRef.current = started.animatedBoneNames;
        }
        performerRef.current = performer;
        void materialReady.catch(error => console.warn('[screen] Pet material preparation failed:', error))
          .then(() => loadScreenDriver(characterFile, model, () => !cancelled && performerRef.current === performer))
          .then(driver => {
            if (cancelled || performerRef.current !== performer) driver?.dispose();
            else screenRef.current = driver;
          });
        const extra: { expressions?: MappingReport; materials?: BindingReport[] } = {};
        const publish = () => { if (!cancelled && performerRef.current === performer) publishCharacterDiagnostics(buildCharacterDiagnostics(performer, extra)); };
        publish();
        void loadCharacterMotions(characterFile).then(async (cfg) => {
          if (!cfg || cancelled || performerRef.current !== performer) return;
          const lib = new MotionLibrary(model, performer, gltf.animations);
          await lib.load(cfg, loadMotionFileUrl);
          if (cancelled || performerRef.current !== performer) { lib.dispose(); return; }
          motionRef.current = lib;
          setActiveMotionLibrary(lib);
        });
        void loadCharacterExpressions(characterFile).then((cfg) => {
          if (cfg && !cancelled && performerRef.current === performer) { extra.expressions = performer.applyExpressions(cfg); publish(); }
        });
        // A reply that arrived while the model was still loading still gets its mouth movement.
        if (pendingSpeechRef.current !== null) {
          performerRef.current.onNewSpeech(pendingSpeechRef.current);
          pendingSpeechRef.current = null;
        }
        onModelLoaded?.();
      },
      undefined,
      () => {
        if (cancelled) return;
        // Fallback placeholder
        const mat = new THREE.MeshLambertMaterial({ color: 0x7aa3cc });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.0, 8), mat);
        body.position.set(0, 0.5, 0);
        charGroup.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), mat);
        head.position.set(0, 1.25, 0);
        charGroup.add(head);
        onModelLoaded?.();
      },
    );

    return () => {
      cancelled = true;
      screenRef.current?.dispose(); screenRef.current = null;
      performerRef.current?.prepareFrame();
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      animatedBonesRef.current = new Set();
      motionRef.current?.dispose();
      motionRef.current = null;
      setActiveMotionLibrary(null);
      for (const child of [...charGroup.children]) {
        charGroup.remove(child);
        disposeRigModel(child);
      }
      performerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterFile, boneMap, routes, idleClipName]);

  const onNewSpeech = useCallback((text: string) => {
    const performer = performerRef.current;
    if (performer) performer.onNewSpeech(text);
    else pendingSpeechRef.current = text;
  }, []);

  const animate = useCallback((t: number, now: number, mood: Mood, directive: ActiveDirective | null, thinking = false) => {
    const dt = lastTRef.current === null ? 0 : Math.max(0, Math.min(0.1, t - lastTRef.current));
    lastTRef.current = t;
    performerRef.current?.prepareFrame();
    mixerRef.current?.update(dt);
    motionRef.current?.update(dt);
    const frame = behavior.frame(Date.now(), mood, thinking, directive?.expression);
    screenRef.current?.update(now, frame.expression, frame.activity);
    performerRef.current?.update({
      t, now, mood, directive,
      talking: frame.activity === 'speaking', activity: frame.activity,
      animatedBoneNames: animatedBonesRef.current,
      charGroup: charGroupRef.current,
      hairDrivenByPhysics: false,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behavior]);

  return { charGroup, animate, onNewSpeech };
}
