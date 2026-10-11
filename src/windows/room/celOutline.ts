import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Whole-character normal mask: union silhouette avoids separate hull seams at overlapping joints. */
export class CelOutline {
  target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, samples: 4 });
  pass: ShaderPass;
  private normal = new THREE.MeshNormalMaterial();
  private silhouetteOnly = new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.5, blending: THREE.NoBlending, depthWrite: true });
  private occluder = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0,
    blending: THREE.NoBlending, depthWrite: true });
  constructor() {
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.pass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, normals: { value: null },
        depths: { value: null }, texel: { value: new THREE.Vector2(1, 1) },
        outer: { value: 4 }, inner: { value: 0.65 }, lineColor: { value: new THREE.Color('#21172f') } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse, normals, depths; uniform vec2 texel;
        uniform float outer, inner; uniform vec3 lineColor; varying vec2 vUv;
        void main(){
          vec4 base=texture2D(tDiffuse,vUv), n=texture2D(normals,vUv);
          float silhouette=0.0, inside=step(0.1,n.a);
          for(int r=1;r<=3;r++) for(int a=0;a<16;a++){
            float angle=float(a)*6.2831853/16.0;
            vec2 offset=vec2(cos(angle),sin(angle))*texel*outer*float(r)/3.0;
            silhouette=max(silhouette,step(0.1,texture2D(normals,vUv+offset).a));
          }
          float crease=0.0, z=texture2D(depths,vUv).r;
          for(int a=0;a<4;a++){
            float angle=float(a)*1.5707963; vec2 offset=vec2(cos(angle),sin(angle))*texel*inner;
            vec4 other=texture2D(normals,vUv+offset);
            float dz=abs(texture2D(depths,vUv+offset).r-z);
            // Normal creases only on continuous-depth surfaces, not stacked meshes/occlusion edges.
            crease=max(crease,step(0.55,length(other.rgb-n.rgb))*step(dz,0.00035)*step(0.75,other.a)*step(0.75,n.a));
          }
          float edge=(1.0-inside)*silhouette*step(0.01,outer);
          float detail=crease*step(0.01,inner)*0.65;
          gl_FragColor=vec4(mix(base.rgb,lineColor,max(edge,detail)),base.a);
        }`,
    });
    // ShaderPass clones uniforms; render-target textures must be attached afterwards.
    this.pass.uniforms.normals.value = this.target.texture;
    this.pass.uniforms.depths.value = this.target.depthTexture;
  }
  setSize(width: number, height: number, ratio: number, outer: number, inner: number): void {
    this.target.setSize(Math.round(width * ratio), Math.round(height * ratio));
    this.pass.uniforms.texel.value.set(1 / (width * ratio), 1 / (height * ratio));
    this.setWidths(outer, inner, ratio);
  }
  setWidths(outer: number, inner: number, ratio: number): void {
    this.pass.uniforms.outer.value = outer * ratio; this.pass.uniforms.inner.value = inner * ratio;
  }
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, character: Set<THREE.Object3D>): void {
    const saved: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const background = scene.background, target = renderer.getRenderTarget();
    const alpha = renderer.getClearAlpha(), color = renderer.getClearColor(new THREE.Color());
    try {
      scene.traverse(o => { const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
        saved.push([mesh, mesh.material]);
        const mask = (m: THREE.Material) => /^(Outfit_|Neck_|Legs_|Boots_|Cape_Accessories_(Charcoal|Indigo))/.test(m.name)
          ? this.normal : this.silhouetteOnly;
        mesh.material = character.has(mesh) ? (Array.isArray(mesh.material) ? mesh.material.map(mask) : mask(mesh.material)) : this.occluder;
      });
      scene.background = null; renderer.setClearColor(0, 0); renderer.setRenderTarget(this.target);
      renderer.clear(); renderer.render(scene, camera);
    } finally {
      saved.forEach(([mesh, material]) => { mesh.material = material; });
      scene.background = background; renderer.setClearColor(color, alpha); renderer.setRenderTarget(target);
    }
  }
  dispose(): void { this.normal.dispose(); this.silhouetteOnly.dispose(); this.occluder.dispose(); this.target.dispose(); this.target.depthTexture?.dispose(); }
}
