import { describe, expect, it } from 'vitest';
import { deriveNativeMotion } from './signals';

describe('native window motion conversion', () => {
  it('converts physical deltas and timestamp samples into CSS velocity', () => {
    const result = deriveNativeMotion({ x: 100, y: 50, timestamp: 1_000 }, { x: 140, y: 70, timestamp: 1_100 }, 2);
    expect(result.delta).toEqual({ x: 20, y: 10 });
    expect(result.velocity).toEqual({ x: 200, y: 100 });
    expect(result.moving).toBe(true);
  });
});
