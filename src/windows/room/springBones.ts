import * as THREE from 'three';

export interface SpringParams {
  stiffness: number;
  damping: number;
  gravity: number;
}

export const DEFAULT_SPRING_PARAMS: SpringParams = { stiffness: 0.15, damping: 0.85, gravity: 0.3 };

// Physics integrates on a fixed timestep so stiffness/damping keep the same felt strength
// regardless of display refresh rate (see updateSpringChains).
const FIXED_DT = 1 / 60;
const FIXED_DT2 = FIXED_DT * FIXED_DT;
const MAX_STEPS_PER_FRAME = 4;
const GRAVITY_DIR = new THREE.Vector3(0, -1, 0);

interface SpringNode {
  bone: THREE.Bone;
  childBone: THREE.Bone;
  restRotation: THREE.Quaternion;    // local rest rotation, measured at collection time
  localChildOffset: THREE.Vector3;   // child bone's rest local position (fixed, doesn't rotate with bone)
  localChildDir: THREE.Vector3;      // normalized localChildOffset, expressed in this bone's own local frame
  restChildDirParent: THREE.Vector3; // localChildDir rotated into the parent's local frame at rest (constant)
  boneLength: number;                // world-space rest distance to child, measured post normalize+pose
  prevTipWorld: THREE.Vector3;
  currTipWorld: THREE.Vector3;
}

export interface SpringChain {
  rootName: string;
  rootBone: THREE.Bone;
  nodes: SpringNode[];
  params: SpringParams;
  restApplied: boolean; // internal: true once the gravity===0 rest pose has been written for this disabled streak
}

function toNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Priority: settings.overrides[rootBone] > Blender extras (phys_*) > settings.default/code default.
function resolveChainParams(
  rootBone: THREE.Bone,
  overrides: Record<string, Partial<SpringParams>>,
  defaults: SpringParams,
): SpringParams {
  const extras = (rootBone.userData ?? {}) as Record<string, unknown>;
  const override = overrides[rootBone.name] ?? {};
  return {
    stiffness: toNumber(override.stiffness, toNumber(extras.phys_stiffness, defaults.stiffness)),
    damping:   toNumber(override.damping,   toNumber(extras.phys_damping,   defaults.damping)),
    gravity:   toNumber(override.gravity,   toNumber(extras.phys_gravity,   defaults.gravity)),
  };
}

// Re-resolve params for already-collected chains (e.g. a settings slider changed) without
// re-running collectSpringChains / losing simulated state.
export function applySpringSettings(
  chains: SpringChain[],
  overrides: Record<string, Partial<SpringParams>>,
  defaults: SpringParams,
): void {
  for (const chain of chains) {
    chain.params = resolveChainParams(chain.rootBone, overrides, defaults);
  }
}

// Single-chain collection: follow the first Bone child at each level (no branching support yet).
// `claimed` prevents overlapping chains (e.g. Rigify ORG-/DEF- both exporting phys_chain) from
// driving the same bone from two roots at once.
function collectBoneChain(rootBone: THREE.Bone, claimed: Set<THREE.Bone>): THREE.Bone[] {
  const chain: THREE.Bone[] = [rootBone];
  claimed.add(rootBone);
  let cur: THREE.Bone = rootBone;
  for (;;) {
    const next = cur.children.find((c): c is THREE.Bone => c instanceof THREE.Bone);
    if (!next) break;
    if (claimed.has(next)) {
      if (import.meta.env.DEV) console.warn('[room] phys chain overlap, truncating before:', next.name);
      break;
    }
    chain.push(next);
    claimed.add(next);
    cur = next;
  }
  return chain;
}

