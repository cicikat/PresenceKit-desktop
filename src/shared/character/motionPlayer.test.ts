import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MotionPlayer } from './motionPlayer';
import { CharacterPerformer } from './performer';
import type { MotionDescriptor } from './motionConfig';

function setup() {
  const root = new THREE.Group();
  for (const n of ['DEF-spine006', 'Arm']) { const b = new THREE.Bone(); b.name = n; root.add(b); }
  const performer = new CharacterPerformer(root);
  return { root, performer, player: new MotionPlayer(root, performer) };
}
const desc = (over: Partial<MotionDescriptor> = {}): MotionDescriptor => ({
  id: 'wave', clip: 'Wave', loop: false, fadeInMs: 0, fadeOutMs: 0, mask: 'full', priority: 0,
  rootMotion: 'inPlace', headEye: 'performer', ...over,
});
const clip = () => new THREE.AnimationClip('Wave', 1, [
  new THREE.VectorKeyframeTrack('Arm.position', [0, 1], [0, 0, 0, 0, 1, 0]),
]);

describe('CA-05 motion player', () => {
  it('freezes authored time and fades during pause, resumes and can fade back to idle', () => {
    const { root, player } = setup();
    player.play(desc({loop:true,fadeInMs:1000,fadeOutMs:200}),clip());
    player.update(0.4);
    const y = root.getObjectByName('Arm')!.position.y;
    player.setPaused(true); player.update(2);
    expect(root.getObjectByName('Arm')!.position.y).toBeCloseTo(y, 6);
    player.setPaused(false); player.update(0.1);
    expect(root.getObjectByName('Arm')!.position.y).toBeGreaterThan(y);
    player.setPaused(true); player.stop(); player.update(0.3);
    expect(player.playingId).toBeNull();
  });
  it('an out-of-frame stop clears procedural snapshots before restoring the current base', () => {
    const root=new THREE.Group(); const chain=['Hips','Spine','Chest','Neck','Head'].map(name=>{const b=new THREE.Bone();b.name=name;return b;});
    root.add(chain[0]); chain.slice(1).forEach((b,i)=>chain[i].add(b));
    const performer=new CharacterPerformer(root,{hasIdleClip:true}), player=new MotionPlayer(root,performer), chest=chain[2];
    const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),0.2);
    const action=new THREE.AnimationClip('wave',1,[new THREE.QuaternionKeyframeTrack('Chest.quaternion',[0,1],[...q.toArray(),...q.toArray()])]);
    player.play(desc({loop:true}),action); player.prepareFrame(); player.update(0.5);
    performer.update({t:1,now:1000,mood:'平静',directive:null,talking:false,activity:'idle',animatedBoneNames:new Set(['Chest']),charGroup:null,hairDrivenByPhysics:false});
    player.stop(true); performer.prepareFrame();
    expect(chest.quaternion.clone().normalize().angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
    expect(chest.scale.distanceTo(new THREE.Vector3(1,1,1))).toBeLessThan(1e-6);
    expect(chest.position.length()).toBeLessThan(1e-6);
  });
  it('plays a one-shot to the end, then releases', () => {
    const { root, player } = setup();
    expect(player.play(desc(), clip())).toBe(true);
    player.update(0.5);
    expect(root.getObjectByName('Arm')!.position.y).toBeCloseTo(0.5, 1);
    player.update(0.6);
    player.update(0.1);
    expect(player.playingId).toBeNull();
  });
  it('restores the bones it moved when the motion ends', () => {
    const { root, player } = setup();
    const arm = root.getObjectByName('Arm')!;
    player.play(desc(), clip());
    player.update(0.9);
    expect(arm.position.y).toBeGreaterThan(0.5);
    player.stop(true);
    expect(arm.position.y).toBe(0);
  });
  it('lets a higher-priority motion replace and rejects a lower one', () => {
    const { player } = setup();
    player.play(desc({ id: 'a', priority: 5, loop: true }), clip());
    expect(player.play(desc({ id: 'b', priority: 1 }), clip())).toBe(false);
    expect(player.playingId).toBe('a');
    expect(player.play(desc({ id: 'c', priority: 9 }), clip())).toBe(true);
    expect(player.playingId).toBe('c');
  });
  it('makes the performer yield head/eyes only while a clip-owned motion plays', () => {
    const { performer, player } = setup();
    const owned = () => performer.ownedBones.filter(Boolean).length;
    const before = owned();
    expect(before).toBeGreaterThan(0);
    player.play(desc({ headEye: 'clip', loop: true }), clip());
    expect(owned()).toBe(0);
    player.stop(true);
    expect(owned()).toBe(before);
  });
  it('does not touch ownership for performer-owned motions', () => {
    const { performer, player } = setup();
    const before = performer.ownedBones.filter(Boolean).length;
    player.play(desc({ loop: true }), clip());
    expect(performer.ownedBones.filter(Boolean).length).toBe(before);
    player.dispose();
  });
});
