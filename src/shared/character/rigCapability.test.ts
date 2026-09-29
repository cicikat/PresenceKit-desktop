import { describe, expect, it } from 'vitest';
import { probeRigCapability, type CapabilityProbeInput } from './rigCapability';

const exprKeys = new Set(['smile', 'sad', 'angry', 'surprised', 'blush', 'browDown', 'eyesWide']);
const input = (over: Partial<CapabilityProbeInput>): CapabilityProbeInput => ({
  morphKeys: [], expressionKeys: exprKeys, boneNames: [], resolved: {}, hasIdleClip: false, ...over,
});

describe('CA-02 rig capability probe', () => {
  it('describes a morph-only model like the current one', () => {
    expect(probeRigCapability(input({
      morphKeys: ['blink', 'mouthOpen', 'hairSwayLeft', 'smile', 'eyeLookLeft', 'eyeLookUp'],
      boneNames: ['DEF-spine.006', 'DEF-shoulder.L'],
      resolved: { head: true },
    }))).toEqual({
      expressionMorphs: true, gazeMorphs: true, eyeBones: false,
      faceBones: false, idleClip: false, headBone: true,
    });
  });

  it('requires both eye bones before claiming bone gaze', () => {
    expect(probeRigCapability(input({ resolved: { leftEye: true } })).eyeBones).toBe(false);
    expect(probeRigCapability(input({ resolved: { leftEye: true, rightEye: true } })).eyeBones).toBe(true);
  });

  it('does not count eye bones as facial bones', () => {
    expect(probeRigCapability(input({
      boneNames: ['DEF-eye.L', 'DEF-eye.R'], resolved: { leftEye: true, rightEye: true },
    })).faceBones).toBe(false);
    expect(probeRigCapability(input({ boneNames: ['DEF-jaw', 'brow.L'] })).faceBones).toBe(true);
  });

  it('ignores morph keys this build cannot drive', () => {
    expect(probeRigCapability(input({ morphKeys: ['dimple', 'wink'] })).expressionMorphs).toBe(false);
  });
});