export function collectSpringChains(
  root: THREE.Object3D,
  overrides: Record<string, Partial<SpringParams>> = {},
  defaults: SpringParams = DEFAULT_SPRING_PARAMS,
): SpringChain[] {
  root.updateMatrixWorld(true);

  const chainRoots: THREE.Bone[] = [];
  root.traverse((obj) => {
    // Number(...) === 1 (not truthy) so a glTF-exported string "0" doesn't misfire.
    if (obj instanceof THREE.Bone && Number(obj.userData?.phys_chain) === 1) chainRoots.push(obj);
  });

  const chains: SpringChain[] = [];
  const claimed = new Set<THREE.Bone>();
  const posA = new THREE.Vector3();
  const posB = new THREE.Vector3();

  for (const rootBone of chainRoots) {
    if (claimed.has(rootBone)) {
      if (import.meta.env.DEV) console.warn('[room] phys chain overlap, skipping root:', rootBone.name);
      continue;
    }
    const bones = collectBoneChain(rootBone, claimed);
    if (bones.length < 2) continue; // single bone, nothing to swing

    const nodes: SpringNode[] = [];
    for (let i = 0; i < bones.length - 1; i++) {
      const bone = bones[i];
      const child = bones[i + 1];
      bone.getWorldPosition(posA);
      child.getWorldPosition(posB);
      const boneLength = posA.distanceTo(posB);
      if (boneLength <= 1e-6) continue; // coincident joints

      const restRotation = bone.quaternion.clone();
      const localChildOffset = child.position.clone();
      const localChildDir = localChildOffset.clone().normalize();
      nodes.push({
        bone,
        childBone: child,
        restRotation,
        localChildOffset,
        localChildDir,
        restChildDirParent: localChildDir.clone().applyQuaternion(restRotation),
        boneLength,
        prevTipWorld: posB.clone(),
        currTipWorld: posB.clone(),
      });
    }

    if (nodes.length === 0) continue;
    chains.push({
      rootName: rootBone.name,
      rootBone,
      nodes,
      params: resolveChainParams(rootBone, overrides, defaults),
      restApplied: false,
    });
  }

  return chains;
}

export function getSpringChainRootNames(chains: SpringChain[]): string[] {
  return chains.map((c) => c.rootName);
}

// Re-measure world-space boneLength / tip state against the model's current pose. Needed after
// anything that changes the model's world scale post-collection (settings scaleMul, placement
// mode scale drag) — otherwise the length constraint clamps the hair to a stale world length,
// producing stretch/compression. Resets to rest pose; physics resumes from there.
export function resetSpringChains(root: THREE.Object3D, chains: SpringChain[]): void {
  if (chains.length === 0) return;
  root.updateMatrixWorld(true);
  const posA = new THREE.Vector3();
  const posB = new THREE.Vector3();
  for (const chain of chains) {
    for (const node of chain.nodes) {
      node.bone.getWorldPosition(posA);
      node.childBone.getWorldPosition(posB);
      const len = posA.distanceTo(posB);
      if (len > 1e-6) node.boneLength = len;
      node.prevTipWorld.copy(posB);
      node.currTipWorld.copy(posB);
    }
    chain.restApplied = false;
  }
}

// ── per-frame integration ───────────────────────────────────────────────────
// Scratch objects reused across calls (single-threaded, sequential per node/frame).
const restLocalMatrix = new THREE.Matrix4();
const restWorldMatrix = new THREE.Matrix4();
const jointWorldPos = new THREE.Vector3();
const targetWorld = new THREE.Vector3();
const velocity = new THREE.Vector3();
const pull = new THREE.Vector3();
const gravityStep = new THREE.Vector3();
const nextTip = new THREE.Vector3();
const worldDirWanted = new THREE.Vector3();
const localDirWanted = new THREE.Vector3();
const parentWorldQuat = new THREE.Quaternion();
const parentWorldQuatInv = new THREE.Quaternion();
const deltaQuat = new THREE.Quaternion();

