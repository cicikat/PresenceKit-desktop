import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRigProfile, clearRigProfileCache, rigCompatibility } from './rigProfile';
import { adaptSharedMotion, clearSharedMotionCache } from './sharedMotionCache';
import type { MotionDescriptor } from './motionConfig';
import { realGlb, fixtureFs } from './realGlbFixture';
import { CharacterPerformer } from './performer';
import { MotionPlayer } from './motionPlayer';
import { filterClipTracks } from '../../windows/room/clipPlayer';

const desc: MotionDescriptor = { id: 'idle', clip: 'idle', loop: true, fadeInMs: 0, fadeOutMs: 0,
  mask: 'upper', priority: 0, rootMotion: 'inPlace', headEye: 'performer' };
function tiny() {
  const root = new THREE.Group(), hips = new THREE.Bone(), spine = new THREE.Bone(), head = new THREE.Bone();
  hips.name = 'Hips'; spine.name = 'Spine'; head.name = 'Head';
  root.add(hips); hips.add(spine); spine.add(head); hips.position.y = 1; spine.position.y = 0.3; head.position.y = 0.3;
  return { root, hips, spine, head };
}
describe('rig compatibility and cache safety', () => {
  it('same names/count with different bind orientation are not directly compatible', () => {
    const a = tiny(), b = tiny(); b.spine.rotation.z = 0.2;
    expect(rigCompatibility(createRigProfile(a.root), createRigProfile(b.root), ['spine']).kind).toBe('retarget');
  });
  it('material/skin changes reuse a successful profile, hierarchy changes invalidate it', () => {
    clearRigProfileCache(); const a = tiny(); const first = createRigProfile(a.root);
    a.root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const hair = new THREE.Bone(); hair.name = 'HairDecoration'; a.head.add(hair);
    expect(createRigProfile(a.root)).toMatchObject({ id: first.id, cacheHit: true });
    a.root.attach(a.head);
    expect(createRigProfile(a.root).errors).toContain('broken semantic chain: head');
    expect(createRigProfile(a.root).cacheHit).toBe(false);
  });
  it('an incompatible result can be repaired and retried; changed clip content invalidates adaptation', () => {
    clearSharedMotionCache(); const a = tiny(), b = tiny();
    const clip = new THREE.AnimationClip('test', 1, [new THREE.QuaternionKeyframeTrack('Spine.quaternion', [0, 1], [0,0,0,1, 0,0,0,1])]);
    const source = createRigProfile(a.root); b.root.attach(b.head);
    expect(adaptSharedMotion(clip, source, createRigProfile(b.root), desc).clip).toBeNull();
    b.spine.add(b.head); const target = createRigProfile(b.root);
    expect(adaptSharedMotion(clip, source, target, desc).clip).not.toBeNull();
    expect(adaptSharedMotion(clip, source, target, desc).cacheHit).toBe(true);
    clip.tracks[0].values[4] = 0.1;
    expect(adaptSharedMotion(clip, source, target, desc).cacheHit).toBe(false);
  });
  it('bakes animated intermediate bones across different hierarchies instead of dropping their motion', () => {
    const a = tiny(), b = tiny(), helper = new THREE.Bone(); helper.name = 'Intermediate';
    a.hips.add(helper); helper.add(a.spine);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),0.2);
    const clip = new THREE.AnimationClip('test',1,[new THREE.QuaternionKeyframeTrack('Intermediate.quaternion',[0,1],[0,0,0,1,...q.toArray()])]);
    const out = adaptSharedMotion(clip,createRigProfile(a.root),createRigProfile(b.root),desc);
    expect(out.kind).toBe('retarget');
    const mixer = new THREE.AnimationMixer(b.root); mixer.clipAction(out.clip!).play(); mixer.update(0.5);
    expect(b.spine.quaternion.clone().normalize().angleTo(new THREE.Quaternion())).toBeCloseTo(0.1,4);
    mixer.stopAllAction(); mixer.uncacheRoot(b.root);
  });
  it('missing optional fingers are reported while a compatible torso action remains playable', () => {
    const a=tiny(), b=tiny(), hand=new THREE.Bone(), thumb=new THREE.Bone();
    hand.name='LeftHand'; thumb.name='LeftHandThumb1'; a.spine.add(hand); hand.add(thumb);
    const clip=new THREE.AnimationClip('test',1,[
      new THREE.QuaternionKeyframeTrack('Spine.quaternion',[0,1],[0,0,0,1,0,0,0,1]),
      new THREE.QuaternionKeyframeTrack('LeftHandThumb1.quaternion',[0,1],[0,0,0,1,0.1,0,0,Math.sqrt(0.99)]),
    ]);
    const out=adaptSharedMotion(clip,createRigProfile(a.root),createRigProfile(b.root),desc);
    expect(out.clip).not.toBeNull(); expect(out.missingRoles).toContain('thumb1L');
  });
});

