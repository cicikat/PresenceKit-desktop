import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BoneResolver } from './boneResolver';

/** Build a bone chain from `[name, parentName|null, localPos]` triples. */
function rig(spec: [string, string | null, [number, number, number]][]): THREE.Object3D {
  const root = new THREE.Object3D();
  const made = new Map<string, THREE.Bone>();
  for (const [name, parent, pos] of spec) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    made.set(name, b);
    (parent ? made.get(parent)! : root).add(b);
  }
  root.updateMatrixWorld(true);
  return root;
}

/** A well-formed Rigify-style upper body, left side at +X. */
const HEALTHY: [string, string | null, [number, number, number]][] = [
  ['DEF-hips', null, [0, 0.9, 0]],
  ['DEF-spine.001', 'DEF-hips', [0, 0.1, 0]],
  ['DEF-spine.003', 'DEF-spine.001', [0, 0.2, 0]],
  ['DEF-spine.004', 'DEF-spine.003', [0, 0.1, 0]],
  ['DEF-spine.006', 'DEF-spine.004', [0, 0.1, 0]],
  ['DEF-eye.L', 'DEF-spine.006', [0.03, 0.05, 0.06]],
  ['DEF-eye.R', 'DEF-spine.006', [-0.03, 0.05, 0.06]],
  ['DEF-shoulder.L', 'DEF-spine.003', [0.05, 0.08, 0]],
  ['DEF-shoulder.R', 'DEF-spine.003', [-0.05, 0.08, 0]],
  ['DEF-upper_arm.L', 'DEF-shoulder.L', [0.12, 0, 0]],
  ['DEF-upper_arm.R', 'DEF-shoulder.R', [-0.12, 0, 0]],
  ['DEF-forearm.L', 'DEF-upper_arm.L', [0.25, 0, 0]],
  ['DEF-forearm.R', 'DEF-upper_arm.R', [-0.25, 0, 0]],
  ['DEF-hand.L', 'DEF-forearm.L', [0.22, 0, 0]],
  ['DEF-hand.R', 'DEF-forearm.R', [-0.22, 0, 0]],
];

describe('BoneResolver role resolution', () => {
  it('maps the full humanoid chain from Rigify names with no warnings', () => {
    const r = new BoneResolver(rig(HEALTHY));
    expect(r.resolved.hips?.name).toBe('DEF-hips');
    expect(r.resolved.neck?.name).toBe('DEF-spine.004');
    expect(r.resolved.head?.name).toBe('DEF-spine.006');
    expect(r.resolved.handL?.name).toBe('DEF-hand.L');
    expect(r.resolved.upperArmR?.name).toBe('DEF-upper_arm.R');
    expect(r.warnings).toEqual([]);
  });

  it('matches candidate names case-insensitively so ARP and Mixamo exports both resolve', () => {
    const r = new BoneResolver(rig([
      ['MIXAMORIGHIPS', null, [0, 0.9, 0]],
      ['mixamorigspine', 'MIXAMORIGHIPS', [0, 0.1, 0]],
    ]));
    expect(r.resolved.hips?.name).toBe('MIXAMORIGHIPS');
    expect(r.resolved.spine?.name).toBe('mixamorigspine');
  });

  it('lets an explicit boneMap entry beat the candidate list', () => {
    const r = new BoneResolver(rig([
      ['DEF-spine.006', null, [0, 1.5, 0]],
      ['my_custom_head', null, [0, 1.5, 0]],
    ]), { head: 'my_custom_head' });
    expect(r.resolved.head?.name).toBe('my_custom_head');
  });

  it('warns about a stale boneMap entry instead of silently falling back', () => {
    const r = new BoneResolver(rig(HEALTHY), { head: 'bone_that_was_renamed' });
    expect(r.warnings.join(' ')).toContain('bone_that_was_renamed');
    // Fallback still happens, so the character is not left headless.
    expect(r.resolved.head?.name).toBe('DEF-spine.006');
  });

  it('reports only the roles that actually resolved', () => {
    const present = new BoneResolver(rig(HEALTHY)).presentRoles();
    expect(present.has('handL')).toBe(true);
    expect(present.has('footL')).toBe(false);
    expect(present.has('toesR')).toBe(false);
  });
});

describe('BoneResolver topology checks', () => {
  it('flags two roles bound to the same bone', () => {
    const r = new BoneResolver(rig(HEALTHY), { leftEye: 'DEF-eye.L', rightEye: 'DEF-eye.L' });
    expect(r.warnings.join(' ')).toMatch(/leftEye and rightEye both resolve/);
  });

  it('flags a role that is not under its expected parent', () => {
    // Head parented straight to hips, skipping the spine chain.
    const spec = HEALTHY.map(s => (s[0] === 'DEF-spine.006' ? ['DEF-spine.006', 'DEF-hips', s[2]] : s));
    const r = new BoneResolver(rig(spec as typeof HEALTHY));
    expect(r.warnings.join(' ')).toMatch(/head .* is not under neck/);
  });

  it('flags a swapped left/right pair by world position', () => {
    // Hands exported with the sides crossed — invisible until the character gestures.
    const spec = HEALTHY.map(s => {
      if (s[0] === 'DEF-hand.L') return ['DEF-hand.L', 'DEF-forearm.R', [-0.22, 0, 0]];
      if (s[0] === 'DEF-hand.R') return ['DEF-hand.R', 'DEF-forearm.L', [0.22, 0, 0]];
      return s;
    });
    const r = new BoneResolver(rig(spec as typeof HEALTHY));
    expect(r.warnings.join(' ')).toMatch(/handL\/handR look swapped/);
  });

  it('flags a mirrored (negative) bone scale that would shear rotation offsets', () => {
    const root = rig(HEALTHY);
    root.traverse(o => { if (o.name === 'DEF-hand.R') o.scale.set(-1, 1, 1); });
    const r = new BoneResolver(root);
    expect(r.warnings.join(' ')).toMatch(/handR .* mirrored or zero scale/);
  });

  it('flags non-uniform scale', () => {
    const root = rig(HEALTHY);
    root.traverse(o => { if (o.name === 'DEF-spine.006') o.scale.set(1, 1.4, 1); });
    const r = new BoneResolver(root);
    expect(r.warnings.join(' ')).toMatch(/head .* non-uniform scale/);
  });

  it('stays silent about swaps when a pair sits on the centre line', () => {
    // Eyes both at x=0 is inconclusive, not wrong — do not cry wolf.
    const spec = HEALTHY.map(s => {
      if (s[0] === 'DEF-eye.L') return ['DEF-eye.L', 'DEF-spine.006', [0, 0.05, 0.06]];
      if (s[0] === 'DEF-eye.R') return ['DEF-eye.R', 'DEF-spine.006', [0, 0.05, 0.06]];
      return s;
    });
    const r = new BoneResolver(rig(spec as typeof HEALTHY));
    expect(r.warnings.join(' ')).not.toMatch(/swapped/);
  });

  it('does not warn about roles the model simply does not have', () => {
    // Half-body model: absent legs must not produce topology noise.
    const r = new BoneResolver(rig(HEALTHY));
    expect(r.warnings.join(' ')).not.toMatch(/Leg|foot|toes/i);
  });
});
