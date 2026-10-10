import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { bindScreen, ScreenDriver } from './screenDriver';
import { parseScreenConfig } from './screenConfig';
const config = parseScreenConfig({ schemaVersion: '1.0.0', target: { node: 'screen', materialName: 'display' }, clips: { normal: { type: 'image', uri: 'n.png' } }, mappings: { expressions: { neutral: 'normal' }, activityStates: {} } });
describe('screen material isolation', () => {
  it('binds the original GLTF name after GLTFLoader sanitization, without guessing another mesh', () => {
    const material = new THREE.MeshStandardMaterial(); material.name = 'display';
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
    mesh.name = THREE.PropertyBinding.sanitizeNodeName('TV_Head_Rigid.002');
    mesh.userData.name = 'TV_Head_Rigid.002';
    const cfg = { ...config, target: { node: 'TV_Head_Rigid.002', materialName: 'display' } };
    expect(bindScreen(mesh, cfg).mesh).toBe(mesh);
    mesh.userData.name = 'different';
    expect(() => bindScreen(mesh, cfg)).toThrow('exactly one');
  });
  it('clones only the target slot and restores without disposing shared resources', () => {
    const material = new THREE.MeshStandardMaterial(); material.name = 'display';
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), [material]); mesh.name = 'screen';
    const other = new THREE.Mesh(mesh.geometry, material); const root = new THREE.Group(); root.add(mesh, other);
    const map = new THREE.Texture(); let disposed = false; material.addEventListener('dispose', () => { disposed = true; });
    const driver = new ScreenDriver(config, root, { 'n.png': map }, 4); driver.update(0, 'neutral', 'idle');
    expect((mesh.material as THREE.Material[])[0]).not.toBe(material); expect(other.material).toBe(material);
    driver.dispose(); driver.dispose(); expect((mesh.material as THREE.Material[])[0]).toBe(material); expect(disposed).toBe(false);
  });
  it('rejects ambiguous bindings before mutation', () => {
    const root = new THREE.Group(); for (let i=0;i<2;i++) { const m = new THREE.MeshStandardMaterial(); m.name='display'; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(),m); mesh.name='screen'; root.add(mesh); }
    expect(() => bindScreen(root, config)).toThrow('exactly one');
  });
});
