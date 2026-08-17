import { loadActivityState, loadMoodState } from '../../api/backend';
import { classifyHttpError } from '../../api/httpError';
import { normalizeActivityState } from '../../api/stateResponseNormalization';
import { backendMoodToFrontend } from '../../state/mood-mapping';
import type { StateEngine } from '../../state/store';

export interface PresenterPollingCadence {
  moodMs: number;
  activityMs: number;
}

export interface SharedPollingSnapshot {
  moodError: string | null;
  activityError: string | null;
  updatedAt: number;
}

const DEFAULT_CADENCE: PresenterPollingCadence = { moodMs: 120_000, activityMs: 180_000 };

export class SharedStatePollingController {
  private readonly consumers = new Map<string, PresenterPollingCadence>();
  private readonly listeners = new Set<() => void>();
  private moodTimer: ReturnType<typeof setInterval> | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private moodDisabled = false;
  private activityDisabled = false;
  private paused = false;
  private run = 0;
  private snapshot: SharedPollingSnapshot = { moodError: null, activityError: null, updatedAt: Date.now() };

  constructor(private readonly engine: StateEngine, private readonly now: () => number = Date.now) {}

  get(): SharedPollingSnapshot { return this.snapshot; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  acquire(consumerId: string, cadence: PresenterPollingCadence): () => void {
    const id = consumerId || 'anonymous';
    this.consumers.set(id, cadence);
    this.reconcile();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.consumers.delete(id);
      this.reconcile();
    };
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.reconcile();
  }

  retryMood(): void {
    this.moodDisabled = false;
    void this.fetchMood(true);
  }

  retryActivity(): void {
    this.activityDisabled = false;
    void this.fetchActivity(true);
  }

  getDiagnostics(): { consumerCount: number; active: boolean; timerActive: boolean; updatedAt: number } {
    return {
      consumerCount: this.consumers.size,
      active: this.consumers.size > 0 && !this.paused,
      timerActive: this.moodTimer !== null || this.activityTimer !== null,
      updatedAt: this.snapshot.updatedAt,
    };
  }

  dispose(): void {
    this.consumers.clear();
    this.paused = false;
    this.stopTimers();
    this.listeners.clear();
  }

  private reconcile(): void {
    const shouldRun = this.consumers.size > 0 && !this.paused;
    if (!shouldRun) {
      this.stopTimers();
      return;
    }
    const cadence = [...this.consumers.values()].reduce((current, next) => ({
      moodMs: Math.min(current.moodMs, next.moodMs),
      activityMs: Math.min(current.activityMs, next.activityMs),
    }), DEFAULT_CADENCE);
    this.stopTimers();
    const currentRun = ++this.run;
    void this.fetchMood(false, currentRun);
    void this.fetchActivity(false, currentRun);
    this.moodTimer = setInterval(() => { void this.fetchMood(false, currentRun); }, cadence.moodMs);
    this.activityTimer = setInterval(() => { void this.fetchActivity(false, currentRun); }, cadence.activityMs);
    this.notify();
  }

  private stopTimers(): void {
    this.run += 1;
    if (this.moodTimer !== null) clearInterval(this.moodTimer);
    if (this.activityTimer !== null) clearInterval(this.activityTimer);
    this.moodTimer = null;
    this.activityTimer = null;
    this.notify();
  }

  private async fetchMood(manual: boolean, expectedRun = this.run): Promise<void> {
    if (!manual && this.moodDisabled) return;
    try {
      const raw = await loadMoodState();
      if (expectedRun !== this.run && !manual) return;
      this.engine.applyBackendState('mood-poll', { mood: backendMoodToFrontend(raw.current) });
      this.patch({ moodError: null });
    } catch (error) {
      if (expectedRun !== this.run && !manual) return;
      this.patch({ moodError: String(error) });
      if (!manual && classifyHttpError(error).kind === 'unauthorized') {
        this.moodDisabled = true;
        if (this.moodTimer !== null) { clearInterval(this.moodTimer); this.moodTimer = null; }
      }
    }
  }

  private async fetchActivity(manual: boolean, expectedRun = this.run): Promise<void> {
    if (!manual && this.activityDisabled) return;
    try {
      const raw = normalizeActivityState(await loadActivityState());
      if (!raw) throw new Error('活动状态响应格式无效');
      if (expectedRun !== this.run && !manual) return;
      this.engine.applyBackendState('activity-poll', {
        activity: { id: raw.id, text: raw.text, arc: raw.arc, thinkingAboutEligible: raw.thinking_about_eligible },
      });
      this.patch({ activityError: null });
    } catch (error) {
      if (expectedRun !== this.run && !manual) return;
      this.patch({ activityError: String(error) });
      if (!manual && classifyHttpError(error).kind === 'unauthorized') {
        this.activityDisabled = true;
        if (this.activityTimer !== null) { clearInterval(this.activityTimer); this.activityTimer = null; }
      }
    }
  }

  private patch(patch: Partial<SharedPollingSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, updatedAt: this.now() };
    this.notify();
  }

  private notify(): void { this.listeners.forEach(listener => listener()); }
}
