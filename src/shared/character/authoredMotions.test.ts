import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fixtureFs, realGlb } from './realGlbFixture';
import { createRigProfile } from './rigProfile';
import { adaptSharedMotion } from './sharedMotionCache';
import { parseMotionsConfig } from './motionConfig';
import { MotionPlayer } from './motionPlayer';

const asset='public/room/character/motions/quaternius-tv-v1.glb';
describe('real UAL derived clips (local private TV fixture)',()=>{
  it.skipIf(!fixtureFs.existsSync(asset))('plays authored crossing and talking; shared v02/v03 preserve feet and restore',()=>{
    const source=realGlb(asset),profile=createRigProfile(source.model);
    const config=parseMotionsConfig(JSON.parse(fixtureFs.readFileSync('public/room/character/motions/library.json').subarray(0).toString()));
    if(config.ok === false)throw new Error(config.errors.join(';'));
    for(const file of ['TV_Character_Rigged_v02.glb','TV_Character_Rigged_v03.glb']){
      const target=realGlb('public/room/character/'+file),tp=createRigProfile(target.model);
      for(const id of ['arms_crossed','talking']){
        const d=config.config.motions.find(d=>d.id===id)!;
        const input=source.clips.find(c=>c.name===d.clip)!;
        expect(input.tracks.length).toBeGreaterThan(20);
        expect(input.tracks.some(t=>Array.from(t.values).some((v,i)=>i>=4&&Math.abs(v-t.values[i%4])>.005))).toBe(true);
        const result=adaptSharedMotion(input,profile,tp,d);expect(result.clip).not.toBeNull();
        const feet=['footL','footR'].map(r=>target.model.getObjectByName(tp.side.names[r as 'footL'|'footR']!)!);
        const before=feet.map(b=>b.getWorldPosition(new THREE.Vector3()));
        const player=new MotionPlayer(target.model,null);player.play({...d,fadeInMs:0},result.clip!);player.update(1);
        target.model.updateMatrixWorld(true);
        feet.forEach((b,i)=>expect(b.getWorldPosition(new THREE.Vector3()).distanceTo(before[i])).toBeLessThan(1e-7));
        if(id==='arms_crossed'){
          const hands=['handL','handR'].map(r=>target.model.getObjectByName(tp.side.names[r as 'handL'|'handR']!)!.getWorldPosition(new THREE.Vector3()));
          expect(hands[0].x).toBeLessThan(hands[1].x); // crossed to the opposite sides
          hands.forEach(h=>expect(h.z).toBeGreaterThan(.08)); // in front, never behind the back
        }
        player.stop(true);target.model.updateMatrixWorld(true);
        feet.forEach((b,i)=>expect(b.getWorldPosition(new THREE.Vector3()).distanceTo(before[i])).toBeLessThan(1e-7));
      }
    }
  });
});
