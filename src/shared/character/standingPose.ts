/**
 * CA-03 natural standing pose.
 *
 * Rigs usually export in a T-pose or A-pose bind pose. Leaving that pose on screen looks
 * like a mannequin, so the runtime adds a relaxed offset on top. The offsets here are
 * *deltas in radians*, never absolute rotations: the caller adds them to each bone's
 * load-time base rotation, so the original bind pose in the GLB is never modified and the
 * offset can be faded out (or an animation clip can override it) at any time.
 *
 * Sign conventions follow the VRM 1.0 export space used elsewhere in this folder:
 * +Y up, +Z forward (out of the screen, toward the viewer), so +X points to the
 * character's own left. A positive Z rotation on a left arm swings it away from the body.
 */

import { STANDING_REQUIRED, LEG_ROLES, type BoneRole } from './humanoid';

/** Euler delta in radians, applied in the bone's local space. */
export interface PoseOffset {
  x?: number;
  y?: number;
  z?: number;
}

export type PoseOffsets = Partial<Record<BoneRole, PoseOffset>>;

/**
 * How far the bind pose already is from a standing pose. `tpose` means arms are roughly
 * horizontal and need the full drop; `apose` means they are already angled down and only
 * need the remainder; `rest` means the rig was authored standing and only micro-relaxation
 * is added. Detected from geometry by {@link detectArmSpread}, never stored in config —
 * the model is the truth.
 */
export type BindPoseKind = 'tpose' | 'apose' | 'rest';

/**
 * Classify the bind pose from the angle between the upper-arm direction and straight down.
 * 90° means horizontal (T-pose), 0° means hanging straight down.
 *
 * @param armDropDeg angle in degrees between the upper arm bone and world -Y.
 */
export function classifyBindPose(armDropDeg: number): BindPoseKind {
  if (armDropDeg >= 60) return 'tpose';
  if (armDropDeg >= 25) return 'apose';
  return 'rest';
}

/**
 * Target angle, in degrees from straight down, that an upper arm should sit at when
 * relaxed. Not zero: arms resting perfectly vertical clip into the hips and read as
 * stiff. ~8° keeps a visible gap at the wrist.
 */
const TARGET_ARM_DROP_DEG = 8;

const DEG = Math.PI / 180;

/**
 * Build the standing offsets for a rig.
 *
 * @param armDropDeg measured bind-pose arm angle from straight down (see
 *   {@link classifyBindPose}). The arm correction is the *difference* between what the rig
 *   has and the relaxed target, so an already-relaxed rig gets no arm rotation at all.
 * @param present roles that actually resolved on this model. Absent roles get no offset
 *   rather than a guessed one.
 */
export function buildStandingPose(armDropDeg: number, present: ReadonlySet<BoneRole>): PoseOffsets {
  const out: PoseOffsets = {};
  const put = (role: BoneRole, off: PoseOffset) => {
    if (present.has(role)) out[role] = off;
  };

  // Arms: rotate about Z to swing down toward the body. Mirrored per side.
  const dropDeg = Math.max(0, armDropDeg - TARGET_ARM_DROP_DEG);
  const drop = dropDeg * DEG;
  if (drop > 0.001) {
    put('upperArmL', { z: -drop });
    put('upperArmR', { z: drop });
  }

  // Elbows: a slight bend so forearms are not locked straight. Always applied — even a
  // rest-pose rig benefits, and the amount is small enough not to fight a clip.
  put('lowerArmL', { y: -6 * DEG, z: -4 * DEG });
  put('lowerArmR', { y: 6 * DEG, z: 4 * DEG });

  // Wrists: hands turn slightly inward toward the thighs.
  put('handL', { z: -5 * DEG });
  put('handR', { z: 5 * DEG });

  // Shoulders drop a little; raised clavicles are the main "tense" tell.
  put('shoulderL', { z: -2.5 * DEG });
  put('shoulderR', { z: 2.5 * DEG });

  // Spine: a gentle S — hips tucked, chest open, head level. Keeps the silhouette from
  // reading as a plank without leaning the character off balance.
  put('spine', { x: 1.5 * DEG });
  put('chest', { x: -2 * DEG });
  put('neck', { x: 1.5 * DEG });

  // Legs: feet stay planted, so the knees get only a token bend and the thighs a small
  // outward rotation for stance width.
  put('upperLegL', { z: -1.5 * DEG });
  put('upperLegR', { z: 1.5 * DEG });
  put('lowerLegL', { x: 2 * DEG });
  put('lowerLegR', { x: 2 * DEG });

  return out;
}

/** Why a rig cannot report a verified standing pose. Reported, never silently ignored. */
export interface StandingReport {
  /** True only when every role in STANDING_REQUIRED resolved. */
  verified: boolean;
  /** Required roles that did not resolve. */
  missingRequired: BoneRole[];
  /** Leg roles that did not resolve — a half-body model, not necessarily an error. */
  missingLegs: BoneRole[];
  /** Human-readable degradation reasons, in the same style as ResolvedRoutes.notes. */
  notes: string[];
}

export function reportStanding(present: ReadonlySet<BoneRole>): StandingReport {
  const missingRequired = STANDING_REQUIRED.filter(r => !present.has(r));
  const missingLegs = LEG_ROLES.filter(r => !present.has(r));
  const notes: string[] = [];
  if (missingRequired.length > 0) {
    notes.push(`standing pose unverified: missing ${missingRequired.join(', ')}`);
  }
  if (missingLegs.length === LEG_ROLES.length) {
    notes.push('no leg bones resolved: treating model as half-body, foot contact disabled');
  } else if (missingLegs.length > 0) {
    notes.push(`partial legs: missing ${missingLegs.join(', ')}`);
  }
  return {
    verified: missingRequired.length === 0,
    missingRequired,
    missingLegs,
    notes,
  };
}
