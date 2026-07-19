import type {
  ActivityState,
  GardenSlot,
  GardenState,
  SensorRealtimeData,
  SensorRealtimeScreen,
} from './types';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeSensorScreen(value: unknown): SensorRealtimeScreen | null {
  const screen = asRecord(value);
  if (!screen) return null;
  return {
    package_name: typeof screen.package_name === 'string' ? screen.package_name : '',
    app_label: typeof screen.app_label === 'string' ? screen.app_label : '',
    window_title: typeof screen.window_title === 'string' ? screen.window_title : '',
    visible_text: stringArray(screen.visible_text),
    clickable_text: stringArray(screen.clickable_text),
  };
}

/**
 * Treat HTTP success as untrusted input. In particular, older PresenceKit
 * versions represented "no sensor sample yet" as a snapshot-shaped object
 * whose input/focus fields were null.
 */
export function normalizeSensorRealtimeResponse(value: unknown): SensorRealtimeData | null {
  const raw = asRecord(value);
  if (!raw || raw._no_data === true) return null;

  const input = asRecord(raw.input);
  const focus = asRecord(raw.focus);
  if (!input || !focus) return null;

  const ts = finiteNumber(raw.ts);
  const staleSeconds = finiteNumber(raw.stale_seconds);
  const windowSeconds = finiteNumber(raw.window_seconds);
  const keystrokes = finiteNumber(input.keystrokes);
  const mouseClicks = finiteNumber(input.mouse_clicks);
  const mouseDistance = finiteNumber(input.mouse_distance_px);
  const idleSeconds = finiteNumber(input.idle_seconds);
  const switchCount = finiteNumber(focus.switch_count);
  if (
    ts === null || staleSeconds === null || windowSeconds === null || windowSeconds <= 0
    || keystrokes === null || mouseClicks === null || mouseDistance === null
    || idleSeconds === null || switchCount === null
  ) return null;

  const presence = raw.presence === 'idle' || raw.presence === 'away' ? raw.presence : 'active';
  return {
    ts,
    stale_seconds: Math.max(0, staleSeconds),
    presence,
    continuous_at_desk_seconds: Math.max(0, finiteNumber(raw.continuous_at_desk_seconds) ?? 0),
    sensor_version: typeof raw.sensor_version === 'string' ? raw.sensor_version : '',
    window_seconds: windowSeconds,
    input: {
      keystrokes: Math.max(0, keystrokes),
      mouse_clicks: Math.max(0, mouseClicks),
      mouse_distance_px: Math.max(0, mouseDistance),
      idle_seconds: Math.max(0, idleSeconds),
    },
    focus: {
      app: typeof focus.app === 'string' ? focus.app : '',
      title_hint: typeof focus.title_hint === 'string' ? focus.title_hint : '',
      switch_count: Math.max(0, switchCount),
    },
    screen: normalizeSensorScreen(raw.screen),
  };
}

export function normalizeActivityState(value: unknown): ActivityState | null {
  const raw = asRecord(value);
  if (!raw || typeof raw.text !== 'string') return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : null,
    text: raw.text,
    arc: typeof raw.arc === 'string' ? raw.arc : '',
    started_at: finiteNumber(raw.started_at),
    next_switch_at: finiteNumber(raw.next_switch_at),
    thinking_about_eligible: raw.thinking_about_eligible === true,
  };
}

function normalizeGardenSlot(value: unknown): GardenSlot | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const requiredStrings = ['slot_key', 'flower_id', 'name', 'en_name', 'stage'] as const;
  if (requiredStrings.some(key => typeof raw[key] !== 'string')) return null;
  const growth = finiteNumber(raw.growth);
  const stageMin = finiteNumber(raw.stage_min);
  const stageMax = finiteNumber(raw.stage_max);
  const stageProgress = finiteNumber(raw.stage_progress);
  if (growth === null || stageMin === null || stageMax === null || stageProgress === null) return null;
  return {
    slot_key: raw.slot_key as string,
    flower_id: raw.flower_id as string,
    name: raw.name as string,
    en_name: raw.en_name as string,
    stage: raw.stage as string,
    growth,
    stage_min: stageMin,
    stage_max: stageMax,
    stage_progress: stageProgress,
    mood_keys: stringArray(raw.mood_keys),
    last_watered: finiteNumber(raw.last_watered),
  };
}

export function normalizeGardenState(value: unknown): GardenState | null {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.slots)) return null;
  const slots = raw.slots.map(normalizeGardenSlot);
  if (slots.some(slot => slot === null)) return null;
  return {
    slots: slots as GardenSlot[],
    harvest_count: Math.max(0, finiteNumber(raw.harvest_count) ?? 0),
    vase_count: Math.max(0, finiteNumber(raw.vase_count) ?? 0),
  };
}
