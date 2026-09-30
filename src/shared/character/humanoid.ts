/**
 * CA-03 humanoid role vocabulary. Role names and the +Y-up / +Z-forward export space
 * follow VRM 1.0 so external motion can be retargeted later without a second mapping.
 *
 * Roles are semantic, never bone names: the same role resolves to `DEF-spine.006` on a
 * Rigify export and `head.x` on an Auto-Rig Pro one. Name candidates below are only
 * automatic *suggestions*; an explicit `boneMap` entry always wins, because candidate
 * lists cannot be trusted across rig generators or versions.
 */

/** Roles the procedural performance layers drive directly. Present since before CA-03. */
export const CORE_ROLES = [
  'head', 'chest', 'spine', 'shoulderL', 'shoulderR', 'leftEye', 'rightEye',
] as const;

/** Full-body roles added by CA-03 for natural standing, retargeting and contact work. */
export const HUMANOID_ROLES = [
  'hips', 'neck',
  'upperArmL', 'lowerArmL', 'handL',
  'upperArmR', 'lowerArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'toesL',
  'upperLegR', 'lowerLegR', 'footR', 'toesR',
] as const;

export const ALL_ROLES = [...CORE_ROLES, ...HUMANOID_ROLES] as const;

export type CoreBoneRole = typeof CORE_ROLES[number];
export type HumanoidBoneRole = typeof HUMANOID_ROLES[number];
export type BoneRole = typeof ALL_ROLES[number];

/**
 * Roles required before a pose can claim to stand naturally. A half-body model missing
 * legs is still usable; it just cannot report a verified standing pose or foot contact.
 */
export const STANDING_REQUIRED: readonly BoneRole[] = [
  'hips', 'spine', 'chest', 'head',
  'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR',
];
export const LEG_ROLES: readonly BoneRole[] = [
  'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR',
];

/**
 * Automatic name candidates, in priority order: Rigify deform names first, then common
 * generic/Mixamo names, then Auto-Rig Pro's lowercase `.x`/`.l`/`.r` names. The two
 * conventions do not collide, so one combined list serves both. Matching is
 * case-insensitive and an exact match on the whole name — substring matching would make
 * `hand` claim `handle` or `DEF-thumb`.
 */
export const ROLE_CANDIDATES: Record<BoneRole, readonly string[]> = {
  head:      ['DEF-spine.006', 'DEF-spine.005', 'DEF-head', 'head', 'Head', 'mixamorigHead', 'head.x'],
  neck:      ['DEF-spine.004', 'DEF-neck', 'neck', 'Neck', 'mixamorigNeck', 'neck.x'],
  chest:     ['DEF-spine.003', 'DEF-spine.002', 'chest', 'Chest', 'UpperChest', 'spine.003', 'mixamorigSpine2', 'spine_02.x', 'spine_03.x'],
  spine:     ['DEF-spine.001', 'DEF-spine', 'spine', 'Spine', 'mixamorigSpine', 'spine_01.x'],
  hips:      ['DEF-hips', 'DEF-pelvis', 'hips', 'Hips', 'pelvis', 'Pelvis', 'mixamorigHips', 'root.x', 'c_root.x'],
  shoulderL: ['DEF-shoulder.L', 'shoulder.L', 'DEF-clavicle.L', 'LeftShoulder', 'mixamorigLeftShoulder', 'shoulder.l'],
  shoulderR: ['DEF-shoulder.R', 'shoulder.R', 'DEF-clavicle.R', 'RightShoulder', 'mixamorigRightShoulder', 'shoulder.r'],
  upperArmL: ['DEF-upper_arm.L', 'upper_arm.L', 'LeftArm', 'mixamorigLeftArm', 'arm_stretch.l', 'arm.l'],
  upperArmR: ['DEF-upper_arm.R', 'upper_arm.R', 'RightArm', 'mixamorigRightArm', 'arm_stretch.r', 'arm.r'],
  lowerArmL: ['DEF-forearm.L', 'forearm.L', 'LeftForeArm', 'mixamorigLeftForeArm', 'forearm_stretch.l', 'forearm.l'],
  lowerArmR: ['DEF-forearm.R', 'forearm.R', 'RightForeArm', 'mixamorigRightForeArm', 'forearm_stretch.r', 'forearm.r'],
  handL:     ['DEF-hand.L', 'hand.L', 'LeftHand', 'mixamorigLeftHand', 'hand.l'],
  handR:     ['DEF-hand.R', 'hand.R', 'RightHand', 'mixamorigRightHand', 'hand.r'],
  upperLegL: ['DEF-thigh.L', 'thigh.L', 'LeftUpLeg', 'mixamorigLeftUpLeg', 'thigh_stretch.l', 'thigh.l'],
  upperLegR: ['DEF-thigh.R', 'thigh.R', 'RightUpLeg', 'mixamorigRightUpLeg', 'thigh_stretch.r', 'thigh.r'],
  lowerLegL: ['DEF-shin.L', 'shin.L', 'LeftLeg', 'mixamorigLeftLeg', 'leg_stretch.l', 'leg.l'],
  lowerLegR: ['DEF-shin.R', 'shin.R', 'RightLeg', 'mixamorigRightLeg', 'leg_stretch.r', 'leg.r'],
  footL:     ['DEF-foot.L', 'foot.L', 'LeftFoot', 'mixamorigLeftFoot', 'foot.l'],
  footR:     ['DEF-foot.R', 'foot.R', 'RightFoot', 'mixamorigRightFoot', 'foot.r'],
  toesL:     ['DEF-toe.L', 'toe.L', 'LeftToeBase', 'mixamorigLeftToeBase', 'toes_01.l', 'toes.l'],
  toesR:     ['DEF-toe.R', 'toe.R', 'RightToeBase', 'mixamorigRightToeBase', 'toes_01.r', 'toes.r'],
  leftEye:   ['DEF-eye.L', 'eye.L', 'LeftEye', 'mixamorigLeftEye', 'eye.l', 'c_eye.l'],
  rightEye:  ['DEF-eye.R', 'eye.R', 'RightEye', 'mixamorigRightEye', 'eye.r', 'c_eye.r'],
};

