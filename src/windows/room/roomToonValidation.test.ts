import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const harness = vi.hoisted(() => {
  const state = { renders: 0, fail: false };
  class Pass {
    uniforms: Record<string, { value: unknown }> = {};
    visibleEdgeColor = { set: () => {} }; hiddenEdgeColor = { set: () => {} };
    renderTargetsHorizontal = [{ texture: null }];
    constructor(shader?: { uniforms?: Record<string, { value: unknown }> }) { this.uniforms = shader?.uniforms ?? {}; }
    dispose() {}
  }
  class Composer {
    passes: Pass[] = [];
    addPass(p: Pass) { this.passes.push(p); }
    setSize() {}
    render() { state.renders++; if (state.fail) throw new Error('GPU failure'); }
    dispose() {}
  }
  return { state, Pass, Composer };
});
vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({ EffectComposer: harness.Composer }));
vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({ RenderPass: harness.Pass }));
vi.mock('three/examples/jsm/postprocessing/OutlinePass.js', () => ({ OutlinePass: harness.Pass }));
vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({ UnrealBloomPass: harness.Pass }));
vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({ ShaderPass: harness.Pass }));
vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({ OutputPass: harness.Pass }));
import { RoomToonValidation, supportsRoomToon } from './roomToonValidation';

describe('Room toon isolation', () => {
  it.each([false, true])('restores live screen material, lights and transforms after render (failure=%s)', fail => {
    harness.state.fail = fail; harness.state.renders = 0;
    const renderer = { toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.4,
      shadowMap: { enabled: true } } as THREE.WebGLRenderer;
    const scene = new THREE.Scene(); const background = new THREE.Color('red'); scene.background = background;
    const character = new THREE.Group(), room = new THREE.Group(); scene.add(character, room);
    const source = new THREE.MeshStandardMaterial({ name: 'TV_Screen_Expressions_Screen' });
    source.map = new THREE.Texture();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source); mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(1, 2, 3); character.add(mesh); scene.updateMatrixWorld(true);
    const matrix = mesh.matrix.toArray(), texture = source.map;
    const light = new THREE.DirectionalLight(); scene.add(light);
    const look = new RoomToonValidation(renderer, scene, new THREE.PerspectiveCamera(), 320, 560);
    if (fail) expect(() => look.render(character, room)).toThrow('GPU failure');
    else look.render(character, room);
    expect(mesh.material).toBe(source); expect(source.map).toBe(texture);
    expect(mesh.matrix.toArray()).toEqual(matrix);
    expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
    expect(light.visible).toBe(true); expect(scene.background).toBe(background);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.4);
    look.dispose(); look.dispose();
    expect(scene.children).toEqual([character, room, light]);
    mesh.geometry.dispose(); source.map.dispose(); source.dispose();
  });
  it('leaves other character and Pet routes outside the TV experiment', () => {
    expect(supportsRoomToon('TV_Character_Rigged_v03.glb')).toBe(true);
    expect(supportsRoomToon('Yexuan_toon_v008.glb')).toBe(false);
    expect(supportsRoomToon('character.glb')).toBe(false);
  });
});
