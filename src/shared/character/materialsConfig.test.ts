import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAP_FILE, parseMaterialsConfig, resolveToonParams, TEMPLATE_DEFAULTS } from './materialsConfig';
import { applyToonBindings, revertToonBindings, updateToonParams } from './toonMaterial';

const raw = {
  schemaVersion: '1.0.0',
  bindings: [
    { id: 'face', mesh: 'Body', slot: 0, materialName: 'Skin', template: 'FACE', params: { rimStrength: 0.4 } },
    { id: 'hair', mesh: 'Hair', slot: 0, template: 'HAIR' },
  ],
  looks: { night: { face: { shadeColor: '#334466' } } },
};

describe('CA-06 materials config', () => {
  it('parses bindings and ignores unknown params with a warning', () => {
    const r = parseMaterialsConfig({ ...raw, bindings: [{ ...raw.bindings[0], params: { rimStrength: 0.4, futureGloss: 1 } }] });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.warnings.join()).toContain('futureGloss');
  });
  it('rejects out-of-range values, duplicate slots and unknown templates', () => {
    expect(parseMaterialsConfig({ ...raw, bindings: [{ ...raw.bindings[0], params: { rimPower: 99 } }] })).toMatchObject({ ok: false });
    expect(parseMaterialsConfig({ ...raw, bindings: [raw.bindings[0], { ...raw.bindings[0], id: 'x' }] })).toMatchObject({ ok: false });
    expect(parseMaterialsConfig({ ...raw, bindings: [{ ...raw.bindings[0], template: 'MAGIC' }] })).toMatchObject({ ok: false });
    expect(parseMaterialsConfig({ ...raw, schemaVersion: '2.0.0' })).toMatchObject({ ok: false });
  });
  it('skips planned templates instead of faking them', () => {
    const r = parseMaterialsConfig({ ...raw, bindings: [{ ...raw.bindings[0], template: 'SKIN' }] });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) { expect(r.config.bindings).toHaveLength(0); expect(r.warnings.join()).toContain('planned'); }
  });
  it('resolves default < binding < look < local', () => {
    const r = parseMaterialsConfig(raw);
    if (!r.ok) throw new Error('parse');
    const face = r.config.bindings[0];
    expect(resolveToonParams(face).edgeHigh).toBe(TEMPLATE_DEFAULTS.FACE.edgeHigh);
    expect(resolveToonParams(face).rimStrength).toBe(0.4);
    expect(resolveToonParams(face, r.config.looks.night.face).shadeColor).toBe('#334466');
    expect(resolveToonParams(face, r.config.looks.night.face, { shadeColor: '#112233' }).shadeColor).toBe('#112233');
  });
  it('defaults match the Blender group and accept map names beside the model', () => {
    expect(TEMPLATE_DEFAULTS.CLOTH).toMatchObject({ edgeLow: -0.22, edgeHigh: 0.68, transitionStrength: 0.2, rimPower: 5 });
    const ok = parseMaterialsConfig({ ...raw, bindings: [{ ...raw.bindings[0], params: { shadeMap: 'Body__ShadowTint.png', hairSheen: 0.075 } }] });
    expect(ok).toMatchObject({ ok: true });
    for (const bad of ['../x.png', 'a/b.png', 'C:x.png', '.hidden.png', 'x.glb']) {
      expect(MAP_FILE.test(bad)).toBe(false);
      expect(parseMaterialsConfig({ ...raw, bindings: [{ ...raw.bindings[0], params: { transitionMap: bad } }] })).toMatchObject({ ok: false });
    }
  });
  it('maps legacy threshold/softness to an edge pair', () => {
    const r = parseMaterialsConfig({ ...raw, bindings: [{ ...raw.bindings[0], params: { shadeThreshold: 0.2, shadeSoftness: 0.2 } }] });
    if (!r.ok) throw new Error('parse');
    expect(r.config.bindings[0].params.edgeLow).toBeCloseTo(0.1);
    expect(r.config.bindings[0].params.edgeHigh).toBeCloseTo(0.3);
    expect(r.warnings.join()).toContain('legacy');
  });
});

function model() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'Skin', color: 0xffccaa, transparent: true, side: THREE.DoubleSide }));
  body.name = 'Body';
  root.add(body);
  return { root, body };
}

describe('CA-06 toon application', () => {
  const parsed = parseMaterialsConfig(raw);
  if (!parsed.ok) throw new Error('parse');
  it('swaps the slot, keeps render state, reports missing targets and reverts', () => {
    const { root, body } = model();
    const original = body.material;
    const report = applyToonBindings(root, parsed.config);
    expect(report).toEqual([{ id: 'face', status: 'applied' }, { id: 'hair', status: 'missing-mesh' }]);
    const toon = body.material as unknown as THREE.MeshToonMaterial;
    expect(toon.isMeshToonMaterial).toBe(true);
    expect(toon.transparent).toBe(true);
    expect(toon.side).toBe(THREE.DoubleSide);
    revertToonBindings(root);
    expect(body.material).toBe(original);
  });
  it('marks a renamed material stale instead of applying', () => {
    const { root, body } = model();
    (body.material as THREE.Material).name = 'Renamed';
    expect(applyToonBindings(root, parsed.config)[0]).toEqual({ id: 'face', status: 'stale-name' });
    expect((body.material as THREE.MeshStandardMaterial).isMeshStandardMaterial).toBe(true);
  });
  it('re-parameterises in place without replacing the material', () => {
    const { root, body } = model();
    applyToonBindings(root, parsed.config);
    const first = body.material;
    applyToonBindings(root, parsed.config, { look: 'night', local: { face: { rimStrength: 1.5 } } });
    expect(body.material).toBe(first);
    expect((first.userData.toonUniforms as { ptRimStrength: { value: number } }).ptRimStrength.value).toBe(1.5);
    updateToonParams(first as unknown as THREE.MeshToonMaterial, resolveToonParams(parsed.config.bindings[0], undefined, { rimStrength: 0 }));
    expect((first.userData.toonUniforms as { ptRimStrength: { value: number } }).ptRimStrength.value).toBe(0);
  });
});
