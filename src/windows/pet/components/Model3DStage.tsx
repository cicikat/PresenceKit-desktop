import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PetRendererProps } from '../../../shared/pet/petRenderer';
import { useCharacterRig } from '../../../shared/room3d/useCharacterRig';
import { loadRoomSettings, subscribeRoomSettings, getCharacterCfg } from '../../../shared/room/roomSettings';
import { getUIPref } from '../../../shared/uiPreferences';
import { listenPetPrefs, listenPetTurn } from '../../../shared/pet/bridge';
import { getActiveDirective } from '../../room/avatarDirective';
import type { Mood } from '../../../shared/state/store';

const PET_MODEL3D_ZOOM_KEY = 'pet.model3d.zoom';

// Camera looks at upper-body center of a 1.6-unit character
const CAM_Y = 0.9;
const CAM_DIST = 5;
const FRUSTUM_HH = 0.70; // half-height at zoom=1
// Fraction from the top of the viewport where the head should stay anchored while zooming.
const HEAD_TOP_MARGIN = 0.14;

export function Model3DStage({ snapshot }: PetRendererProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState(() => loadRoomSettings());
  const [zoom, setZoom] = useState(() => getUIPref<number>(PET_MODEL3D_ZOOM_KEY, 1));

  const moodRef = useRef<Mood>(snapshot.mood);

  // Camera ref + head anchor so zoom/model-load can reframe the shot
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const headYRef = useRef<number | null>(null);
  const charGroupRef = useRef<THREE.Group | null>(null);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const applyFraming = useCallback((z: number) => {
    const cam = cameraRef.current;
    if (!cam) return;
    const clampedZoom = Math.max(0.3, Math.min(4, z));
    cam.zoom = clampedZoom;
    const headY = headYRef.current;
    if (headY != null) {
      const halfHeight = FRUSTUM_HH / clampedZoom;
      cam.position.y = headY - (1 - 2 * HEAD_TOP_MARGIN) * halfHeight;
    }
    cam.updateProjectionMatrix();
  }, []);

  const handleModelLoaded = useCallback(() => {
    const group = charGroupRef.current;
    if (!group) return;
    const box = new THREE.Box3().setFromObject(group);
    headYRef.current = box.isEmpty() ? null : box.max.y;
    applyFraming(zoomRef.current);
  }, [applyFraming]);

  const characterUrl = `/room/character/${encodeURIComponent(settings.characterFile)}`;
  const { charGroup, animate, onNewSpeech } = useCharacterRig(
    characterUrl,
    getCharacterCfg(settings, settings.characterFile).boneMap,
    handleModelLoaded,
  );
  charGroupRef.current = charGroup;

  // Subscribe to room settings (for character file / boneMap changes)
  useEffect(() => subscribeRoomSettings(setSettings), []);

  // Subscribe to zoom pref changes (broadcast from ChatWindow slider via pet bridge —
  // cross-window storage events are unreliable under WebView2, see cc-tasks/14 §E-1)
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listenPetPrefs(patch => {
      if (typeof patch.model3dZoom === 'number') setZoom(patch.model3dZoom);
    }).then(fn => {
      if (disposed) fn();
      else unlisten = fn;
    }).catch(error => console.warn('[pet] prefs 监听失败:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Sync mood ref
  useEffect(() => { moodRef.current = snapshot.mood; }, [snapshot.mood]);

  // Trigger speech animation on each forwarded turn (cc-tasks/14 §D.4 — replaces the old
  // snapshot.latestAssistantText path now that the pet bubble is driven by pet://turn)
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listenPetTurn(turn => {
      if (disposed || turn.kind !== 'channel_message') return;
      onNewSpeech(turn.content);
    }).then(fn => {
      if (disposed) fn();
      else unlisten = fn;
    }).catch(error => console.warn('[pet] turn 监听失败:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onNewSpeech]);

  // Apply zoom changes to existing camera, keeping the head anchored near the top
  useEffect(() => { applyFraming(zoom); }, [zoom, applyFraming]);

  // Main scene setup — runs once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const { clientWidth: w, clientHeight: h } = mount;
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Orthographic camera — front-facing, locked, no rotation
    const aspect = h > 0 ? w / h : 1;
    const hh = FRUSTUM_HH;
    const camera = new THREE.OrthographicCamera(
      -hh * aspect, hh * aspect,
      hh, -hh,
      0.1, 100,
    );
    camera.position.set(0, CAM_Y, CAM_DIST);
    camera.lookAt(0, CAM_Y, 0);
    camera.zoom = Math.max(0.3, Math.min(4, getUIPref<number>(PET_MODEL3D_ZOOM_KEY, 1)));
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff5e0, 0.9);
    key.position.set(2, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(0.5, 1.6, 2);
    scene.add(fill);

    // Character group from hook
    scene.add(charGroup);

    const clock = new THREE.Clock();
    let rafId = 0;
    let disposed = false;

    const resizeObs = new ResizeObserver(() => {
      const { clientWidth: nw, clientHeight: nh } = mount;
      const newAspect = nh > 0 ? nw / nh : 1;
      camera.left   = -FRUSTUM_HH * newAspect;
      camera.right  =  FRUSTUM_HH * newAspect;
      camera.top    =  FRUSTUM_HH;
      camera.bottom = -FRUSTUM_HH;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    resizeObs.observe(mount);

    function tick() {
      rafId = requestAnimationFrame(tick);
      if (document.hidden) return;

      const t   = clock.getElapsedTime();
      const now = performance.now();
      animate(t, now, moodRef.current, getActiveDirective(now));
      renderer.render(scene, camera);
    }
    clock.getDelta();
    tick();

    return () => {
      disposed = true;
      void disposed;
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      cameraRef.current = null;

      scene.remove(charGroup);
      scene.traverse((obj) => {
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

      renderer.dispose();
      try { renderer.forceContextLoss(); } catch {}
      renderer.domElement.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', background: 'transparent' }}
    />
  );
}
