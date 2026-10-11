import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MotionLibrary, setActiveMotionLibrary, requestAvatarMotion } from './motionLibrary';
import { CharacterPerformer } from './performer';
import type { MotionsConfig } from './motionConfig';
import { parseMotionsConfig } from './motionConfig';
import { fixtureFs } from './realGlbFixture';

function model() {
  const root = new THREE.Group();
  for (const n of ['DEF-spine006', 'DEF-upper_armL']) { const b = new THREE.Bone(); b.name = n; root.add(b); }
  return root;
}
describe('CA-05 motion library', () => {
  it('retargets a character-own clip, keeps head with the performer, and reports a missing clip', async () => {
    const root = model();
    const own = new THREE.AnimationClip('Wave', 1, [
      new THREE.QuaternionKeyframeTrack('DEF-upper_armL.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0.38, 0.92]),
      new THREE.QuaternionKeyframeTrack('DEF-spine006.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.2, 0, 0.98]),
    ]);
    const lib = new MotionLibrary(root, new CharacterPerformer(root), [own]);
    const cfg = parseMotionsConfig({ schemaVersion: '1.0.0', motions: [
      { id: 'wave', clip: 'Wave' }, { id: 'ghost', clip: 'Nope' },
    ] });
    if (!cfg.ok) throw new Error('parse');
    await lib.load(cfg.config, async () => null);
    expect(lib.ids()).toEqual(['wave']);
    expect(lib.status.find((s) => s.id === 'ghost')).toMatchObject({ ready: false });
    expect(lib.play('wave')).toBe(true);
    lib.update(0.5);
    expect(root.getObjectByName('DEF-upper_armL')!.quaternion.z).toBeGreaterThan(0.05);
    expect(root.getObjectByName('DEF-spine006')!.quaternion.y).toBe(0);
    lib.dispose(); expect(lib.play('wave')).toBe(false);
  });
});

const config: MotionsConfig = { schemaVersion:'1.0.0',motions:[{id:'idle',clip:'idle',file:'shared.glb',loop:true,fadeInMs:0,fadeOutMs:0,mask:'upper',priority:0,rootMotion:'inPlace',headEye:'performer'}] };
function setup() {
  const root = new THREE.Group(), hips = new THREE.Bone(), spine = new THREE.Bone(); hips.name='Hips';spine.name='Spine';root.add(hips);hips.add(spine);
  return {root, performer:new CharacterPerformer(root)};
}
describe('motion library lifecycle', () => {
  it('disposal during async load does not attach a stale action; replacement releases the old library', async () => {
    const a=setup(), old=new MotionLibrary(a.root,a.performer,[]);
    let release!: (url: string | null) => void;
    const loading=old.load(config,()=>new Promise(resolve=>{release=resolve;}));
    old.dispose(); release(null); await loading;
    expect(old.ids()).toEqual([]); expect(old.play('idle')).toBe(false);
    const b=setup(), current=new MotionLibrary(b.root,b.performer,[]); setActiveMotionLibrary(old); setActiveMotionLibrary(current);
    expect(requestAvatarMotion('camera_reach')).toMatchObject({ok:false});
    setActiveMotionLibrary(null); expect(current.play('idle')).toBe(false);
  });
  it.skipIf(!fixtureFs.existsSync('public/room/character/motions/tv-idle-v1.glb'))('production GLTFLoader parses the extracted motion-only GLB with real Bone nodes', async () => {
    const bytes=fixtureFs.readFileSync('public/room/character/motions/tv-idle-v1.glb');
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'');
    let bones=0; gltf.scene.traverse(o=>{if(o instanceof THREE.Bone)bones++;});
    expect(bones).toBe(67); expect(gltf.animations.map(c=>c.name)).toEqual(['idle']);
    const performer=new CharacterPerformer(gltf.scene,{hasIdleClip:true}), lib=new MotionLibrary(gltf.scene,performer,gltf.animations);
    await lib.load({schemaVersion:'1.0.0',motions:config.motions.map(d=>({...d,file:undefined}))}, async()=>null);
    expect(lib.status.find(s=>s.id==='idle')).toMatchObject({ready:true,compatibility:'direct'});
    lib.drivePresentation(0,'idle',null);lib.prepareFrame();lib.update(0.5);
    expect(lib.player.playingId).toBe('idle');lib.dispose();expect(lib.player.playingId).toBeNull();
  });
});
