import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseExpressionsConfig } from './expressionsConfig';
import { MorphController } from '../../windows/room/morphController';

function mesh(name: string, keys: string[]): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  m.name = name;
  m.morphTargetDictionary = Object.fromEntries(keys.map((k, i) => [k, i]));
  m.morphTargetInfluences = keys.map(() => 0);
  return m;
}
const base = { schemaVersion: '1.0.0', expressions: { smile: [{ key: 'face_smile', weight: 0.5 }, { key: 'cheek_up', mesh: 'Face' }] } };

describe('CA-04 expressions config', () => {
  it('parses weighted multi-target mappings and warns on names with no consumer', () => {
    const r = parseExpressionsConfig({ ...base, expressions: { ...base.expressions, wink: [{ key: 'x' }] } });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) { expect(r.config.expressions.smile).toHaveLength(2); expect(r.warnings.join()).toContain('wink'); }
  });
  it('rejects bad versions, empty lists and out-of-range weights', () => {
    expect(parseExpressionsConfig({ ...base, schemaVersion: '2.0.0' })).toMatchObject({ ok: false });
    expect(parseExpressionsConfig({ ...base, expressions: { smile: [] } })).toMatchObject({ ok: false });
    expect(parseExpressionsConfig({ ...base, expressions: { smile: [{ key: 'a', weight: 5 }] } })).toMatchObject({ ok: false });
  });
  it('drives mesh-scoped targets with weights and leaves same-named keys on other meshes alone', () => {
    const root = new THREE.Group();
    const face = mesh('Face', ['face_smile', 'cheek_up']);
    const other = mesh('Other', ['cheek_up']);
    root.add(face, other);
    const morph = new MorphController(root);
    const parsed = parseExpressionsConfig(base);
    if (!parsed.ok) throw new Error('parse');
    const report = morph.applyMapping(parsed.config);
    expect(report.applied).toEqual(['smile']);
    morph.set('smile', 1);
    expect(face.morphTargetInfluences).toEqual([0.5, 1]);
    expect(other.morphTargetInfluences).toEqual([0]);
  });
  it('reports missing targets, keeps the old binding when nothing resolves, and resets on demand', () => {
    const root = new THREE.Group();
    const face = mesh('Face', ['smile']);
    root.add(face);
    const morph = new MorphController(root);
    const r = parseExpressionsConfig({ schemaVersion: '1.0.0', expressions: { smile: [{ key: 'nope' }] } });
    if (!r.ok) throw new Error('parse');
    const report = morph.applyMapping(r.config);
    expect(report).toMatchObject({ applied: [], unresolved: ['smile'], missingTargets: ['*/nope'] });
    morph.set('smile', 0.8);
    expect(face.morphTargetInfluences![0]).toBeCloseTo(0.8);
    morph.resetAll();
    expect(face.morphTargetInfluences![0]).toBe(0);
  });
});
