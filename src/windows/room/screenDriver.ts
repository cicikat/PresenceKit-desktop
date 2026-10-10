import * as THREE from 'three';
import { invoke } from '@tauri-apps/api/core';
import { parseScreenConfig, screenResources, screenClipId, screenFrame, type ScreenActivity, type ScreenConfig } from './screenConfig';

type ScreenMaterial = THREE.Material & { map: THREE.Texture | null };
export function bindScreen(root: THREE.Object3D, config: ScreenConfig): { mesh: THREE.Mesh; slot: number; original: ScreenMaterial } {
  const found: { mesh: THREE.Mesh; slot: number; original: ScreenMaterial }[] = [];
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.name !== config.target.node) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat, slot) => {
      if (mat.name === config.target.materialName && (config.target.slot === undefined || config.target.slot === slot)) {
        if (!mesh.geometry.getAttribute('uv') || !('map' in mat)) throw new Error('screen requires UV and a mapped material');
        found.push({ mesh, slot, original: mat as ScreenMaterial });
      }
    });
  });
  if (found.length !== 1) throw new Error('screen binding must match exactly one material slot');
  return found[0];
}
export class ScreenDriver {
  private readonly binding: ReturnType<typeof bindScreen>;
  private readonly material: ScreenMaterial;
  private active = ''; private started = 0; private previousMap: THREE.Texture | null = null;
  private canvas: HTMLCanvasElement | null = null; private canvasTexture: THREE.CanvasTexture | null = null;
  private lastDraw = -1; private dead = false;
  readonly status = { clip: '', fallback: false, decodedBytes: 0 };
  constructor(readonly config: ScreenConfig, root: THREE.Object3D, private textures: Record<string, THREE.Texture>, bytes: number) {
    this.binding = bindScreen(root, config);
    this.material = this.binding.original.clone() as ScreenMaterial;
    this.material.onBeforeCompile = this.binding.original.onBeforeCompile;
    this.material.customProgramCacheKey = this.binding.original.customProgramCacheKey;
    this.status.decodedBytes = bytes;
    const { mesh, slot } = this.binding;
    if (Array.isArray(mesh.material)) { mesh.material = mesh.material.slice(); mesh.material[slot] = this.material; }
    else mesh.material = this.material;
  }
  update(now: number, expression: string, activity: ScreenActivity): void {
    if (this.dead) return;
    const id = screenClipId(this.config, expression, activity);
    if (id !== this.active) { this.active = id; this.started = now; this.lastDraw = -1; }
    this.status.clip = id;
    this.status.fallback = !this.config.mappings.activityStates[activity] && !this.config.mappings.expressions[expression];
    const clip = this.config.clips[id], neutral = this.config.clips[this.config.mappings.expressions.neutral];
    let texture: THREE.Texture | null = null;
    if (clip.type === 'image') texture = this.textures[clip.uri];
    else if (clip.type === 'sequence') {
      const uri = screenFrame(clip, now - this.started);
      texture = uri ? this.textures[uri] : neutral.type === 'image' ? this.textures[neutral.uri] : null;
    } else {
      if (!this.canvas) {
        this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = 512;
        this.canvasTexture = new THREE.CanvasTexture(this.canvas); this.canvasTexture.colorSpace = THREE.SRGBColorSpace;
        this.canvasTexture.flipY = this.config.flipY; this.canvasTexture.generateMipmaps = false; this.canvasTexture.minFilter = THREE.LinearFilter;
      }
      const ctx = this.canvas.getContext('2d'), frame = Math.floor((now - this.started) / 80);
      if (!ctx) {
        const fallback = this.config.clips[clip.fallback]; texture = fallback.type === 'image' ? this.textures[fallback.uri] : null;
      } else {
        if (frame !== this.lastDraw) {
          const base = this.config.clips[clip.base];
          ctx.clearRect(0, 0, 512, 512);
          if (base.type === 'image') ctx.drawImage(this.textures[base.uri].image as CanvasImageSource, 0, 0, 512, 512);
          const t = (now - this.started) / 1000;
          ctx.fillStyle = '#6fdbff';
          if (clip.preset === 'thinkingDots') {
            for (let i = 0; i < 3; i++) { ctx.globalAlpha = (frame % 9) / 3 >= i ? 1 : 0.25; ctx.fillRect(185 + i * 48, 170, 24, 24); }
          } else if (clip.preset === 'spectrumBars') {
            // Simulated rhythm, not a measured audio spectrum.
            for (let i = 0; i < 9; i++) { const h = 20 + (0.5 + 0.5 * Math.sin(t * 9 + i * 1.8)) * 100; ctx.fillRect(130 + i * 28, 235 - h / 2, 12, h); }
          } else { ctx.globalAlpha = 0.08 + (0.5 + 0.5 * Math.sin(t * 3)) * 0.12; ctx.fillRect(0, 0, 512, 512); }
          ctx.globalAlpha = 1; this.canvasTexture!.needsUpdate = true; this.lastDraw = frame;
        }
        texture = this.canvasTexture;
      }
    }
    if (texture && texture !== this.previousMap) {
      this.material.map = texture; this.material.needsUpdate = this.previousMap === null; this.previousMap = texture;
    }
  }
  dispose(): void {
    if (this.dead) return; this.dead = true;
    const { mesh, slot, original } = this.binding;
    if (Array.isArray(mesh.material)) { if (mesh.material[slot] === this.material) mesh.material[slot] = original; }
    else if (mesh.material === this.material) mesh.material = original;
    this.material.dispose(); Object.values(this.textures).forEach(t => t.dispose()); this.canvasTexture?.dispose();
    this.textures = {}; this.canvas = null;
  }
}
export async function loadScreenDriver(fileName: string, root: THREE.Object3D, isCurrent: () => boolean): Promise<ScreenDriver | null> {
  const textures: Record<string, THREE.Texture> = {};
  try {
    const text = await invoke<string | null>('read_room_screen_config', { fileName });
    if (!text || !isCurrent()) return null;
    const config = parseScreenConfig(JSON.parse(text)); bindScreen(root, config);
    let bytes = 512 * 512 * 4;
    const loader = new THREE.TextureLoader();
    for (const mapName of screenResources(config)) {
      if (!isCurrent()) throw new Error('screen load cancelled');
      const url = await invoke<string | null>('read_room_screen_map', { fileName, mapName });
      if (!url) throw new Error(`missing screen image: ${mapName}`);
      // Check PNG IHDR before decoding to avoid oversized compressed resources.
      const header = atob(url.slice(url.indexOf(',') + 1)).slice(0, 24);
      const width = [...header.slice(16,20)].reduce((n,c) => n * 256 + c.charCodeAt(0), 0);
      const height = [...header.slice(20,24)].reduce((n,c) => n * 256 + c.charCodeAt(0), 0);
      if (width < 16 || height < 16 || width > 2048 || height > 2048 || (bytes += width * height * 4) > 64 * 1024 * 1024) throw new Error('screen decoded texture budget exceeded');
      const texture = await loader.loadAsync(url); textures[mapName] = texture;
      texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = config.flipY; texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
    }
    if (!isCurrent()) throw new Error('screen load cancelled');
    return new ScreenDriver(config, root, textures, bytes);
  } catch (error) {
    Object.values(textures).forEach(t => t.dispose());
    if (isCurrent()) console.warn('[screen] original material retained:', error);
    return null;
  }
}
