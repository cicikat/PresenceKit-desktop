/**
 * CA-02 capability probe. Reports what a loaded model can actually do, from the
 * model itself — never from stored config. `resolveRoutes` consumes this to pick a
 * single owner per performance dimension.
 *
 * Kept free of Three.js types so it stays unit-testable: callers pass the already
 * collected morph key names and resolved bone names.
 */
import type { RigCapability } from './performanceRoutes';

export const GAZE_MORPH_KEYS = ['eyeLookLeft', 'eyeLookRight', 'eyeLookUp', 'eyeLookDown'] as const;

/**
 * Facial deform bone name fragments. Eye bones are handled separately via the
 * boneMap roles, so they are deliberately absent here — `eye` would otherwise make
 * every eye-boned model claim full facial bone control it does not have.
 */
const FACE_BONE_FRAGMENTS = ['jaw', 'brow', 'cheek', 'mouth', 'lip', 'tongue', 'eyelid', 'nose'];

export interface CapabilityProbeInput {
  /** Every morph target key present anywhere in the model. */
  morphKeys: readonly string[];
  /** Expression keys this build knows how to drive (`EXPR_KEYS`). */
  expressionKeys: ReadonlySet<string>;
  /** Every bone name in the model. */
  boneNames: readonly string[];
  /** Resolved semantic roles that matter for routing. */
  resolved: { head?: boolean; leftEye?: boolean; rightEye?: boolean };
  /** Whether an idle clip was selected for this model. */
  hasIdleClip: boolean;
}

export function probeRigCapability(input: CapabilityProbeInput): RigCapability {
  const morphs = new Set(input.morphKeys);
  const lowerBones = input.boneNames.map((name) => name.toLowerCase());
  return {
    expressionMorphs: [...input.expressionKeys].some((key) => morphs.has(key)),
    gazeMorphs: GAZE_MORPH_KEYS.some((key) => morphs.has(key)),
    // Both eyes required: one bone cannot drive symmetric gaze without guessing a mirror.
    eyeBones: input.resolved.leftEye === true && input.resolved.rightEye === true,
    faceBones: lowerBones.some((name) => FACE_BONE_FRAGMENTS.some((f) => name.includes(f))),
    idleClip: input.hasIdleClip,
    headBone: input.resolved.head === true,
  };
}