/**
 * Semantic parent of each role. This is what the *skeleton* is expected to look like, not
 * what any particular export happens to contain: `BoneResolver` compares it against the
 * real bone tree, and the standing pose refuses to write a group whose links do not hold.
 *
 * Single source of truth — both the topology check and the pose gate read this map, so a
 * rig can never pass one and fail the other.
 */
export const SEMANTIC_PARENT: Partial<Record<BoneRole, BoneRole>> = {
  spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', shoulderR: 'chest',
  upperArmL: 'shoulderL', upperArmR: 'shoulderR',
  lowerArmL: 'upperArmL', lowerArmR: 'upperArmR',
  handL: 'lowerArmL', handR: 'lowerArmR',
  upperLegL: 'hips', upperLegR: 'hips',
  lowerLegL: 'upperLegL', lowerLegR: 'upperLegR',
  footL: 'lowerLegL', footR: 'lowerLegR',
  toesL: 'footL', toesR: 'footR',
  leftEye: 'head', rightEye: 'head',
};

/**
 * Limbs the standing pose writes as a unit. A rotation offset propagates down the bone
 * tree, so a group is only safe to write when every link inside it — and the link that
 * anchors it to its parent — is a real parent/child relationship in the export. Writing
 * half a group would move some meshes and leave the rest behind.
 */
export type PoseGroup = 'torso' | 'armL' | 'armR' | 'legL' | 'legR';

export const POSE_GROUPS: readonly PoseGroup[] = ['torso', 'armL', 'armR', 'legL', 'legR'] as const;

/** Which group each posed role belongs to. Roles absent here are never posed. */
export const ROLE_POSE_GROUP: Partial<Record<BoneRole, PoseGroup>> = {
  spine: 'torso', chest: 'torso', neck: 'torso',
  shoulderL: 'armL', upperArmL: 'armL', lowerArmL: 'armL', handL: 'armL',
  shoulderR: 'armR', upperArmR: 'armR', lowerArmR: 'armR', handR: 'armR',
  upperLegL: 'legL', lowerLegL: 'legL',
  upperLegR: 'legR', lowerLegR: 'legR',
};

/**
 * Links that must hold before a group may be posed. Each entry is a *child* role; the link
 * checked is the one to its {@link SEMANTIC_PARENT}. `torso` also covers what rides on the
 * torso — head, eyes, shoulders — because a spine/chest/neck offset propagates into them:
 * if the eyes (and the hair parented beside them) are not under the head, the face would
 * move while they stay put.
 */
export const POSE_GROUP_LINKS: Record<PoseGroup, readonly BoneRole[]> = {
  torso: ['spine', 'chest', 'neck', 'head', 'leftEye', 'rightEye', 'shoulderL', 'shoulderR'],
  armL: ['shoulderL', 'upperArmL', 'lowerArmL', 'handL'],
  armR: ['shoulderR', 'upperArmR', 'lowerArmR', 'handR'],
  legL: ['upperLegL', 'lowerLegL', 'footL'],
  legR: ['upperLegR', 'lowerLegR', 'footR'],
};

/** Left/right counterpart of a role, for detecting mirrored or swapped mappings. */
export const MIRRORED_ROLE: Partial<Record<BoneRole, BoneRole>> = {
  shoulderL: 'shoulderR', shoulderR: 'shoulderL',
  upperArmL: 'upperArmR', upperArmR: 'upperArmL',
  lowerArmL: 'lowerArmR', lowerArmR: 'lowerArmL',
  handL: 'handR', handR: 'handL',
  upperLegL: 'upperLegR', upperLegR: 'upperLegL',
  lowerLegL: 'lowerLegR', lowerLegR: 'lowerLegL',
  footL: 'footR', footR: 'footL',
  toesL: 'toesR', toesR: 'toesL',
  leftEye: 'rightEye', rightEye: 'leftEye',
};
