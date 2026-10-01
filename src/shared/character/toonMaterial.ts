import * as THREE from 'three';
import {
  buildToonRamp, resolveToonParams,
  type MaterialsConfig, type ToonParams,
} from './materialsConfig';

const ORIGINALS = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
type SourceMat = THREE.Material & {
  color?: THREE.Color; map?: THREE.Texture | null; normalMap?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null; emissive?: THREE.Color; emissiveMap?: THREE.Texture | null;
};

export interface BindingReport {
  id: string;
  status: 'applied' | 'missing-mesh' | 'missing-slot' | 'stale-name' | 'unsupported-source';
}

/** Lazily-bound uniforms so rim parameters can change without recompiling the shader. */
interface RimUniforms { rimColor: { value: THREE.Color }; rimStrength: { value: number }; rimPower: { value: number } }

function createToonFrom(source: SourceMat, params: ToonParams): THREE.MeshToonMaterial {
  const base = source.color ? [source.color.r, source.color.g, source.color.b] as [number, number, number] : [1, 1, 1] as [number, number, number];
  const ramp = new THREE.DataTexture(buildToonRamp(params, base), 64, 1, THREE.RGBAFormat);
  ramp.colorSpace = THREE.NoColorSpace;
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;

  const toon = new THREE.MeshToonMaterial({
    name: source.name, gradientMap: ramp,
    // Preserve what keeps skinned/transparent/double-sided parts correct.
    side: source.side, transparent: source.transparent, opacity: source.opacity,
    alphaTest: source.alphaTest, depthWrite: source.depthWrite, depthTest: source.depthTest,
    map: source.map ?? null, normalMap: source.normalMap ?? null, alphaMap: source.alphaMap ?? null,
    emissiveMap: source.emissiveMap ?? null,
  });
  if (source.emissive) toon.emissive.copy(source.emissive);
  if (params.baseColor) toon.color.set(params.baseColor);
  else if (source.color) toon.color.copy(source.color);

  const rim: RimUniforms = {
    rimColor: { value: new THREE.Color(params.rimColor) },
    rimStrength: { value: params.rimStrength }, rimPower: { value: params.rimPower },
  };
  toon.userData.toonRim = rim;
  toon.customProgramCacheKey = () => 'pt-toon-rim-v1';
  toon.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, rim);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;')
      .replace('#include <opaque_fragment>', `
        float ptFresnel = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), rimPower);
        outgoingLight += rimColor * rimStrength * ptFresnel;
        #include <opaque_fragment>`);
  };
  return toon;
}

/** Re-parameterise an existing toon material in place: no shader recompile, no re-bake. */
export function updateToonParams(material: THREE.MeshToonMaterial, params: ToonParams): void {
  const rim = material.userData.toonRim as RimUniforms | undefined;
  if (!rim) return;
  rim.rimColor.value.set(params.rimColor);
  rim.rimStrength.value = params.rimStrength;
  rim.rimPower.value = params.rimPower;
  if (params.baseColor) material.color.set(params.baseColor);
  const ramp = material.gradientMap as THREE.DataTexture | null;
  if (ramp) {
    const base: [number, number, number] = [material.color.r, material.color.g, material.color.b];
    ramp.image.data.set(buildToonRamp(params, base));
    ramp.needsUpdate = true;
  }
}

export interface ApplyOptions {
  look?: string;
  /** Local per-asset overrides keyed by binding id; never written back to the package. */
  local?: Record<string, Partial<ToonParams>>;
}

/**
 * Swap bound slots to Toon materials. Targets are matched by mesh node name + slot index, and a
 * recorded materialName that no longer matches marks the binding stale rather than applying it.
 */
export function applyToonBindings(root: THREE.Object3D, config: MaterialsConfig, options: ApplyOptions = {}): BindingReport[] {
  const meshes = new Map<string, THREE.Mesh[]>();
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const list = meshes.get(obj.name) ?? [];
      list.push(obj as THREE.Mesh);
      meshes.set(obj.name, list);
    }
  });
  const look = options.look ? config.looks[options.look] : undefined;
  return config.bindings.map<BindingReport>((binding) => {
    const candidates = meshes.get(binding.mesh);
    if (!candidates?.length) return { id: binding.id, status: 'missing-mesh' };
    let status: BindingReport['status'] = 'missing-slot';
    for (const mesh of candidates) {
      const slots = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const current = slots[binding.slot];
      if (!current) continue;
      if (binding.materialName !== undefined && current.name !== binding.materialName) { status = 'stale-name'; continue; }
      const params = resolveToonParams(binding, look?.[binding.id], options.local?.[binding.id]);
      if ((current as THREE.MeshToonMaterial).isMeshToonMaterial) {
        updateToonParams(current as THREE.MeshToonMaterial, params);
        status = 'applied';
        continue;
      }
      if (!(current as SourceMat).color) { status = 'unsupported-source'; continue; }
      if (!ORIGINALS.has(mesh)) ORIGINALS.set(mesh, Array.isArray(mesh.material) ? [...mesh.material] : mesh.material);
      const toon = createToonFrom(current as SourceMat, params);
      if (Array.isArray(mesh.material)) mesh.material[binding.slot] = toon; else mesh.material = toon;
      status = 'applied';
    }
    return { id: binding.id, status };
  });
}

/** Restore the model's own materials (e.g. when the user clears the Toon config). */
export function revertToonBindings(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const original = mesh.isMesh ? ORIGINALS.get(mesh) : undefined;
    if (!original) return;
    const toons = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    toons.forEach((m) => { if ((m as THREE.MeshToonMaterial).isMeshToonMaterial) { (m as THREE.MeshToonMaterial).gradientMap?.dispose(); m.dispose(); } });
    mesh.material = original;
    ORIGINALS.delete(mesh);
  });
}
