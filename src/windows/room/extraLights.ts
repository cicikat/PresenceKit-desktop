// Light helpers for the room editor (work order 3): the user-added "extra" lights, and the
// edit-mode-only visual aids (direction/cone helpers + click/drag proxies). Kept out of
// useRoomScene.ts on purpose; the hook only calls into this module.
import * as THREE from 'three';
import type { ExtraLightCfg, ExtraLightType } from '../../shared/room/roomSettings';

const PROXY_COLORS: Record<ExtraLightType, number> = {
  directional: 0xff9944,
  point: 0x66ee88,
  spot: 0xee66cc,
};

/** CSS color used for a light's row dot in the panel; matches its proxy sphere. */
export function proxyColorCss(type: ExtraLightType): string {
  return `#${PROXY_COLORS[type].toString(16).padStart(6, '0')}`;
}

type HelperLike = THREE.Object3D & { update?: () => void; dispose?: () => void };

function makeHelper(light: THREE.Light, color: number): HelperLike {
  if ((light as THREE.PointLight).isPointLight) return new THREE.PointLightHelper(light as THREE.PointLight, 0.1, color);
  if ((light as THREE.SpotLight).isSpotLight) return new THREE.SpotLightHelper(light as THREE.SpotLight, color);
  return new THREE.DirectionalLightHelper(light as THREE.DirectionalLight, 0.4, color);
}

/**
 * Direction/cone helpers. They are only in the scene while editing, and `update()` must run
 * every frame in that state (three requires it, or the direction line stops following the
 * light). Helpers are display-only: they can't be picked or attached to the gizmo, which is
 * why each light also has a proxy sphere.
 */
export class LightHelperSet {
  private entries = new Map<string, { light: THREE.Light; color: number; helper: HelperLike | null }>();
  private active = false;

  constructor(private scene: THREE.Scene) {}

  track(id: string, light: THREE.Light, color: number): void {
    this.untrack(id);
    const entry = { light, color, helper: null as HelperLike | null };
    this.entries.set(id, entry);
    if (this.active) this.show(entry);
  }

  untrack(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.hide(entry);
    this.entries.delete(id);
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.entries.forEach(entry => (active ? this.show(entry) : this.hide(entry)));
  }

  update(): void {
    if (!this.active) return;
    this.entries.forEach(({ helper, light }) => {
      if (helper) { helper.visible = light.visible; helper.update?.(); }
    });
  }

  private show(entry: { light: THREE.Light; color: number; helper: HelperLike | null }): void {
    if (entry.helper) return;
    entry.helper = makeHelper(entry.light, entry.color);
    this.scene.add(entry.helper);
  }

  private hide(entry: { helper: HelperLike | null }): void {
    if (!entry.helper) return;
    this.scene.remove(entry.helper);
    entry.helper.dispose?.();
    entry.helper = null;
  }

  dispose(): void {
    this.entries.forEach(entry => this.hide(entry));
    this.entries.clear();
  }
}

interface ExtraEntry {
  type: ExtraLightType;
  light: THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;
  proxy: THREE.Mesh;
}

export interface ExtraSyncOptions {
  shadows: boolean;
  /** False while dragging in edit mode: position is owned by the proxy then. */
  writePos: boolean;
}

export class ExtraLightRig {
  private entries = new Map<string, ExtraEntry>();
  private geo = new THREE.SphereGeometry(0.06, 8, 8);
  private placement = false;

  constructor(
    private scene: THREE.Scene,
    private helpers: LightHelperSet,
    private charLayer: number,
  ) {}

  /** Proxy spheres for raycast picking; each carries its id in userData.__extraId. */
  get proxies(): THREE.Mesh[] { return [...this.entries.values()].map(e => e.proxy); }

  has(id: string): boolean { return this.entries.has(id); }
  getLight(id: string): THREE.Light | null { return this.entries.get(id)?.light ?? null; }
  getProxy(id: string): THREE.Mesh | null { return this.entries.get(id)?.proxy ?? null; }
  get lights(): THREE.Light[] { return [...this.entries.values()].map(e => e.light); }