function applyRestPose(chain: SpringChain): void {
  if (chain.restApplied) return;
  for (const node of chain.nodes) {
    const parent = node.bone.parent;
    if (!parent) continue;
    node.bone.quaternion.copy(node.restRotation);
    node.bone.updateMatrix();
    node.bone.matrixWorld.multiplyMatrices(parent.matrixWorld, node.bone.matrix);

    restLocalMatrix.compose(node.bone.position, node.restRotation, node.bone.scale);
    restWorldMatrix.multiplyMatrices(parent.matrixWorld, restLocalMatrix);
    targetWorld.copy(node.localChildOffset).applyMatrix4(restWorldMatrix);
    node.prevTipWorld.copy(targetWorld);
    node.currTipWorld.copy(targetWorld);
  }
  chain.restApplied = true;
}

function stepAllChains(chains: SpringChain[], dt2: number): void {
  for (const chain of chains) {
    const { stiffness, damping, gravity } = chain.params;

    if (gravity === 0) {
      applyRestPose(chain);
      continue;
    }
    chain.restApplied = false;

    for (const node of chain.nodes) {
      const parent = node.bone.parent;
      if (!parent) continue;
      const parentMatrixWorld = parent.matrixWorld;

      // joint world position: translation only, independent of this bone's own rotation
      jointWorldPos.copy(node.bone.position).applyMatrix4(parentMatrixWorld);

      // attractor target: where the child would sit if this bone kept its rest rotation,
      // inheriting whatever the parent chain (head/gaze/micro-anim) did this frame
      restLocalMatrix.compose(node.bone.position, node.restRotation, node.bone.scale);
      restWorldMatrix.multiplyMatrices(parentMatrixWorld, restLocalMatrix);
      targetWorld.copy(node.localChildOffset).applyMatrix4(restWorldMatrix);

      // verlet integration of the simulated tip
      velocity.copy(node.currTipWorld).sub(node.prevTipWorld).multiplyScalar(damping);
      pull.copy(targetWorld).sub(node.currTipWorld).multiplyScalar(stiffness);
      gravityStep.copy(GRAVITY_DIR).multiplyScalar(gravity * dt2 * node.boneLength);
      nextTip.copy(node.currTipWorld).add(velocity).add(pull).add(gravityStep);

      // keep the tip at a constant distance from the joint (prevents stretch/drift)
      nextTip.sub(jointWorldPos);
      if (nextTip.lengthSq() > 1e-10) nextTip.setLength(node.boneLength);
      nextTip.add(jointWorldPos);

      node.prevTipWorld.copy(node.currTipWorld);
      node.currTipWorld.copy(nextTip);

      // solve this bone's local rotation from the parent->tip direction: delta between rest and
      // wanted child direction, applied on top of restRotation so the rest twist is preserved
      // (setFromUnitVectors alone gives only the minimal rotation and drops twist around the
      // child axis, which is where glTF-exported hair bones carry most of their rest orientation).
      worldDirWanted.copy(node.currTipWorld).sub(jointWorldPos).normalize();
      parent.getWorldQuaternion(parentWorldQuat);
      parentWorldQuatInv.copy(parentWorldQuat).invert();
      localDirWanted.copy(worldDirWanted).applyQuaternion(parentWorldQuatInv);
      deltaQuat.setFromUnitVectors(node.restChildDirParent, localDirWanted);
      node.bone.quaternion.copy(node.restRotation).premultiply(deltaQuat);

      // propagate this bone's matrixWorld so the next node in the chain sees the update
      node.bone.updateMatrix();
      node.bone.matrixWorld.multiplyMatrices(parentMatrixWorld, node.bone.matrix);
    }
  }
}

let accumulator = 0;

// Fixed-timestep substepping: stiffness/damping are tuned as "per 1/60s step" constants, so at
// 144Hz we'd otherwise apply them ~2.4x/sec more often than at 60Hz and hair would look stiff;
// at low framerate they'd look soft. Capped at MAX_STEPS_PER_FRAME to avoid a spiral of death
// after a stall — any backlog beyond that is dropped rather than caught up.
export function updateSpringChains(chains: SpringChain[], rawDt: number): void {
  if (chains.length === 0) return;
  accumulator += Math.min(Math.max(rawDt, 0), 0.25);
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    stepAllChains(chains, FIXED_DT2);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
}
