import { describe, expect, it } from 'vitest';
import { cropSatellitePresenterSnapshot, isFreshSatelliteSnapshot, type DesignSatelliteSnapshot } from './satellite';

const snapshot = (sequence: number, generation = 4): DesignSatelliteSnapshot => ({
  schemaVersion: 1,
  sequence,
  generation,
  modId: 'fixture',
  surfaceId: 'island',
  surface: { bounds: { x: -1920, y: 0, width: 1000, height: 800, dpi: 1.25 }, contentRect: { x: -1920, y: 0, width: 1000, height: 800, dpi: 1.25 } },
  updatedAt: sequence,
  main: { bounds: { x: -1920, y: 0, width: 1000, height: 800, dpi: 1.25 }, visible: true, focused: true, maximized: false },
  nativeWindow: { x: -1920, y: 0, delta: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, moving: false, updatedAt: sequence },
  window: { visible: true, focused: true, covered: false, paused: false },
  pointer: { x: 0, y: 0, buttons: 0, dragging: false, updatedAt: sequence },
  theme: {},
  state: {},
  chat: {},
  navigation: {},
  presenters: { status: {}, flow: {} },
  anchors: {},
});

describe('design satellite contract', () => {
  it('drops stale generations and frames', () => {
    expect(isFreshSatelliteSnapshot(snapshot(2), snapshot(2), 4, 'island')).toBe(false);
    expect(isFreshSatelliteSnapshot(snapshot(2), snapshot(3), 4, 'island')).toBe(true);
    expect(isFreshSatelliteSnapshot(snapshot(2), snapshot(4, 3), 4, 'island')).toBe(false);
    expect(isFreshSatelliteSnapshot(null, snapshot(1), 4, 'other')).toBe(false);
  });

  it('crops large presenter arrays while preserving the latest entries', () => {
    const value = { timeline: Array.from({ length: 40 }, (_, index) => ({ index })), nested: { value: 'ok' } };
    expect(cropSatellitePresenterSnapshot(value)).toMatchObject({ nested: { value: 'ok' } });
    expect((cropSatellitePresenterSnapshot(value) as { timeline: unknown[] }).timeline).toHaveLength(24);
    expect((cropSatellitePresenterSnapshot(value) as { timeline: Array<{ index: number }> }).timeline[0].index).toBe(16);
  });
});
