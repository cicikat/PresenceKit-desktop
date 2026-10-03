import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CharacterPerformer } from './performer';
import { buildCharacterDiagnostics } from './diagnostics';

describe('CA-07 diagnostics', () => {
  it('reports missing roles, routes and degradation without leaking bone content or paths', () => {
    const root = new THREE.Group();
    for (const n of ['DEF-spine006', 'DEF-eyeL', 'DEF-eyeR']) { const b = new THREE.Bone(); b.name = n; root.add(b); }
    const d = buildCharacterDiagnostics(new CharacterPerformer(root), {
      materials: [{ id: 'a', status: 'applied' }, { id: 'b', status: 'stale-name' }],
    });
    expect(d.roles.resolved).toBeGreaterThanOrEqual(3);
    expect(d.roles.missing).toContain('handL');
    expect(d.routes.gaze).toBe('bone');
    expect(d.materials).toEqual({ applied: 1, problems: [{ id: 'b', status: 'stale-name' }] });
    expect(JSON.stringify(d)).not.toMatch(/[A-Za-z]:[\/]/);
  });
});
