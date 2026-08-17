import { describe, expect, it } from 'vitest';
import { appendStatusTimeline, createStatusTimeline, deriveTelemetry } from './status';

describe('status presenter derived telemetry', () => {
  const state = { mood: '平静', focus: '看你', presence: 'active' } as const;

  it('reports sensor source and clamps signal ranges', () => {
    const telemetry = deriveTelemetry({
      state,
      sensorAvailable: true,
      sensorData: { input: { keystrokes: 1000, mouse_clicks: 0 }, window_seconds: 1, presence: 'active', focus: { switch_count: 0 }, stale_seconds: 0 } as any,
      spikeStartedAt: 0,
      now: 1_000,
    });
    expect(telemetry.source).toBe('sensor');
    expect(telemetry.breath).toBeLessThanOrEqual(100);
    expect(telemetry.gazeLock).toBeGreaterThanOrEqual(0);
    expect(telemetry.rhythm).toBeLessThanOrEqual(100);
  });

  it('keeps sampledAt keys in the ring buffer', () => {
    const initial = createStatusTimeline({ mood: '平静' }, 120_000);
    const next = appendStatusTimeline(initial, { mood: '开心' }, 122_000);
    expect(next).toHaveLength(60);
    expect(next[next.length - 1]).toMatchObject({ mood: '开心', sampledAt: 122_000 });
    expect(next[0].sampledAt).toBe(4_000);
  });
});
