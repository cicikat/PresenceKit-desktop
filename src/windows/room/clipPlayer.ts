import * as THREE from 'three';
import type { SpringChain } from './springBones';

// Track names are `<nodeName>.<property>`; nodeName itself may contain dots
// (e.g. `DEF-spine.006.quaternion`), so split on the *last* dot only.
function trackNodeName(trackName: string): string {
  const idx = trackName.lastIndexOf('.');
  return idx === -1 ? trackName : trackName.slice(0, idx);
}

// Bones owned by procedural/physics systems: their clip tracks are deleted so those
// systems keep sole, conflict-free ownership (see room-model-import-guide.md §4.6).
export function collectExcludedBoneNames(
  headBone: THREE.Bone | null,
  leftEyeBone: THREE.Bone | null,
  rightEyeBone: THREE.Bone | null,
  springChains: SpringChain[],
): Set<string> {
  const excluded = new Set<string>();
  if (headBone) excluded.add(headBone.name);
  if (leftEyeBone) excluded.add(leftEyeBone.name);
  if (rightEyeBone) excluded.add(rightEyeBone.name);
  for (const chain of springChains) {
    for (const node of chain.nodes) {
      excluded.add(node.bone.name);
      excluded.add(node.childBone.name); // covers each chain's terminal leaf bone too
    }
  }
  return excluded;
}

// Mutates clip.tracks in place, dropping tracks for excluded bones, and returns the
// node names of everything left — i.e. the bones this clip actually drives.
export function filterClipTracks(clip: THREE.AnimationClip, excludedBoneNames: Set<string>): Set<string> {
  clip.tracks = clip.tracks.filter((track) => !excludedBoneNames.has(trackNodeName(track.name)));
  const animatedBoneNames = new Set<string>();
  for (const track of clip.tracks) animatedBoneNames.add(trackNodeName(track.name));
  return animatedBoneNames;
}

// `idle` (case-insensitive) wins by default; `preferredName` (RoomSettings.idleClip) wins over that.
export function selectIdleClip(
  clips: THREE.AnimationClip[],
  preferredName?: string,
): THREE.AnimationClip | null {
  if (clips.length === 0) return null;
  if (preferredName) {
    const named = clips.find((c) => c.name.toLowerCase() === preferredName.toLowerCase());
    if (named) return named;
  }
  const idle = clips.find((c) => c.name.toLowerCase() === 'idle');
  return idle ?? clips[0];
}
