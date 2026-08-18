import { describe, expect, it } from 'vitest';
import {
  createStatusHookStyle,
  STATUS_CSS_VARIABLES,
  STATUS_RENDERER_CONTRACT,
  STATUS_SUBREGION_IDS,
} from './statusRendererContract';

const snapshot = {
  schemaVersion: 1 as const,
  mood: { id: 'calm', label: 'Calm', hue: 170, aura: 24 },
  activity: null,
  presence: { id: 'active', active: true },
  telemetry: { breath: 61, gazeLock: 74, moodAura: 54, rhythm: 18, source: 'derived' as const, sensorAvailable: false },
  timeline: [],
  errors: { mood: null, activity: null, sensor: null },
  updatedAt: 123,
};

describe('Status renderer contract', () => {
  it('maps every official DOM region to exactly one child primitive', () => {
    expect(STATUS_RENDERER_CONTRACT.parentId).toBe('chat.sidebar.status');
    expect(STATUS_RENDERER_CONTRACT.subregions.mood.regions).toEqual(['mood']);
    expect(STATUS_RENDERER_CONTRACT.subregions.activity.regions).toEqual(['activity', 'presence']);
    expect(STATUS_RENDERER_CONTRACT.subregions.timeline.regions).toEqual(['telemetry', 'timeline']);
    expect(new Set(Object.values(STATUS_RENDERER_CONTRACT.subregions).flatMap(region => region.regions)).size).toBe(5);
  });

  it('freezes the ownership behavior for all three composition modes', () => {
    expect(STATUS_RENDERER_CONTRACT.composition['official-renderer']).toEqual({
      attach: ['chat.sidebar.status'],
      fallback: 'whole-status',
    });
    expect(STATUS_RENDERER_CONTRACT.composition.subregions.attach).toEqual(Object.values(STATUS_SUBREGION_IDS));
    expect(STATUS_RENDERER_CONTRACT.composition.subregions.fallback).toBe('unattached-child');
    expect(STATUS_RENDERER_CONTRACT.composition['presenter-only']).toEqual({ attach: [], fallback: 'presenter-owned' });
  });

  it('creates mount-local hook values directly from the presenter snapshot', () => {
    const style = createStatusHookStyle(snapshot);

    expect(Object.keys(style)).toEqual([...STATUS_CSS_VARIABLES]);
    expect(style['--status-mood-hue']).toBe('170');
    expect(style['--status-aura']).toBe('54');
    expect(style['--status-breath']).toBe('61');
    expect(style['--status-indicator-size']).toBe('11px');
    expect(style['--status-glow-x']).toBe('75%');
    expect(style['--status-glow-y']).toBe('25%');
    expect(Object.values(style).every(value => value !== 'inherit')).toBe(true);
  });

  it('keeps hook values valid when an older or malformed snapshot omits numbers', () => {
    const style = createStatusHookStyle({
      ...snapshot,
      mood: { ...snapshot.mood, hue: Number.NaN },
      telemetry: { ...snapshot.telemetry, moodAura: undefined as never, breath: Number.NaN, gazeLock: undefined as never, rhythm: Number.NaN },
    });

    expect(style).toMatchObject({
      '--status-mood-hue': '70',
      '--status-aura': '20',
      '--status-breath': '50',
      '--status-gaze-lock': '50',
      '--status-rhythm': '0',
      '--status-indicator-size': `${8 + 20 / 18}px`,
    });
    expect(Object.values(style).every(value => !value.includes('undefined') && !value.includes('NaN'))).toBe(true);
  });
});
