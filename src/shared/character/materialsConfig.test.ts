import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildToonRamp, parseMaterialsConfig, resolveToonParams, TEMPLATE_DEFAULTS } from './materialsConfig';
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
    expect(resolveToonParams(face).shadeSoftness).toBe(TEMPLATE_DEFAULTS.FACE.shadeSoftness);
    expect(resolveToonParams(face).rimStrength).toBe(0.4);
    expect(resolveToonParams(face, r.config.looks.night.face).shadeColor).toBe('#334466');
    expect(resolveToonParams(face, r.config.looks.night.face, { shadeColor: '#112233' }).shadeColor).toBe('#112233');
  });
  it('builds a ramp that goes shade -> white across the threshold', () => {
    const p = { ...TEMPLATE_DEFAULTS.CLOTH, shadeColor: '#404040', shadeThreshold: 0, shadeSoftness: 0 };
    const ramp = buildToonRamp(p, [1, 1, 1], 64);
    expect(ramp[0]).toBeLessThan(80);
    expect(ramp[63 * 4]).toBe(255);
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
    expect((first.userData.toonRim as { rimStrength: { value: number } }).rimStrength.value).toBe(1.5);
    updateToonParams(first as unknown as THREE.MeshToonMaterial, resolveToonParams(parsed.config.bindings[0], undefined, { rimStrength: 0 }));
    expect((first.userData.toonRim as { rimStrength: { value: number } }).rimStrength.value).toBe(0);
  });
});
