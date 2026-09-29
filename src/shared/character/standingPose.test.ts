import { describe, it, expect } from 'vitest';
import {
  buildStandingPose, classifyBindPose, reportStanding, type PoseOffsets,
} from './standingPose';
import { ALL_ROLES, STANDING_REQUIRED, LEG_ROLES, type BoneRole } from './humanoid';

const full = new Set<BoneRole>(ALL_ROLES);

function maxAbs(p: PoseOffsets): number {
  let m = 0;
  for (const off of Object.values(p)) {
    m = Math.max(m, Math.abs(off.x ?? 0), Math.abs(off.y ?? 0), Math.abs(off.z ?? 0));
  }
  return m;
}

describe('classifyBindPose', () => {
  it('reads a horizontal arm as a T-pose and a hanging arm as already at rest', () => {
    expect(classifyBindPose(90)).toBe('tpose');
    expect(classifyBindPose(45)).toBe('apose');
    expect(classifyBindPose(5)).toBe('rest');
  });
});

describe('buildStandingPose', () => {
  it('drops a T-pose arm much further than an A-pose arm', () => {
    const t = buildStandingPose(90, full);
    const a = buildStandingPose(45, full);
    expect(Math.abs(t.upperArmL!.z!)).toBeGreaterThan(Math.abs(a.upperArmL!.z!));
  });

  it('leaves the arms alone when the rig was already authored standing', () => {
    // An 8-degree rig is already at the relaxed target, so no arm rotation is invented.
    expect(buildStandingPose(8, full).upperArmL).toBeUndefined();
  });

  it('mirrors every left/right pair with opposite sign', () => {
    const p = buildStandingPose(90, full);
    expect(p.upperArmL!.z!).toBeCloseTo(-p.upperArmR!.z!);
    expect(p.shoulderL!.z!).toBeCloseTo(-p.shoulderR!.z!);
    expect(p.handL!.z!).toBeCloseTo(-p.handR!.z!);
    // Knees bend the same way on both sides, so they are equal rather than mirrored.
    expect(p.lowerLegL!.x!).toBeCloseTo(p.lowerLegR!.x!);
  });

  it('never emits an offset for a role the model does not have', () => {
    // The user's current model: core roles only, no full-body chain.
    const coreOnly = new Set<BoneRole>(['head', 'chest', 'spine', 'shoulderL', 'shoulderR']);
    const p = buildStandingPose(90, coreOnly);
    for (const role of Object.keys(p) as BoneRole[]) {
      expect(coreOnly.has(role)).toBe(true);
    }
    expect(p.upperArmL).toBeUndefined();
    expect(p.lowerLegL).toBeUndefined();
  });

  it('keeps every offset small enough to read as relaxation, not as a new pose', () => {
    // Spine/neck/leg tweaks must stay subtle; only the arm drop may be large.
    const p = buildStandingPose(0, full);
    expect(maxAbs(p)).toBeLessThan(10 * Math.PI / 180);
  });

  it('produces no offsets at all for a rig with no resolved bones', () => {
    expect(buildStandingPose(90, new Set())).toEqual({});
  });
});

describe('reportStanding', () => {
  it('verifies a full humanoid with no notes', () => {
    const r = reportStanding(full);
    expect(r.verified).toBe(true);
    expect(r.missingRequired).toEqual([]);
    expect(r.notes).toEqual([]);
  });

  it('refuses to verify and names the missing roles rather than faking completion', () => {
    const noHips = new Set<BoneRole>(ALL_ROLES.filter(r => r !== 'hips'));
    const r = reportStanding(noHips);
    expect(r.verified).toBe(false);
    expect(r.missingRequired).toEqual(['hips']);
    expect(r.notes.join(' ')).toContain('hips');
  });

  it('reports a half-body model as half-body instead of as broken', () => {
    const upper = new Set<BoneRole>(ALL_ROLES.filter(r => !LEG_ROLES.includes(r)));
    const r = reportStanding(upper);
    expect(r.missingLegs).toEqual([...LEG_ROLES]);
    expect(r.notes.join(' ')).toContain('half-body');
  });

  it('distinguishes partial legs from no legs', () => {
    const partial = new Set<BoneRole>(ALL_ROLES.filter(r => r !== 'footR'));
    const r = reportStanding(partial);
    expect(r.notes.join(' ')).toContain('partial legs');
    expect(r.notes.join(' ')).not.toContain('half-body');
  });

  it('requires exactly the documented role set', () => {
    for (const role of STANDING_REQUIRED) {
      const without = new Set<BoneRole>(ALL_ROLES.filter(r => r !== role));
      expect(reportStanding(without).verified).toBe(false);
    }
  });
});
