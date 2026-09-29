import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Mood } from '../state/store';
import type { BoneMap } from '../room/roomSettings';
import { loadRoomModel } from '../room/roomAssets';
import type { ActiveDirective } from '../../windows/room/avatarDirective';
import { CharacterPerformer } from '../character/performer';
import type { PerformanceRoutes } from '../character/performanceRoutes';

export const RIG_TARGET_H = 1.6;

export interface CharacterRigHandle {
  charGroup: THREE.Group;
  animate: (t: number, now: number, mood: Mood, directive: ActiveDirective | null) => void;
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
 * Pet and Room cannot drift apart. Pet has no animation mixer and no spring chains
 * yet, so it reports an empty animated-bone set and no physics-driven hair.
 */
export function useCharacterRig(
  characterFile: string,
  boneMap?: BoneMap,
  onModelLoaded?: () => void,
  routes?: PerformanceRoutes,
): CharacterRigHandle {
  const charGroupRef = useRef<THREE.Group | null>(null);
  if (!charGroupRef.current) charGroupRef.current = new THREE.Group();
  const charGroup = charGroupRef.current;
  const performerRef = useRef<CharacterPerformer | null>(null);
  const pendingSpeechRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    for (const child of [...charGroup.children]) {
      charGroup.remove(child);
      disposeRigModel(child);
    }
    performerRef.current = null;

    const loader = new GLTFLoader();
    loadRoomModel(loader, 'character', characterFile,
      (gltf) => {
        if (cancelled) return;
        const model = gltf.scene;
        normalizeCharacter(model);
        charGroup.add(model);
        performerRef.current = new CharacterPerformer(model, { boneMap, routes, hasIdleClip: false });
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
      for (const child of [...charGroup.children]) {
        charGroup.remove(child);
        disposeRigModel(child);
      }
      performerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterFile]);

  const onNewSpeech = useCallback((text: string) => {
    const performer = performerRef.current;
    if (performer) performer.onNewSpeech(text);
    else pendingSpeechRef.current = text;
  }, []);

  const EMPTY_BONES: ReadonlySet<string> = new Set();
  const animate = useCallback((t: number, now: number, mood: Mood, directive: ActiveDirective | null) => {
    performerRef.current?.update({
      t, now, mood, directive,
      talking: false,
      animatedBoneNames: EMPTY_BONES,
      charGroup: charGroupRef.current,
      hairDrivenByPhysics: false,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { charGroup, animate, onNewSpeech };
}