const folder = 'public/room/character/';
describe.skipIf(!['motions/tv-idle-v1.glb', 'TV_Character_Rigged_v02.glb', 'TV_Character_Rigged_v03.glb', 'full.glb'].every(f => fixtureFs.existsSync(folder + f)))('actual GLB shared motion proof', () => {
  it('audits exported rigs and shares an authored clip across two skins and an ARP-like rig', () => {
    clearRigProfileCache(); clearSharedMotionCache();
    const source = realGlb(folder + 'motions/tv-idle-v1.glb'), sp = createRigProfile(source.model);
    const rows = ['TV_Character_Rigged_v02.glb', 'TV_Character_Rigged_v03.glb', 'full.glb', 'yexuan_base_v006.glb', 'Yexuan_toon_v008.glb'].filter(f => fixtureFs.existsSync(folder + f)).map(file => {
      const target = realGlb(folder + file), profile = createRigProfile(target.model);
      const result = adaptSharedMotion(source.clips[0], sp, profile, desc);
      let replayChestAngle = 0;
      if (result.clip && profile.side.names.chest) {
        const player = new MotionPlayer(target.model, null), chest = target.model.getObjectByName(profile.side.names.chest)!;
        player.play(desc, result.clip); player.update(0.2); const first = chest.quaternion.clone().normalize();
        player.update(1); replayChestAngle = first.angleTo(chest.quaternion.clone().normalize()); player.dispose();
      }
      return { file, rigId: profile.id, convention: profile.convention, exportMode: profile.exportMode, errors: profile.errors,
        resolved: Object.keys(profile.side.names).length, missingOptional: profile.missingOptional, kind: result.kind, tracks: result.clip?.tracks.length ?? 0, reasons: result.reasons, replayChestAngle };
    });
    console.log(JSON.stringify({ source: { id: sp.id, errors: sp.errors }, rows }));
    if (fixtureFs.existsSync('.tmp')) fixtureFs.writeFileSync('.tmp/avatar-rig-audit.json', JSON.stringify({ source: sp.id, rows }, null, 2));
    expect(rows.filter(r => r.file.startsWith('TV_')).map(r => r.kind)).toEqual(['direct', 'direct']);
    expect(rows.find(r => r.file === 'full.glb')).toMatchObject({ kind: 'retarget' });
    expect(rows.find(r => r.file === 'full.glb')!.tracks).toBeGreaterThan(0);
    expect(rows.find(r => r.file === 'full.glb')!.replayChestAngle).toBeGreaterThan(1e-5);
  });
  it('two real skins share the same cached clip and produce identical joint poses', () => {
    const source = realGlb(folder + 'motions/tv-idle-v1.glb'), sp = createRigProfile(source.model);
    const a = realGlb(folder + 'TV_Character_Rigged_v02.glb'), b = realGlb(folder + 'TV_Character_Rigged_v03.glb');
    const ap = createRigProfile(a.model), bp = createRigProfile(b.model);
    const first = adaptSharedMotion(source.clips[0], sp, ap, desc), second = adaptSharedMotion(source.clips[0], sp, bp, desc);
    expect(first.clip).toBe(second.clip); expect(second.cacheHit).toBe(true);
    const players = [new MotionPlayer(a.model, null), new MotionPlayer(b.model, null)];
    players.forEach(p => p.play(desc, first.clip!));
    for (let frame=0;frame<240;frame++) {
      players.forEach(p => p.update(1/60));
      for (const name of Object.values(ap.side.names)) {
        expect(a.model.getObjectByName(name)!.quaternion.clone().normalize().angleTo(b.model.getObjectByName(name)!.quaternion.clone().normalize())).toBeLessThan(1e-6);
      }
    }
    players.forEach(p => p.dispose());
    b.model.scale.setScalar(2); b.model.rotation.y = 1; b.model.position.x = 3;
    expect(createRigProfile(b.model).id).toBe(bp.id);
  });
  it('shared/base mixers preserve breath and feet for 120 seconds; stop leaves no overlay', () => {
    const source = realGlb(folder + 'motions/tv-idle-v1.glb'), target = realGlb(folder + 'TV_Character_Rigged_v03.glb');
    const performer = new CharacterPerformer(target.model, { hasIdleClip: true });
    const adapted = adaptSharedMotion(source.clips[0], createRigProfile(source.model), performer.rigProfile, desc);
    const base = target.clips[0].clone();
    const animated = filterClipTracks(base, new Set(performer.ownedBones.filter(Boolean).map(b => b!.name)));
    const mixer = new THREE.AnimationMixer(target.model); mixer.clipAction(base).play();
    const motion = new MotionPlayer(target.model, performer); motion.play(desc, adapted.clip!);
    const feet = [performer.bones.resolved.footL!, performer.bones.resolved.footR!], chest = performer.bones.resolved.chest!;
    const footStart = feet.map(f => f.getWorldPosition(new THREE.Vector3()));
    for (let frame=0;frame<7200;frame++) {
      performer.prepareFrame(); motion.prepareFrame(); mixer.update(1/60); motion.update(1/60);
      const baseScale = chest.scale.clone();
      performer.update({ t:frame/60,now:frame*1000/60,mood:'平静',directive:null,talking:false,activity:'idle',animatedBoneNames:animated,charGroup:null,hairDrivenByPhysics:false });
      target.model.updateMatrixWorld(true);
      feet.forEach((f,i) => expect(f.getWorldPosition(new THREE.Vector3()).distanceTo(footStart[i])).toBeLessThan(1e-6));
      expect(Math.abs(chest.scale.x/baseScale.x-1)).toBeLessThanOrEqual(0.003001);
    }
    performer.prepareFrame(); motion.prepareFrame(); mixer.update(1/60);
    const basePose = chest.quaternion.clone(), baseScale = chest.scale.clone();
    motion.update(1/60); motion.stop(true);
    expect(chest.quaternion.angleTo(basePose)).toBeLessThan(1e-6); expect(chest.scale.distanceTo(baseScale)).toBeLessThan(1e-6);
    mixer.stopAllAction(); mixer.uncacheRoot(target.model);
  });
});
