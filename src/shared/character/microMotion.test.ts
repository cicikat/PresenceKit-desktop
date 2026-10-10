import { describe, expect, it } from 'vitest';
import { MicroMotion } from './microMotion';
import { CHARACTER_BEHAVIOR as P } from './behaviorParameters';
function rng() { let seed = 913; return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }
describe('aperiodic upper-body accents', () => {
  it('has real pauses, independent channels, variable intervals and bounded smooth motion for two minutes', () => {
    const motion = new MicroMotion(rng());
    let rests = 0, headOnly = 0, bodyOnly = 0, prevYaw = 0, starts: number[] = [], active = false;
    for (let i = 0; i < 7200; i++) {
      const pose = motion.sample(i / 60, 'idle');
      const head = Math.abs(pose.yaw) + Math.abs(pose.pitch) > 0.002;
      const body = Math.abs(pose.bodyRoll) > 0.001;
      if (!head && !body) rests++;
      if (head && !body) headOnly++;
      if (body && !head) bodyOnly++;
      if (head && !active) starts.push(i / 60);
      active = head;
      expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(P.head.yaw);
      expect(Math.abs(pose.bodyRoll)).toBeLessThanOrEqual(P.body.roll);
      expect(Math.abs(pose.yaw - prevYaw)).toBeLessThan(0.003);
      prevYaw = pose.yaw;
    }
    expect(rests).toBeGreaterThan(1000); expect(headOnly).toBeGreaterThan(100); expect(bodyOnly).toBeGreaterThan(100);
    expect(starts.length).toBeGreaterThan(4);
    expect(new Set(starts.slice(1).map((t, i) => Math.round(t - starts[i]))).size).toBeGreaterThan(2);
  });
  it('reacts to thinking and speech and eases back without a jump when activity ends', () => {
    const motion = new MicroMotion(rng());
    let pitch = 0;
    for (let i = 0; i < 120; i++) pitch = motion.sample(i / 60, 'thinking').pitch;
    expect(pitch).toBeGreaterThan(0.03);
    const next = motion.sample(2, 'idle').pitch;
    expect(Math.abs(next - pitch)).toBeLessThan(0.004);
    for (let i = 121; i < 180; i++) motion.sample(i / 60, 'idle');
    expect(Math.abs(motion.sample(3, 'idle').pitch)).toBeLessThan(0.002);
    let peak = 0;
    for (let i = 180; i < 480; i++) peak = Math.max(peak, Math.abs(motion.sample(i / 60, 'speaking').pitch));
    expect(peak).toBeGreaterThan(0.005);
  });
});
