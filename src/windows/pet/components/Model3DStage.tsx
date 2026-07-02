import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PetRendererProps } from '../../../shared/pet/petRenderer';
import { useCharacterRig } from '../../../shared/room3d/useCharacterRig';
import { loadRoomSettings, subscribeRoomSettings } from '../../../shared/room/roomSettings';
import { getUIPref, onUIPrefChange } from '../../../shared/uiPreferences';
import { getActiveDirective } from '../../room/avatarDirective';
import type { Mood } from '../../../shared/state/store';

const PET_MODEL3D_ZOOM_KEY = 'pet.model3d.zoom';

// Camera looks at upper-body center of a 1.6-unit character
const CAM_Y = 0.9;
const CAM_DIST = 5;
const FRUSTUM_HH = 0.70; // half-height at zoom=1

export function Model3DStage({ snapshot }: PetRendererProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState(() => loadRoomSettings());
  const [zoom, setZoom] = useState(() => getUIPref<number>(PET_MODEL3D_ZOOM_KEY, 1));

  const moodRef = useRef<Mood>(snapshot.mood);
  const prevTextUpdatedAt = useRef(0);

  const characterUrl = `/room/character/${encodeURIComponent(settings.characterFile)}`;
  const { charGroup, animate, onNewSpeech } = useCharacterRig(characterUrl, settings.boneMap);

  // Subscribe to room settings (for character file / boneMap changes)
  useEffect(() => subscribeRoomSettings(setSettings), []);

  // Subscribe to zoom pref changes (triggered from ChatWindow slider)
  useEffect(() => {
    return onUIPrefChange(key => {
      if (key === PET_MODEL3D_ZOOM_KEY) setZoom(getUIPref<number>(PET_MODEL3D_ZOOM_KEY, 1));
    });
  }, []);

  // Sync mood ref
  useEffect(() => { moodRef.current = snapshot.mood; }, [snapshot.mood]);

  // Trigger speech animation when assistant text updates
  useEffect(() => {
    if (!snapshot.latestAssistantText) return;
    if (snapshot.updatedAt === prevTextUpdatedAt.current) return;
    prevTextUpdatedAt.current = snapshot.updatedAt;
    onNewSpeech(snapshot.latestAssistantText);
  }, [snapshot.latestAssistantText, snapshot.updatedAt, onNewSpeech]);

  // Camera ref so zoom effect can update it
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  // Apply zoom changes to existing camera
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    cam.zoom = Math.max(0.3, Math.min(4, zoom));
    cam.updateProjectionMatrix();
  }, [zoom]);

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
