import { getActiveCharacterInfo, subscribeActiveCharacter } from '../../activeCharacter';
import { getUIPref, removeUIPref, setUIPref } from '../../uiPreferences';
import type { StateEngine, EngineState } from '../../state/store';
import type { ToolStatusOverlayState } from '../../state/toolStatusOverlay';
import { PresenterController } from './base';
import { FOCUS_LABEL_EN, MOOD_HUE } from './constants';
import type { FlowPresenterCommands, FlowPresenterSnapshot, FlowTimelineEntry } from './types';
import { appendFlowTimeline, buildFlowNarrative, FLOW_TIMELINE_WINDOW_MS, pruneFlowTimeline } from './flowPure';
import { SharedStatePollingController, type PresenterPollingCadence } from './polling';

export const FLOW_PRESENTER_CADENCE: PresenterPollingCadence = { moodMs: 30_000, activityMs: 60_000 };
const FLOW_TICK_MS = 30_000;
const LEGACY_STORAGE_KEY = 'subflow_timeline';

export { appendFlowTimeline, buildFlowNarrative, FLOW_TIMELINE_WINDOW_MS, pruneFlowTimeline } from './flowPure';

export class FlowPresenterController extends PresenterController<FlowPresenterSnapshot, FlowPresenterCommands> {
  private readonly unsubscribers: Array<() => void> = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private run = 0;
  private characterId = getActiveCharacterInfo().id;
  private timeline: FlowTimelineEntry[] = [];
  private toolStatus: ToolStatusOverlayState | null = null;

  constructor(
    private readonly engine: StateEngine,
    private readonly statePolling: SharedStatePollingController,
    private readonly now: () => number = Date.now,
  ) {
    const state = engine.get();
    const initialTimeline = loadFlowTimeline(getActiveCharacterInfo().id, now());
    super(FlowPresenterController.snapshot(state, initialTimeline, null, getActiveCharacterInfo().id, null, now()), { refresh: () => undefined });
    this.timeline = initialTimeline;
    this.commands.refresh = () => this.refresh();
  }

  setToolStatus(status: ToolStatusOverlayState | null): void {
    this.toolStatus = status;
    this.rebuild(false);
  }

  protected onStart(): void {
    const run = ++this.run;
    this.unsubscribers.push(
      this.engine.subscribe(() => this.rebuild(true)),
      this.statePolling.subscribe(() => this.rebuild(false)),
      this.statePolling.acquire('presenter.flow', FLOW_PRESENTER_CADENCE),
      subscribeActiveCharacter(info => {
        if (info.id === this.characterId) return;
        this.characterId = info.id;
        this.timeline = loadFlowTimeline(this.characterId, this.now());
        this.rebuild(false);
      }),
    );
    this.timer = setInterval(() => this.rebuild(false), FLOW_TICK_MS);
    this.timerActive = true;
    if (run === this.run) this.rebuild(true);
  }

  protected onStop(): void {
    this.run += 1;
    this.unsubscribers.splice(0).forEach(unsubscribe => unsubscribe());
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.timerActive = false;
  }

  private refresh(): void {
    this.timeline = loadFlowTimeline(this.characterId, this.now());
    this.rebuild(true);
  }

  private rebuild(recordTimeline: boolean): void {
    const state = this.engine.get();
    const now = this.now();
    if (recordTimeline) {
      const nextTimeline = appendFlowTimeline(this.timeline, state, now);
      if (nextTimeline !== this.timeline) {
        this.timeline = nextTimeline;
        saveFlowTimeline(this.characterId, nextTimeline);
      }
    } else {
      this.timeline = pruneFlowTimeline(this.timeline, now);
    }
    const polling = this.statePolling.get();
    this.setSnapshot(FlowPresenterController.snapshot(
      state,
      this.timeline,
      this.toolStatus,
      this.characterId,
      polling.moodError || polling.activityError,
      now,
    ));
  }

  private static snapshot(
    state: EngineState,
    timeline: FlowTimelineEntry[],
    toolStatus: ToolStatusOverlayState | null,
    characterId: string,
    error: string | null,
    now: number,
  ): FlowPresenterSnapshot {
    return {
      schemaVersion: 1,
      narrative: buildFlowNarrative(state.activity, state.focus, state.presence),
      mood: { id: state.mood, hue: MOOD_HUE[state.mood] ?? 70 },
      focus: { id: state.focus, label: FOCUS_LABEL_EN[state.focus] ?? state.focus },
      presence: { id: state.presence, active: state.presence === 'active' },
      toolStatus,
      timeline,
      loading: false,
      error,
      source: toolStatus ? 'tool-overlay' : 'state-engine',
      characterId,
      updatedAt: now,
    };
  }
}

function timelineKey(characterId: string): string {
  return `subflow_timeline:${characterId || 'unassigned'}`;
}

function loadFlowTimeline(characterId: string, now: number): FlowTimelineEntry[] {
  let parsed = getUIPref<FlowTimelineEntry[] | null>(timelineKey(characterId), null);
  if (parsed === null) {
    const legacy = getUIPref<FlowTimelineEntry[] | null>(LEGACY_STORAGE_KEY, null);
    if (legacy) {
      parsed = legacy;
      setUIPref(timelineKey(characterId), parsed);
      removeUIPref(LEGACY_STORAGE_KEY);
    }
  }
  if (!parsed) return [];
  return pruneFlowTimeline(parsed, now);
}

function saveFlowTimeline(characterId: string, timeline: FlowTimelineEntry[]): void {
  setUIPref(timelineKey(characterId), timeline);
}
