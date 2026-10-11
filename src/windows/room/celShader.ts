import * as THREE from 'three';
import { celCategory, type CelConfig } from '../../shared/room/celConfig';

export function patchCelShader(material: THREE.MeshToonMaterial, sourceColor: THREE.Color, config: CelConfig): void {
  const category = celCategory(material.name), palette = config.palettes[category];
  const uniforms = {
    celLit: { value: new THREE.Color(palette.lit) }, celShade: { value: new THREE.Color(palette.shade) },
    celDeep: { value: new THREE.Color(palette.deep) }, celBand: { value: new THREE.Color(palette.band) },
    celHighlight: { value: new THREE.Color(palette.highlight) }, celSource: { value: sourceColor.clone() },
    celCut: { value: config.shadowCoverage }, celBandWidth: { value: config.bandWidth },
    celSaturation: { value: config.bandSaturation }, celShine: { value: config.highlight },
    celMetal: { value: category === 'metal' ? 1 : 0 },
  };
  material.emissive.set(0); material.customProgramCacheKey = () => 'room-tv-cel-v2';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_toon_pars_fragment>', /* glsl */`
      varying vec3 vViewPosition;
      uniform vec3 celLit, celShade, celDeep, celBand, celHighlight, celSource;
      uniform float celCut, celBandWidth, celSaturation, celShine, celMetal;
      struct ToonMaterial { vec3 diffuseColor; };
      float celN = 0.0; float celH = 0.0;
      void RE_Direct_Cel(const in IncidentLight light, const in vec3 geometryPosition,
        const in vec3 geometryNormal, const in vec3 geometryViewDir,
        const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight) {
        float strength = dot(light.color, vec3(0.2126,0.7152,0.0722));
        if (strength > 0.01) {
          celN = max(celN, dot(geometryNormal, light.direction) * 0.5 + 0.5);
          celH = max(celH, dot(geometryNormal, normalize(light.direction + geometryViewDir)));
        }
      }
      void RE_IndirectDiffuse_Cel(const in vec3 irradiance, const in vec3 geometryPosition,
        const in vec3 geometryNormal, const in vec3 geometryViewDir,
        const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight) {}
      #define RE_Direct RE_Direct_Cel
      #define RE_IndirectDiffuse RE_IndirectDiffuse_Cel
    `).replace('#include <lights_fragment_end>', /* glsl */`
      #include <lights_fragment_end>
      vec3 celColor = celN >= celCut ? celLit : (celN < celCut * 0.46 ? celDeep : celShade);
      float celLuma = dot(celBand, vec3(0.2126,0.7152,0.0722));
      vec3 celSaturated = max(vec3(0.0), mix(vec3(celLuma), celBand, celSaturation));
      if (celBandWidth > 0.0 && abs(celN-celCut) < celBandWidth*0.5) celColor = celSaturated;
      // Hard, shaped highlight follows the half vector and only appears on the lit side.
      float celSpec = step(mix(0.985,0.95,celMetal),celH) * step(celCut+celBandWidth,celN);
      float celEdge = step(0.92,1.0-max(dot(normalize(normal),normalize(vViewPosition)),0.0)) * step(celCut+0.08,celN);
      celColor = mix(celColor,celHighlight,clamp((celSpec*mix(0.3,0.8,celMetal)+celEdge*0.12)*celShine,0.0,1.0));
      // Divide out only the source factor: preserve the original map/UV instead of bleaching it.
      vec3 celTexture = diffuseColor.rgb / max(celSource,vec3(0.001));
      reflectedLight.directDiffuse = celColor * celTexture;
      reflectedLight.indirectDiffuse = vec3(0.0);
    `);
  };
}
