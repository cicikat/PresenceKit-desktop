import { loadSensorRealtime } from '../../api/backend';
import type { SensorRealtimeData } from '../../api/types';
import { normalizeSensorRealtimeResponse } from '../../api/stateResponseNormalization';
import type { EngineState, StateEngine } from '../../state/store';
import { PresenterController } from './base';
import { MOOD_AURA_BASE, MOOD_HUE, MOOD_LABEL_EN } from './constants';
import type { StatusPresenterCommands, StatusPresenterSnapshot } from './types';
import { SharedStatePollingController, type PresenterPollingCadence } from './polling';

export const STATUS_PRESENTER_CADENCE: PresenterPollingCadence = { moodMs: 30_000, activityMs: 60_000 };
const SENSOR_INTERVAL_MS = 10_000;
const TIMELINE_INTERVAL_MS = 2_000;

export interface TelemetryInput {
  state: Pick<EngineState, 'mood' | 'focus' | 'presence'>;
  sensorData: SensorRealtimeData | null;
  sensorAvailable: boolean;
  spikeStartedAt: number;
  now: number;
}

export function deriveTelemetry(input: TelemetryInput): StatusPresenterSnapshot['telemetry'] {
  const { state, sensorData, sensorAvailable, spikeStartedAt, now } = input;
  let breath: number;
  let gazeLock: number;
  let rhythm: number;
  if (sensorAvailable && sensorData) {
    const keysPerSec = sensorData.input.keystrokes / Math.max(sensorData.window_seconds, 1);
    let nextBreath = 30 + Math.min(70, keysPerSec * 70 / 20);
    if (sensorData.presence === 'idle') nextBreath *= 0.7;
    else if (sensorData.presence === 'away') nextBreath *= 0.4;
    breath = clamp(nextBreath, 20, 100);

    const staleScore = Math.max(0, 100 - sensorData.stale_seconds * (100 / 90));
    const switchPenalty = Math.min(50, sensorData.focus.switch_count * 10);
    let nextGaze = staleScore - switchPenalty;
    if (sensorData.presence === 'idle') nextGaze *= 0.6;
    else if (sensorData.presence === 'away') nextGaze *= 0.2;
    gazeLock = clamp(nextGaze, 0, 100);

    const keystrokes = sensorData.input.keystrokes;
    const clicks = sensorData.input.mouse_clicks;
    const irregular = keystrokes + clicks > 0
      ? Math.abs(keystrokes - clicks) / (keystrokes + clicks) * 50
      : 0;
    const base = ({ '病娇': 30, '低落': 15, '分心': 10, '生气': 25, '惊讶': 20, '开心': 5, '平静': 0 } as Record<string, number>)[state.mood] ?? 0;
    const elapsed = spikeStartedAt > 0 ? now - spikeStartedAt : 6_000;
    const spike = Math.max(0, 15 * (1 - elapsed / 5_000));
    rhythm = clamp(base + irregular + spike, 0, 100);
  } else {
    let nextBreath = 50 + (({ '开心': 15, '平静': 10, '病娇': 25, '低落': -10, '分心': -5, '生气': 20, '惊讶': 15 } as Record<string, number>)[state.mood] ?? 0);
    nextBreath += ({ active: 20, idle: 0, away: -20 } as Record<string, number>)[state.presence] ?? 0;
    breath = clamp(nextBreath, 30, 100);

    let nextGaze = ({ '看你打字': 95, '看你': 90, '偷看': 70, '注意到了什么': 60, '看屏幕': 30, '想事情': 15, '发呆': 10 } as Record<string, number>)[state.focus] ?? 50;
    if (state.presence === 'idle') nextGaze *= 0.7;
    else if (state.presence === 'away') nextGaze *= 0.3;
    gazeLock = clamp(nextGaze, 0, 100);

    const base = ({ '病娇': 60, '低落': 30, '分心': 20, '生气': 50, '惊讶': 40, '开心': 5, '平静': 0 } as Record<string, number>)[state.mood] ?? 0;
    const elapsed = spikeStartedAt > 0 ? now - spikeStartedAt : 6_000;
    const spike = Math.max(0, 15 * (1 - elapsed / 5_000));
    rhythm = clamp(base + spike, 0, 100);
  }
  return {
    breath: Math.round(breath),
    gazeLock: Math.round(gazeLock),
    moodAura: MOOD_AURA_BASE[state.mood] ?? 20,
    rhythm: Math.round(rhythm),
    source: sensorAvailable && sensorData ? 'sensor' : 'derived',
    sensorAvailable,
    ...(sensorData && !sensorAvailable ? { sensorStaleSeconds: sensorData.stale_seconds } : {}),
  };
}

export function createStatusTimeline(state: Pick<EngineState, 'mood'>, now: number): StatusPresenterSnapshot['timeline'] {
  const aura = MOOD_AURA_BASE[state.mood] ?? 20;
  const hue = MOOD_HUE[state.mood] ?? 70;
  return Array.from({ length: 60 }, (_, index) => ({
    mood: state.mood,
    hue,
    aura,
    sampledAt: now - (59 - index) * TIMELINE_INTERVAL_MS,
  }));
}

