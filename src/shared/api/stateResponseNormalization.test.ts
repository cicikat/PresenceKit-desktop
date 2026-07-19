import { describe, expect, it } from 'vitest';
import {
  normalizeActivityState,
  normalizeGardenState,
  normalizeSensorRealtimeResponse,
} from './stateResponseNormalization';

const sensorSnapshot = {
  ts: 123,
  stale_seconds: 2,
  presence: 'active',
  continuous_at_desk_seconds: 30,
  sensor_version: 'test',
  window_seconds: 30,
  input: { keystrokes: 4, mouse_clicks: 2, mouse_distance_px: 20, idle_seconds: 0 },
  focus: { app: 'Code.exe', title_hint: '', switch_count: 1 },
  screen: null,
};

describe('normalizeSensorRealtimeResponse', () => {
  it('accepts a complete snapshot', () => {
    expect(normalizeSensorRealtimeResponse(sensorSnapshot)?.input.keystrokes).toBe(4);
  });

  it('treats the explicit marker as no data', () => {
    expect(normalizeSensorRealtimeResponse({ _no_data: true })).toBeNull();
  });

  it('treats the legacy null-filled first-run response as no data', () => {
    expect(normalizeSensorRealtimeResponse({
      ts: null,
      stale_seconds: null,
      window_seconds: null,
      input: null,
      focus: null,
    })).toBeNull();
  });

  it('rejects incomplete HTTP 200 shapes before render code can dereference them', () => {
    expect(normalizeSensorRealtimeResponse({ ...sensorSnapshot, input: {} })).toBeNull();
  });
});

describe('normalizeActivityState', () => {
  it('turns a nullable legacy arc into a display-safe empty string', () => {
    expect(normalizeActivityState({ text: '在看书', arc: null }))
      .toMatchObject({ id: null, text: '在看书', arc: '', thinking_about_eligible: false });
  });

  it('rejects a missing activity text', () => {
    expect(normalizeActivityState({ arc: 'ordinary' })).toBeNull();
  });
});

describe('normalizeGardenState', () => {
  it('rejects a non-array slots value instead of letting the panel call map on it', () => {
    expect(normalizeGardenState({ slots: {}, harvest_count: 0, vase_count: 0 })).toBeNull();
  });
});
