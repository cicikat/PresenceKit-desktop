import { describe, expect, it, vi } from 'vitest';
import { createNativeMotionStore, deriveNativeMotion } from './signals';

describe('native window motion conversion', () => {
  it('converts physical deltas and timestamp samples into CSS velocity', () => {
    const result = deriveNativeMotion({ x: 100, y: 50, timestamp: 1_000 }, { x: 140, y: 70, timestamp: 1_100 }, 2);
    expect(result.delta).toEqual({ x: 20, y: 10 });
    expect(result.velocity).toEqual({ x: 200, y: 100 });
    expect(result.moving).toBe(true);
  });

  it('settles moving and velocity after the native move burst ends', () => {
    vi.useFakeTimers();
    try {
      const store = createNativeMotionStore();
      store.sample(10, 10, 1_000);
      store.sample(30, 10, 1_100);
      expect(store.get().moving).toBe(true);
      vi.advanceTimersByTime(140);
      expect(store.get()).toMatchObject({ moving: false, delta: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } });
    } finally {
      vi.useRealTimers();
    }
  });
});
