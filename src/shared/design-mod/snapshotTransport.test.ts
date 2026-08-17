import { describe, expect, it } from 'vitest';
import { createSharedSampler, createSnapshotBatch, createSnapshotGate } from './snapshotTransport';

describe('snapshot transport primitives', () => {
  it('limits foreground sampling to the configured budget and pauses cleanly', () => {
    const gate = createSnapshotGate({ foregroundHz: 20, backgroundHz: 0 });
    expect(gate.shouldPublish(0)).toBe(true);
    expect(gate.shouldPublish(25)).toBe(false);
    expect(gate.shouldPublish(50)).toBe(true);
    gate.pause();
    expect(gate.shouldPublish(100)).toBe(false);
    gate.resume(100);
    expect(gate.shouldPublish(100)).toBe(true);
  });

  it('deduplicates concurrent reads and reuses the shared result', async () => {
    let reads = 0;
    const sampler = createSharedSampler(async () => { reads += 1; return { value: reads }; });
    const [first, second] = await Promise.all([sampler.sample(), sampler.sample()]);
    expect(first).toEqual(second);
    expect(reads).toBe(1);
    await sampler.sample();
    expect(reads).toBe(1);
    sampler.invalidate();
    await sampler.sample();
    expect(reads).toBe(2);
  });

  it('caps a batch without splitting or duplicating frames', () => {
    const result = createSnapshotBatch(3, [{ id: 'a', text: 'x'.repeat(20) }, { id: 'b', text: 'y'.repeat(20) }], 55);
    expect(result.sequence).toBe(3);
    expect(result.frames).toHaveLength(1);
  });
});
