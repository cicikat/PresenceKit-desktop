import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AvatarMotionDriver } from './avatarMotionDriver';
import { CallDirectiveLayers } from '../../windows/room/callDirectiveLayers';
import { MotionPlayer } from './motionPlayer';
import type { MotionDescriptor } from './motionConfig';

describe('perform -> existing motion player', () => {
  it('sentence tilt actually rotates a bone; no repeated restart on subsequent frames', () => {
    const root = new THREE.Group(), head = new THREE.Bone(); head.name = 'Head'; root.add(head);
    const player = new MotionPlayer(root, null);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), 0.3);
    const clip = new THREE.AnimationClip('head_tilt', 1, [new THREE.QuaternionKeyframeTrack('Head.quaternion', [0,1], [0,0,0,1,...q.toArray()])]);
    const descriptor: MotionDescriptor = { id:'head_tilt',clip:'head_tilt',mask:'upper',loop:false,fadeInMs:0,fadeOutMs:0,priority:2,rootMotion:'inPlace',headEye:'clip' };
    const play = vi.fn((_id: string, weight?: number) => player.play(descriptor, clip, weight));
    const driver = new AvatarMotionDriver({ ready: id => id === 'head_tilt', play, stop: () => player.stop(), playingId: () => player.playingId });
    const layers = new CallDirectiveLayers(); layers.setSentence({ head: 'tilt_r', expression: 'happy', intensity: 0.6 }, 100);
    driver.update(100, 'speaking', layers.get(100)); player.update(0.5);
    expect(head.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.07);
    driver.update(200, 'speaking', layers.get(200)); expect(play).toHaveBeenCalledTimes(1);
    player.dispose(); expect(player.playingId).toBeNull(); expect(head.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-8);
  });
  it('reports missing resources and never randomly chooses camera interaction', () => {
    const play = vi.fn((_id: string, _weight?: number) => true), driver = new AvatarMotionDriver({ ready: () => true, play, stop: () => {}, playingId: () => null }, () => 0.9);
    for (let now = 0; now < 300000; now += 1000) driver.update(now, 'idle', null);
    expect(play.mock.calls.some(c => String(c[0]).startsWith('camera'))).toBe(false);
    expect(driver.request('camera_closeup')).toMatchObject({ ok:false, reason:'camera choreography is not installed' });
    const missing = new AvatarMotionDriver({ ready: () => false, play, stop: () => {}, playingId: () => null });
    expect(missing.request('thinking')).toMatchObject({ ok:false });
  });
  it('uses an available head tilt when thinking material is absent, and observes cooldown', () => {
    const play = vi.fn((_id: string, _weight?: number) => true), driver = new AvatarMotionDriver({ ready: id => id === 'head_tilt', play, stop: () => {}, playingId: () => null });
    driver.update(0, 'thinking', null); driver.update(100, 'idle', null); driver.update(200, 'thinking', null);
    expect(play).toHaveBeenCalledTimes(1); expect(play.mock.calls[0][0]).toBe('head_tilt');
  });
});