  sync(cfgs: ExtraLightCfg[], opts: ExtraSyncOptions): void {
    const wanted = new Set(cfgs.map(c => c.id));
    for (const id of [...this.entries.keys()]) {
      if (!wanted.has(id)) this.remove(id);
    }
    for (const cfg of cfgs) {
      let entry = this.entries.get(cfg.id);
      if (entry && entry.type !== cfg.type) {
        this.remove(cfg.id);
        entry = undefined;
      }
      const created = !entry;
      if (!entry) entry = this.create(cfg);
      this.apply(entry, cfg, { ...opts, writePos: opts.writePos || created });
    }
  }

  setPlacement(on: boolean): void {
    this.placement = on;
    this.entries.forEach(e => { e.proxy.visible = on; });
  }

  private create(cfg: ExtraLightCfg): ExtraEntry {
    const light = cfg.type === 'point' ? new THREE.PointLight()
      : cfg.type === 'spot' ? new THREE.SpotLight()
      : new THREE.DirectionalLight();
    this.scene.add(light);
    const mat = new THREE.MeshBasicMaterial({ color: PROXY_COLORS[cfg.type], transparent: true, opacity: 0.75, depthTest: false });
    const proxy = new THREE.Mesh(this.geo, mat);
    proxy.renderOrder = 999;
    proxy.visible = this.placement;
    proxy.userData.__extraId = cfg.id;
    this.scene.add(proxy);
    const entry: ExtraEntry = { type: cfg.type, light, proxy };
    this.entries.set(cfg.id, entry);
    this.helpers.track(`extra:${cfg.id}`, light, PROXY_COLORS[cfg.type]);
    return entry;
  }

  private apply(entry: ExtraEntry, cfg: ExtraLightCfg, opts: ExtraSyncOptions): void {
    const { light } = entry;
    light.visible = cfg.on;
    light.color.set(cfg.color);
    light.intensity = cfg.intensity;
    if (cfg.charOnly) light.layers.set(this.charLayer);
    else light.layers.set(0);
    if (opts.writePos && cfg.pos) {
      light.position.set(...cfg.pos);
      entry.proxy.position.set(...cfg.pos);
    }
    if ((light as THREE.PointLight).isPointLight || (light as THREE.SpotLight).isSpotLight) {
      (light as THREE.PointLight | THREE.SpotLight).distance = cfg.distance ?? 0;
    }
    if ((light as THREE.SpotLight).isSpotLight) {
      const spot = light as THREE.SpotLight;
      spot.angle = THREE.MathUtils.degToRad(cfg.angleDeg ?? 45);
      spot.penumbra = cfg.penumbra ?? 0.3;
    }
    // Point-light shadows need six passes per light; only directional/spot cast shadows.
    light.castShadow = opts.shadows && cfg.type !== 'point';
    (entry.proxy.material as THREE.MeshBasicMaterial).color.set(PROXY_COLORS[cfg.type]);
  }

  private remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.helpers.untrack(`extra:${id}`);
    this.scene.remove(entry.light);
    entry.light.dispose?.();
    this.scene.remove(entry.proxy);
    (entry.proxy.material as THREE.Material).dispose();
    this.entries.delete(id);
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
    this.geo.dispose();
  }
}

/**
 * Sizes a directional light's orthographic shadow frustum to cover `bounds`. The light's
 * target stays at the origin, so the frustum is a sphere around the origin that reaches the
 * farthest bounds corner — without this the default +-5 frustum clips or blurs a large scene.
 */
export function fitDirectionalShadow(light: THREE.DirectionalLight, bounds: THREE.Box3): void {
  if (bounds.isEmpty()) return;
  const corners = [bounds.min, bounds.max];
  let radius = 1;
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) {
    const p = new THREE.Vector3(corners[x].x, corners[y].y, corners[z].z);
    radius = Math.max(radius, p.length());
  }
  const cam = light.shadow.camera;
  cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
  cam.near = 0.1;
  cam.far = light.position.length() + radius;
  cam.updateProjectionMatrix();
  light.shadow.mapSize.set(2048, 2048);
}
