// three.js side of the color grade (work order 4). Owns the EffectComposer lifecycle so the
// call window pays for post-processing only while a grade/bloom is actually visible.
//
// Pass chain when active: RenderPass -> [UnrealBloomPass] -> OutputPass (tone mapping +
// sRGB, reads renderer.toneMapping/exposure) -> grade ShaderPass (display space, so the
// 0.5 contrast pivot means mid-gray). With the grade off, GradeRenderer.render() is just
// renderer.render(), identical to the pre-grade path.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DEFAULT_GRADE, gradeUniformsFrom, needsComposer } from '../../shared/room/gradeConfig';
import type { GradeCfg, ToneMappingName } from '../../shared/room/gradeConfig';

const TONE_MAPPING: Record<ToneMappingName, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  reinhard: THREE.ReinhardToneMapping,
};

// Order is fixed: gain -> lift -> contrast -> saturation -> vignette (see gradeUniformsFrom).
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    lift: { value: 0 },
    contrast: { value: 1 },
    saturation: { value: 1 },
    vignette: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 gain;
    uniform float lift;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb * gain + vec3(lift);
      c = vec3(0.5) + (c - vec3(0.5)) * contrast;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, saturation);
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - vignette * smoothstep(0.3, 0.85, d);
      gl_FragColor = vec4(c, tex.a);
    }`,
};

export class GradeRenderer {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private cfg: GradeCfg = DEFAULT_GRADE;
  private width: number;
  private height: number;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    width: number,
    height: number,
  ) {
    this.width = width;
    this.height = height;
  }

  get usingComposer(): boolean { return this.composer !== null; }

  apply(cfg: GradeCfg): void {
    this.cfg = cfg;
    // Tone mapping/exposure live on the renderer; disabled grade must restore the exact
    // pre-grade state (no tone mapping, exposure 1).
    this.renderer.toneMapping = cfg.enabled ? TONE_MAPPING[cfg.toneMapping] : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = cfg.enabled ? cfg.exposure : 1;

    if (!needsComposer(cfg)) {
      this.disposeComposer();
      return;
    }
    if (!this.composer) this.buildComposer();
    this.updatePasses();
  }

  private buildComposer(): void {
    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(this.width, this.height);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.4, 0.4, 0.85);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.gradePass = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GradeShader.uniforms),
      vertexShader: GradeShader.vertexShader,
      fragmentShader: GradeShader.fragmentShader,
    }));
    composer.addPass(this.gradePass);
    this.composer = composer;
  }

  private updatePasses(): void {
    if (!this.bloom || !this.gradePass) return;
    const { bloom } = this.cfg;
    this.bloom.enabled = bloom.on;
    this.bloom.strength = bloom.strength;
    this.bloom.radius = bloom.radius;
    this.bloom.threshold = bloom.threshold;
    const u = gradeUniformsFrom(this.cfg);
    const uniforms = this.gradePass.uniforms;
    (uniforms.gain.value as THREE.Vector3).set(...u.gain);
    uniforms.lift.value = u.lift;
    uniforms.contrast.value = u.contrast;
    uniforms.saturation.value = u.saturation;
    uniforms.vignette.value = u.vignette;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.composer?.setSize(width, height);
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private disposeComposer(): void {
    if (!this.composer) return;
    this.composer.passes.forEach(p => (p as { dispose?: () => void }).dispose?.());
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.composer = null;
    this.bloom = null;
    this.gradePass = null;
  }

  dispose(): void {
    this.disposeComposer();
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
  }
}