export function appendStatusTimeline(
  timeline: StatusPresenterSnapshot['timeline'],
  state: Pick<EngineState, 'mood'>,
  sampledAt: number,
): StatusPresenterSnapshot['timeline'] {
  return [...timeline.slice(-59), {
    mood: state.mood,
    hue: MOOD_HUE[state.mood] ?? 70,
    aura: MOOD_AURA_BASE[state.mood] ?? 20,
    sampledAt,
  }];
}

export class StatusPresenterController extends PresenterController<StatusPresenterSnapshot, StatusPresenterCommands> {
  private readonly engineUnsubscribers: Array<() => void> = [];
  private sensorTimer: ReturnType<typeof setInterval> | null = null;
  private timelineTimer: ReturnType<typeof setInterval> | null = null;
  private run = 0;
  private sensorData: SensorRealtimeData | null = null;
  private sensorAvailable = false;
  private spikeStartedAt = 0;
  private sensorError: string | null = null;
  private previousStateKey = '';

  constructor(
    private readonly engine: StateEngine,
    private readonly statePolling: SharedStatePollingController,
    private readonly now: () => number = Date.now,
  ) {
    const state = engine.get();
    super(StatusPresenterController.snapshot(state, statePolling.get(), createStatusTimeline(state, now()), null, false, null, now()), {
      retryMood: () => statePolling.retryMood(),
      retryActivity: () => statePolling.retryActivity(),
      retrySensor: () => undefined,
    });
    this.commands.retrySensor = () => { void this.fetchSensor(this.run); };
  }

  protected onStart(): void {
    const run = ++this.run;
    this.engineUnsubscribers.push(
      this.engine.subscribe(() => this.rebuild()),
      this.statePolling.subscribe(() => this.rebuild()),
      this.statePolling.acquire('presenter.status', STATUS_PRESENTER_CADENCE),
    );
    void this.fetchSensor(run);
    this.sensorTimer = setInterval(() => { void this.fetchSensor(run); }, SENSOR_INTERVAL_MS);
    this.timelineTimer = setInterval(() => {
      const state = this.engine.get();
      this.setSnapshot({ ...this.snapshot, timeline: appendStatusTimeline(this.snapshot.timeline, state, this.now()), updatedAt: this.now() });
    }, TIMELINE_INTERVAL_MS);
    this.timerActive = true;
    this.rebuild();
  }

  protected onStop(): void {
    this.run += 1;
    this.engineUnsubscribers.splice(0).forEach(unsubscribe => unsubscribe());
    if (this.sensorTimer !== null) clearInterval(this.sensorTimer);
    if (this.timelineTimer !== null) clearInterval(this.timelineTimer);
    this.sensorTimer = null;
    this.timelineTimer = null;
    this.timerActive = false;
  }

  private async fetchSensor(run: number): Promise<void> {
    try {
      const data = normalizeSensorRealtimeResponse(await loadSensorRealtime());
      if (run !== this.run) return;
      this.sensorData = data;
      this.sensorAvailable = Boolean(data && data.stale_seconds <= 90);
      this.sensorError = data ? null : 'sensor_unavailable';
      if (data && data.stale_seconds > 90) this.sensorAvailable = false;
      this.rebuild();
    } catch (error) {
      if (run !== this.run) return;
      this.sensorData = null;
      this.sensorAvailable = false;
      this.sensorError = error instanceof Error ? error.message : String(error);
      this.rebuild();
    }
  }

  private rebuild(): void {
    const state = this.engine.get();
    const nextKey = `${state.focus}|${state.activity?.text ?? ''}`;
    if (nextKey !== this.previousStateKey) {
      this.spikeStartedAt = this.now();
      this.previousStateKey = nextKey;
    }
    const polling = this.statePolling.get();
    this.setSnapshot(StatusPresenterController.snapshot(
      state,
      polling,
      this.snapshot.timeline,
      this.sensorData,
      this.sensorAvailable,
      this.sensorError,
      this.now(),
      this.spikeStartedAt,
    ));
  }

  private static snapshot(
    state: EngineState,
    polling: { moodError: string | null; activityError: string | null },
    timeline: StatusPresenterSnapshot['timeline'],
    sensorData: SensorRealtimeData | null,
    sensorAvailable: boolean,
    sensorError: string | null,
    now: number,
    spikeStartedAt = 0,
  ): StatusPresenterSnapshot {
    return {
      schemaVersion: 1,
      mood: { id: state.mood, label: MOOD_LABEL_EN[state.mood] ?? state.mood, hue: MOOD_HUE[state.mood] ?? 70, aura: MOOD_AURA_BASE[state.mood] ?? 20 },
      activity: state.activity ? { id: state.activity.id, text: state.activity.text, arc: state.activity.arc } : null,
      presence: { id: state.presence, active: state.presence === 'active' },
      telemetry: deriveTelemetry({ state, sensorData, sensorAvailable, spikeStartedAt, now }),
      timeline,
      errors: { mood: polling.moodError, activity: polling.activityError, sensor: sensorError },
      updatedAt: now,
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
