import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MOOD_TABLE } from '../state/store';
import type { Mood } from '../state/store';
import { MorphController } from '../../windows/room/morphController';
import { MOOD_MORPHS, EXPR_KEYS } from '../../windows/room/morphExpressions';
import { BoneResolver, microNoise } from '../../windows/room/boneResolver';
import { backendMoodToFrontend } from '../state/mood-mapping';
import type { BoneMap } from '../room/roomSettings';
import type { ActiveDirective } from '../../windows/room/avatarDirective';

export const RIG_TARGET_H = 1.6;

export interface CharacterRigHandle {
  charGroup: THREE.Group;
  animate: (t: number, now: number, mood: Mood, directive: ActiveDirective | null) => void;
  onNewSpeech: (text: string) => void;
}

interface BlinkState {
  phase: 'idle' | 'blink';
  nextAt: number;
  startedAt: number;
}

function scheduleNextBlink(state: BlinkState, mood: Mood): void {
  const entry = MOOD_TABLE[mood];
  const interval = (entry?.blinkInterval ?? 4500) as number;
  const jitter = (entry?.blinkJitter ?? 0.4) as number;
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
    if (elapsed < HALF) return elapsed / HALF;
    if (elapsed < HALF * 2) return 1 - (elapsed - HALF) / HALF;
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

export function useCharacterRig(characterUrl: string, boneMap?: BoneMap, onModelLoaded?: () => void): CharacterRigHandle {
  const charGroupRef = useRef<THREE.Group | null>(null);
  if (!charGroupRef.current) charGroupRef.current = new THREE.Group();
  const charGroup = charGroupRef.current;

  const morphRef = useRef<MorphController | null>(null);
  const blinkStateRef = useRef<BlinkState>({
    phase: 'idle',
    nextAt: performance.now() + 2000,
    startedAt: 0,
  });
  const talkEndsAtRef = useRef<number>(0);
  const boneResolverRef = useRef<BoneResolver | null>(null);
  const headBoneRef = useRef<THREE.Bone | null>(null);
  const headBoneRestRef = useRef(new THREE.Euler());
  const chestBasePosYRef = useRef(0);
  const chestBaseScaleRef = useRef(1);
  const shLBasePosYRef = useRef(0);
  const shRBasePosYRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    for (const child of [...charGroup.children]) {
      charGroup.remove(child);
      disposeRigModel(child);
    }
    morphRef.current = null;
    headBoneRef.current = null;
    boneResolverRef.current = null;

    const loader = new GLTFLoader();
    loader.load(
      characterUrl,
      (gltf) => {
        if (cancelled) return;
        const model = gltf.scene;
        normalizeCharacter(model);
        charGroup.add(model);
        morphRef.current = new MorphController(model);
        boneResolverRef.current = new BoneResolver(model, boneMap);
        const res = boneResolverRef.current.resolved;

        let hb: THREE.Bone | null = res.head ?? null;
        if (!hb) {
          model.traverse(obj => {
            if (!hb && obj instanceof THREE.Bone && obj.name.toLowerCase().includes('head')) hb = obj;
          });
        }
        headBoneRef.current = hb;
        if (hb) headBoneRestRef.current.copy(hb.rotation);

        const breathBone = res.chest ?? res.spine;
        if (breathBone) {
          chestBasePosYRef.current = breathBone.position.y;
          chestBaseScaleRef.current = breathBone.scale.x;
        }
        if (res.shoulderL) shLBasePosYRef.current = res.shoulderL.position.y;
        if (res.shoulderR) shRBasePosYRef.current = res.shoulderR.position.y;
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
      morphRef.current = null;
      headBoneRef.current = null;
      boneResolverRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterUrl]);

  const onNewSpeech = useCallback((text: string) => {
    const talkMs = Math.max(800, Math.min(6000, text.length * 60));
    talkEndsAtRef.current = performance.now() + talkMs;
  }, []);

  const animate = useCallback((t: number, now: number, mood: Mood, directive: ActiveDirective | null) => {
    const morph = morphRef.current;
    if (!morph) return;

    // Hair sway
    if (morph.has('hairSwayLeft') || morph.has('hairSwayRight')) {
      const sway = Math.sin(t * 0.6);
      morph.set('hairSwayLeft', Math.max(0, sway));
      morph.set('hairSwayRight', Math.max(0, -sway));
    } else if (morph.has('hairSway')) {
      morph.set('hairSway', 0.5 + 0.5 * Math.sin(t * 0.6));
    }

    // Expression layer
    let targets: Record<string, number>;
    if (directive?.expression) {
      const dMood = backendMoodToFrontend(directive.expression);
      const base = resolveExpression(morph, dMood);
      const s = directive.intensity;
      targets = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v * s]));
    } else {
      targets = resolveExpression(morph, mood);
    }
    const moodBlinkBaseline = targets['blink'] ?? 0;
    for (const key of EXPR_KEYS) {
      morph.lerp(key, targets[key] ?? 0, 0.08);
    }
    morph.set('blink', Math.max(moodBlinkBaseline, getBlinkPulse(blinkStateRef.current, now, mood)));

    // Mouth / speech
    const talking = directive?.speaking !== null && directive?.speaking !== undefined
      ? directive.speaking
      : now < talkEndsAtRef.current;
    const mouthTarget = talking
      ? (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 11))) * (0.8 + Math.random() * 0.2)
      : 0;
    morph.lerp('mouthOpen', mouthTarget, 0.5);

    // Gaze layer
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
    } else {
      morph.lerp('eyeLookLeft', 0, 0.04);
      morph.lerp('eyeLookRight', 0, 0.04);
      morph.lerp('eyeLookUp', 0, 0.04);
      morph.lerp('eyeLookDown', 0, 0.04);
    }

    // Gesture layer: head bone
    {
      const headBone = headBoneRef.current;
      const rest = headBoneRestRef.current;
      if (directive?.gesture) {
        const elapsedMs = now - (directive as ActiveDirective & { receivedAt: number }).receivedAt;
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
      } else {
        if (headBone) {
          headBone.rotation.x += (rest.x - headBone.rotation.x) * 0.1;
          headBone.rotation.y += (rest.y - headBone.rotation.y) * 0.1;
          headBone.rotation.z += (rest.z - headBone.rotation.z) * 0.1;
        }
      }
    }

    // Breath + micro-noise
    {
      const res = boneResolverRef.current?.resolved;
      if (res) {
        const moodEntry = MOOD_TABLE[mood];
        const period = ((moodEntry?.breathePeriod as number | undefined) ?? 4200) / 1000;
        const depth = (moodEntry?.breatheDepth as number | undefined) ?? 0.022;
        const breath = Math.sin((t / period) * Math.PI * 2);
        const breathBone = res.chest ?? res.spine;
        if (breathBone) {
          breathBone.position.y = chestBasePosYRef.current + breath * depth * 0.06;
          breathBone.scale.setScalar(chestBaseScaleRef.current + breath * depth * 0.5);
        }
        const hb = headBoneRef.current;
        if (hb) {
          hb.rotation.x += microNoise(t, 11) * 0.015;
          hb.rotation.y += microNoise(t, 23) * 0.020;
          hb.rotation.z += microNoise(t, 37) * 0.010;
        }
        if (res.shoulderL) res.shoulderL.position.y = shLBasePosYRef.current + microNoise(t, 5) * 0.004;
        if (res.shoulderR) res.shoulderR.position.y = shRBasePosYRef.current + microNoise(t, 9) * 0.004;
      }
    }
  }, []);

  return { charGroup, animate, onNewSpeech };
}
