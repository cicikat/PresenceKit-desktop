import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const TV_TOON_LOOK = { outline: 1.2, bloom: 0.32, rim: 0.16 };
export function supportsRoomToon(file: string): boolean {
  return /^TV_Character_Rigged_v0[23]\.glb$/i.test(file);
}
export function isToonGlow(name: string): boolean {
  return ['TV_Screen_Expressions_Screen', 'TV_Details_Cobalt',
    'Cape_Accessories_Cobalt', 'Cape_Accessories_Violet'].includes(name);
}
type Source = THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null; alphaMap?: THREE.Texture | null };

/** Temporary render-time swaps: screen driver, source materials and animation keep ownership. */
export class RoomToonValidation {
  private base: EffectComposer;
  private glow: EffectComposer;
  private outline: OutlinePass;
  private bloom: UnrealBloomPass;
  private combine: ShaderPass;
  private cache = new Map<THREE.Material, THREE.Material>();
  private backdropCache = new Map<THREE.Material, THREE.Material>();
  private black = new THREE.MeshBasicMaterial({ color: 0 });
  private ramp = new THREE.DataTexture(new Uint8Array([135, 135, 135, 255, 220, 220, 220, 255, 255, 255, 255, 255]), 3, 1);
  private background: THREE.DataTexture;
  private rig = new THREE.Group();
  private contact: THREE.Mesh;
  private contactMap: THREE.DataTexture;
  private disposed = false;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera, width: number, height: number) {
    this.ramp.minFilter = this.ramp.magFilter = THREE.NearestFilter;
    this.ramp.needsUpdate = true;
    const pixels = new Uint8Array(64 * 4);
    const top = new THREE.Color('#26233e'), bottom = new THREE.Color('#a1bbd0');
    for (let y = 0; y < 64; y++) {
      const c = bottom.clone().lerp(top, y / 63).convertLinearToSRGB();
      pixels.set([c.r * 255, c.g * 255, c.b * 255, 255], y * 4);
    }
    this.background = new THREE.DataTexture(pixels, 1, 64);
    this.background.colorSpace = THREE.SRGBColorSpace;
    this.background.magFilter = THREE.LinearFilter; this.background.needsUpdate = true;
    const ambient = new THREE.AmbientLight('#e8e7ff', 1.15);
    const key = new THREE.DirectionalLight('#fff6ee', 1.65); key.position.set(-3, 5, 4);
    this.rig.add(ambient, key); this.rig.visible = false; scene.add(this.rig);
    // Graphic atmosphere panels, unlit and deliberately below the bloom whitelist.
    for (const x of [-0.30, 0.30]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 2.2),
        new THREE.MeshBasicMaterial({ color: '#abcde8', toneMapped: false }));
      panel.position.set(x, 1.3, -0.65); this.rig.add(panel);
    }
    const shadow = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      shadow.set([32, 28, 55, Math.max(0, 1 - r) ** 2 * 85], (y * 64 + x) * 4);
    }
    this.contactMap = new THREE.DataTexture(shadow, 64, 64); this.contactMap.needsUpdate = true;
    this.contactMap.magFilter = THREE.LinearFilter;
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: this.contactMap, transparent: true, depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -1, toneMapped: false,
    }));
    this.contact.rotation.x = -Math.PI / 2; this.contact.visible = false; scene.add(this.contact);
    this.glow = new EffectComposer(renderer); this.glow.renderToScreen = false;
    this.glow.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), TV_TOON_LOOK.bloom, 0.35, 0.35);
    this.glow.addPass(this.bloom);
    this.base = new EffectComposer(renderer); this.base.addPass(new RenderPass(scene, camera));
    this.outline = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
    this.outline.edgeStrength = 2; this.outline.edgeThickness = TV_TOON_LOOK.outline;
    this.outline.visibleEdgeColor.set('#39314e'); this.outline.hiddenEdgeColor.set('#000000');
    this.base.addPass(this.outline);
    this.combine = new ShaderPass({ uniforms: { tDiffuse: { value: null }, glow: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform sampler2D glow; varying vec2 vUv; void main(){vec4 b=texture2D(tDiffuse,vUv); gl_FragColor=vec4(b.rgb+texture2D(glow,vUv).rgb,b.a);}',
    });
    this.base.addPass(this.combine); this.base.addPass(new OutputPass()); this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    this.base.setSize(width, height); this.glow.setSize(width, height);
  }

  private material(source: Source, character: boolean): THREE.Material {
    const cache = character ? this.cache : this.backdropCache;
    let material = cache.get(source);
    if (!material) {
      const common = { name: source.name, map: source.map ?? null, alphaMap: source.alphaMap ?? null,
        color: source.color?.clone() ?? new THREE.Color('white'), side: source.side,
        transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest,
        depthWrite: source.depthWrite, depthTest: source.depthTest };
      if (!character || source.name === 'TV_Screen_Expressions_Screen') {
        const basic = new THREE.MeshBasicMaterial(common);
        if (!character) {
          basic.color.lerp(new THREE.Color('#b5bdde'), 0.25);
          basic.customProgramCacheKey = () => 'room-tv-stage-v1';
          basic.onBeforeCompile = shader => {
            shader.vertexShader = 'varying float tvStageHeight;\n' + shader.vertexShader.replace(
              '#include <project_vertex>', 'tvStageHeight=(modelMatrix*vec4(transformed,1.0)).y;\n#include <project_vertex>');
            shader.fragmentShader = 'varying float tvStageHeight;\n' + shader.fragmentShader.replace(
              '#include <opaque_fragment>',
              'outgoingLight *= mix(vec3(0.55,0.65,0.83),vec3(0.18,0.14,0.29),smoothstep(0.0,3.2,tvStageHeight));\n#include <opaque_fragment>');
          };
        }
        else basic.color.multiplyScalar(1.65);
        material = basic;
      } else {
        const toon = new THREE.MeshToonMaterial({ ...common, gradientMap: this.ramp });
        if (toon.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.06) toon.color.lerp(new THREE.Color('#33314e'), 0.22);
        // MToon-inspired tinted shade floor and view-dependent rim; no copied pixiv shader.
        toon.emissive.copy(toon.color).multiplyScalar(0.12);
        if (isToonGlow(source.name)) toon.emissive.copy(toon.color).multiplyScalar(1.1);
        toon.customProgramCacheKey = () => 'room-tv-toon-validation-v1';
        toon.onBeforeCompile = shader => {
          shader.uniforms.tvRim = { value: TV_TOON_LOOK.rim };
          shader.fragmentShader = 'uniform float tvRim;\n' + shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            'outgoingLight += vec3(0.55,0.68,1.0)*tvRim*pow(1.0-max(dot(normal,normalize(vViewPosition)),0.0),3.0);\n#include <opaque_fragment>');
        };
        material = toon;
      }
      cache.set(source, material);
    }
    // Screen textures change each frame; never retain a stale clone of its map.
    const mapped = material as THREE.MeshBasicMaterial;
    if (!!mapped.map !== !!source.map) mapped.needsUpdate = true;
    mapped.map = source.map ?? null;
    return material;
  }

  render(character: THREE.Object3D, room: THREE.Object3D): void {
    if (this.disposed) return;
    const meshes: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[]; cast: boolean; receive: boolean; char: boolean }[] = [];
    const lights: { light: THREE.Light; visible: boolean }[] = [];
    const charSet = new Set<THREE.Object3D>(); character.traverse(o => charSet.add(o));
    const roomSet = new Set<THREE.Object3D>(); room.traverse(o => roomSet.add(o));
    const live = new Set<THREE.Material>();
    const background = this.scene.background, fog = this.scene.fog;
    const tone = this.renderer.toneMapping, exposure = this.renderer.toneMappingExposure;
    const shadows = this.renderer.shadowMap.enabled;
    try {
      this.scene.traverse(o => {
        if ((o as THREE.Light).isLight && o.parent !== this.rig) {
          lights.push({ light: o as THREE.Light, visible: o.visible }); o.visible = false;
        }
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh === this.contact) return;
        const char = charSet.has(mesh);
        meshes.push({ mesh, original: mesh.material, cast: mesh.castShadow, receive: mesh.receiveShadow, char });
        mesh.castShadow = mesh.receiveShadow = false;
        if (char || roomSet.has(mesh)) {
          const swap = (m: THREE.Material) => { live.add(m); return this.material(m, char); };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
        }
      });
      this.rig.visible = true; this.scene.background = this.background; this.scene.fog = null;
      this.renderer.shadowMap.enabled = false;
      this.renderer.toneMapping = THREE.NeutralToneMapping; this.renderer.toneMappingExposure = 1;
      const box = new THREE.Box3().setFromObject(character);
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      this.contact.position.set(center.x, box.min.y + 0.006, center.z);
      this.contact.scale.set(Math.max(size.x, 0.3), Math.max(size.z, 0.3), 1);
      this.contact.visible = false;
      const styled = meshes.map(({ mesh }) => mesh.material);
      meshes.forEach(({ mesh, char }) => {
        const mask = (m: THREE.Material) => char && isToonGlow(m.name) ? m : this.black;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(mask) : mask(mesh.material);
      });
      this.scene.background = new THREE.Color(0);
      this.glow.render();
      meshes.forEach(({ mesh }, i) => { mesh.material = styled[i]; });
      this.scene.background = this.background; this.contact.visible = true;
      this.outline.selectedObjects = [character];
      // UnrealBloomPass output includes the masked source; add only its blurred texture.
      this.combine.uniforms.glow.value = this.bloom.renderTargetsHorizontal[0].texture;
      this.base.render();
    } finally {
      meshes.forEach(({ mesh, original, cast, receive }) => { mesh.material = original; mesh.castShadow = cast; mesh.receiveShadow = receive; });
      lights.forEach(({ light, visible }) => { light.visible = visible; });
      this.rig.visible = this.contact.visible = false;
      this.scene.background = background; this.scene.fog = fog;
      this.renderer.shadowMap.enabled = shadows;
      this.renderer.toneMapping = tone; this.renderer.toneMappingExposure = exposure;
      for (const cache of [this.cache, this.backdropCache]) for (const [source, mat] of cache) {
        if (!live.has(source)) { mat.dispose(); cache.delete(source); }
      }
    }
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const c of [this.base, this.glow]) { c.passes.forEach(p => p.dispose()); c.dispose(); }
    for (const cache of [this.cache, this.backdropCache]) { cache.forEach(m => m.dispose()); cache.clear(); }
    this.black.dispose(); this.ramp.dispose(); this.background.dispose(); this.contactMap.dispose();
    this.contact.geometry.dispose(); (this.contact.material as THREE.Material).dispose();
    this.scene.remove(this.rig, this.contact);
    this.rig.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) {
      mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
    } });
  }
}
