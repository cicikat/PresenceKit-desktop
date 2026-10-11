// Offline authored motion conversion. The TV bind rig stays untouched; exported
// tracks can then be reused by all skins through the existing MotionLibrary.
import * as THREE from 'three';
import { createRigProfile } from '../src/shared/character/rigProfile';
import { FINGER_ROLES, type BoneRole } from '../src/shared/character/humanoid';

export function bakeUAL(source: THREE.Object3D, target: THREE.Object3D, clips: THREE.AnimationClip[]) {
  const sp=createRigProfile(source),tp=createRigProfile(target);
  const position=(p:typeof sp,r:BoneRole)=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(p.joints.find(j=>j.name===p.side.names[r])!.bind));
  const forward=(p:typeof sp)=>position(p,'toesL').sub(position(p,'footL')).normalize().add(position(p,'toesR').sub(position(p,'footR')).normalize());
  const sf=forward(sp);sf.y=0;sf.normalize();
  const tf=forward(tp);tf.y=0;tf.normalize();
  const basis=new THREE.Quaternion().setFromUnitVectors(sf,tf), inverse=basis.clone().invert();
  const child:Partial<Record<BoneRole,BoneRole>>={spine:'chest',chest:'neck',neck:'head',shoulderL:'upperArmL',shoulderR:'upperArmR',upperArmL:'lowerArmL',upperArmR:'lowerArmR',lowerArmL:'handL',lowerArmR:'handR',handL:'middle1L',handR:'middle1R'};
  for(const r of FINGER_ROLES)if(!r.includes('3'))child[r]=(r.replace(/[12]([LR])$/,(_,s)=>`${Number(r.slice(-2,-1))+1}${s}`)) as BoneRole;
  const roles=(Object.keys(sp.side.names) as BoneRole[]).filter(r=>tp.side.names[r]&&!/Leg|foot|toes|Eye|hips/.test(r));
  const ref=new Map<BoneRole,THREE.Quaternion>();
  for(const r of roles){
    const q=new THREE.Quaternion().fromArray(tp.side.worldRest![r]!);const c=child[r];
    if(c&&sp.side.names[c]&&tp.side.names[c]){
      const from=position(tp,c).sub(position(tp,r)).normalize();
      const to=position(sp,c).sub(position(sp,r)).applyQuaternion(basis).normalize();
      q.premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));
    }
    ref.set(r,q);
  }
  const sourceRest=new Map<THREE.Object3D,THREE.Quaternion>();source.traverse(o=>sourceRest.set(o,o.quaternion.clone()));
  return clips.map(clip=>{
    const times=Array.from({length:Math.ceil(clip.duration*30)+1},(_,i)=>Math.min(i/30,clip.duration));
    const mixer=new THREE.AnimationMixer(source);mixer.clipAction(clip).setLoop(THREE.LoopOnce,1).play();
    const values=new Map(roles.map(r=>[r,[] as number[]]));
    for(const time of times){
      sourceRest.forEach((q,o)=>o.quaternion.copy(q));mixer.setTime(time);source.updateMatrixWorld(true);
      const desired=new Map<string,THREE.Quaternion>();
      for(const r of roles){const node=source.getObjectByName(sp.side.names[r]!)!;
        const q=node.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(sp.side.worldRest![r]!).invert());
        desired.set(tp.side.names[r]!,basis.clone().multiply(q).multiply(inverse).multiply(ref.get(r)!));
      }
      const world=new Map<string,THREE.Quaternion>();
      function targetWorld(name:string):THREE.Quaternion{
        if(world.has(name))return world.get(name)!;
        const j=tp.joints.find(j=>j.name===name)!;
        const parent=j.parent?targetWorld(j.parent):new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(j.bind).multiply(new THREE.Matrix4().fromArray(j.local).invert()));
        const q=desired.get(name)??parent.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(j.local)));
        world.set(name,q);return q;
      }
      for(const r of roles){const j=tp.joints.find(j=>j.name===tp.side.names[r])!;
        const parent=j.parent?targetWorld(j.parent):new THREE.Quaternion();
        const q=parent.clone().invert().multiply(targetWorld(j.name)).normalize(),v=values.get(r)!;
        if(v.length&&q.dot(new THREE.Quaternion().fromArray(v,v.length-4))<0)q.set(-q.x,-q.y,-q.z,-q.w);v.push(...q.toArray());
      }
    }
    mixer.stopAllAction();mixer.uncacheRoot(source);
    return {name:clip.name,duration:clip.duration,tracks:roles.map(r=>({name:tp.side.names[r]!,times,values:values.get(r)!}))};
  });
}
