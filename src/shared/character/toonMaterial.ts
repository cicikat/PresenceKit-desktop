import * as THREE from 'three';
import { type MaterialsConfig, type ToonParams, resolveToonParams } from './materialsConfig';

const ORIGINALS = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
type SourceMat = THREE.Material & {
  color?: THREE.Color; map?: THREE.Texture | null; normalMap?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null; emissive?: THREE.Color; emissiveMap?: THREE.Texture | null;
};

export interface BindingReport {
  id: string;
  status: 'applied' | 'missing-mesh' | 'missing-slot' | 'stale-name' | 'unsupported-source';
}

/** Uniforms updated in place so parameter changes never recompile the shader. */
interface ToonUniforms {
  ptShadeColor: { value: THREE.Color };
  ptEdgeLow: { value: number }; ptEdgeHigh: { value: number }; ptTransition: { value: number };
  ptRimColor: { value: THREE.Color }; ptRimStrength: { value: number }; ptRimPower: { value: number };
  ptHairSheen: { value: number };
  ptShadeMap?: { value: THREE.Texture };
  ptTransitionMap?: { value: THREE.Texture };
}

const GLSL_PARS = /* glsl */`
varying vec3 vViewPosition;
uniform vec3 ptShadeColor;
uniform float ptEdgeLow;
uniform float ptEdgeHigh;
uniform float ptTransition;
uniform vec3 ptRimColor;
uniform float ptRimStrength;
uniform float ptRimPower;
uniform float ptHairSheen;
#ifdef PT_SHADE_MAP
uniform sampler2D ptShadeMap;
#endif
#ifdef PT_TRANSITION_MAP
uniform sampler2D ptTransitionMap;
#endif
struct ToonMaterial { vec3 diffuseColor; };
// Accumulated by the scene's real lights, resolved once after the light loop.
float ptLit = 0.0;
vec3 ptLightSum = vec3( 0.0 );
vec3 ptAmbient = vec3( 0.0 );
float ptSheen = 0.0;

void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	float strength = min( dot( directLight.color, vec3( 0.2126, 0.7152, 0.0722 ) ) / PI, 1.0 );
	float t = smoothstep( ptEdgeLow, max( ptEdgeHigh, ptEdgeLow + 1e-4 ), dot( geometryNormal, directLight.direction ) );
	ptLit += t * strength;
	ptLightSum += directLight.color;
	vec3 h = normalize( directLight.direction + geometryViewDir );
	ptSheen += pow( max( dot( h, geometryNormal ), 0.0 ), 12.0 ) * strength;
}

void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	ptAmbient += irradiance;
}

#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

/** Mirrors the Blender group V006_Clean_Toon: shade/base mix, transition bell, rim and hair sheen. */
const GLSL_RESOLVE = /* glsl */`
#include <lights_fragment_end>
{
	vec3 ptBase = diffuseColor.rgb;
	#if defined( PT_SHADE_MAP ) && defined( USE_MAP )
		vec3 ptShade = texture2D( ptShadeMap, vMapUv ).rgb;
	#else
		vec3 ptShade = ptBase * ptShadeColor;
	#endif
	// A light adds to the lit weight in proportion to its brightness, so a shadowed light adds none.
	float ptT = clamp( ptLit, 0.0, 1.0 );
	vec3 ptCol = mix( ptShade, ptBase, ptT );
	#if defined( PT_TRANSITION_MAP ) && defined( USE_MAP )
		float ptBell = smoothstep( 0.0, 1.0, 2.0 * min( ptT, 1.0 - ptT ) );
		ptCol = mix( ptCol, texture2D( ptTransitionMap, vMapUv ).rgb, clamp( ptBell * ptTransition, 0.0, 1.0 ) );
	#endif
	ptCol *= clamp( ( ptLightSum + ptAmbient ) / PI, 0.0, 2.0 );
	float ptFacing = 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
	ptCol += ptRimColor * ( pow( ptFacing, ptRimPower ) * ptRimStrength );
	ptCol += vec3( 0.88, 0.93, 1.0 ) * ( ptSheen * ptHairSheen );
	reflectedLight.directDiffuse = ptCol;
	reflectedLight.indirectDiffuse = vec3( 0.0 );
}
`;

function createToonFrom(source: SourceMat, params: ToonParams, textures: Record<string, THREE.Texture>): THREE.MeshToonMaterial {
  const toon = new THREE.MeshToonMaterial({
    name: source.name,
    // Preserve what keeps skinned/transparent/double-sided parts correct.
    side: source.side, transparent: source.transparent, opacity: source.opacity,
    alphaTest: source.alphaTest, depthWrite: source.depthWrite, depthTest: source.depthTest,
    map: source.map ?? null, normalMap: source.normalMap ?? null, alphaMap: source.alphaMap ?? null,
    emissiveMap: source.emissiveMap ?? null,
  });
  if (source.emissive) toon.emissive.copy(source.emissive);
  if (params.baseColor) toon.color.set(params.baseColor);
  else if (source.color) toon.color.copy(source.color);

  // Maps share the base map's UV set, so they only apply when the source has a base map.
  const shadeMap = source.map && params.shadeMap ? textures[params.shadeMap] : undefined;
  const transitionMap = source.map && params.transitionMap ? textures[params.transitionMap] : undefined;
  const uniforms: ToonUniforms = {
    ptShadeColor: { value: new THREE.Color() }, ptEdgeLow: { value: 0 }, ptEdgeHigh: { value: 0 },
    ptTransition: { value: 0 }, ptRimColor: { value: new THREE.Color() }, ptRimStrength: { value: 0 },
    ptRimPower: { value: 5 }, ptHairSheen: { value: 0 },
    ...(shadeMap ? { ptShadeMap: { value: shadeMap } } : {}),
    ...(transitionMap ? { ptTransitionMap: { value: transitionMap } } : {}),
  };
  toon.userData.toonUniforms = uniforms;
  writeUniforms(uniforms, params);

  const defines = `${shadeMap ? '#define PT_SHADE_MAP\n' : ''}${transitionMap ? '#define PT_TRANSITION_MAP\n' : ''}`;
  toon.customProgramCacheKey = () => `pt-toon-v2-${shadeMap ? 's' : ''}${transitionMap ? 't' : ''}`;
  toon.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = defines + shader.fragmentShader
      .replace('#include <lights_toon_pars_fragment>', GLSL_PARS)
      .replace('#include <lights_fragment_end>', GLSL_RESOLVE);
  };
  toon.addEventListener('dispose', () => { shadeMap?.dispose(); transitionMap?.dispose(); });
  toon.addEventListener('dispose', () => { shadeMap?.dispose(); transitionMap?.dispose(); });
  return toon;
}

interface OutlineState { mesh: THREE.Mesh; width: { value: number }[]; mats: THREE.Material[] }
const OUTLINE_KEY = 'ptOutline';

function makeOutlineMaterial(params: ToonParams, width: { value: number }): THREE.MeshLambertMaterial {
  // Lambert carries the normal/morph/skin chunks; black diffuse + emissive makes it flat-coloured.
  const mat = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: new THREE.Color(params.outlineColor), side: THREE.BackSide });
  mat.visible = false; // only slots bound with a width draw a shell
  mat.customProgramCacheKey = () => 'pt-outline-v1';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.ptOutlineWidth = width;
    shader.vertexShader = 'uniform float ptOutlineWidth;\n' + shader.vertexShader
      .replace('#include <project_vertex>', 'transformed += normalize( objectNormal ) * ptOutlineWidth;\n#include <project_vertex>');
  };
  return mat;
}

/** Keep one back-face shell per mesh, extruded along skinned/morphed normals; slots without width are hidden. */
function syncOutline(mesh: THREE.Mesh, slot: number, params: ToonParams): void {
  const slots = Array.isArray(mesh.material) ? mesh.material.length : 1;
  let state = mesh.userData[OUTLINE_KEY] as OutlineState | undefined;
  if (!state) {
    if (params.outlineWidth <= 0) return;
    const shell = (mesh as THREE.SkinnedMesh).isSkinnedMesh
      ? new THREE.SkinnedMesh(mesh.geometry, undefined)
      : new THREE.Mesh(mesh.geometry, undefined);
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const src = mesh as THREE.SkinnedMesh;
      (shell as THREE.SkinnedMesh).bind(src.skeleton, src.bindMatrix);
    }
    shell.morphTargetInfluences = mesh.morphTargetInfluences;
    shell.morphTargetDictionary = mesh.morphTargetDictionary;
    shell.layers.mask = mesh.layers.mask;
    shell.frustumCulled = false;
    shell.name = `${mesh.name}__outline`;
    const width = Array.from({ length: slots }, () => ({ value: 0 }));
    state = { mesh: shell, width, mats: [] };
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    state.mats = width.map((w) => makeOutlineMaterial(params, w));
    state.mats.push(hidden);
    shell.material = slots > 1 ? state.mats.slice(0, slots).map((m, i) => (m ? m : hidden)) : state.mats[0];
    mesh.add(shell);
    mesh.userData[OUTLINE_KEY] = state;
  }
  const mat = state.mats[slot] as THREE.MeshLambertMaterial | undefined;
  if (!mat) return;
  state.width[slot].value = params.outlineWidth;
  mat.emissive.set(params.outlineColor);
  mat.visible = params.outlineWidth > 0;
}

function removeOutline(mesh: THREE.Mesh): void {
  const state = mesh.userData[OUTLINE_KEY] as OutlineState | undefined;
  if (!state) return;
  mesh.remove(state.mesh);
  state.mats.forEach((m) => m.dispose());
  delete mesh.userData[OUTLINE_KEY];
}

function writeUniforms(u: ToonUniforms, params: ToonParams): void {
  u.ptShadeColor.value.set(params.shadeColor);
  u.ptEdgeLow.value = params.edgeLow;
  u.ptEdgeHigh.value = params.edgeHigh;
  u.ptTransition.value = params.transitionStrength;
  u.ptRimColor.value.set(params.rimColor);
  u.ptRimStrength.value = params.rimStrength;
  u.ptRimPower.value = params.rimPower;
  u.ptHairSheen.value = params.hairSheen;
}

/** Re-parameterise an existing toon material in place: no shader recompile. Maps are fixed at creation. */
export function updateToonParams(material: THREE.MeshToonMaterial, params: ToonParams): void {
  const uniforms = material.userData.toonUniforms as ToonUniforms | undefined;
  if (!uniforms) return;
  writeUniforms(uniforms, params);
  if (params.baseColor) material.color.set(params.baseColor);
}

export interface ApplyOptions {
  look?: string;
  /** Local per-asset overrides keyed by binding id; never written back to the package. */
  local?: Record<string, Partial<ToonParams>>;
  /** Decoded sidecar maps keyed by file name; the material takes ownership and disposes them. */
  textures?: Record<string, THREE.Texture>;
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
        syncOutline(mesh, binding.slot, params);
        status = 'applied';
        continue;
      }
      if (!(current as SourceMat).color) { status = 'unsupported-source'; continue; }
      if (!ORIGINALS.has(mesh)) ORIGINALS.set(mesh, Array.isArray(mesh.material) ? [...mesh.material] : mesh.material);
      const toon = createToonFrom(current as SourceMat, params, options.textures ?? {});
      if (Array.isArray(mesh.material)) mesh.material[binding.slot] = toon; else mesh.material = toon;
      syncOutline(mesh, binding.slot, params);
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
    removeOutline(mesh);
    const toons = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    toons.forEach((m) => { if ((m as THREE.MeshToonMaterial).isMeshToonMaterial) { m.dispose(); } });
    mesh.material = original;
    ORIGINALS.delete(mesh);
  });
}
