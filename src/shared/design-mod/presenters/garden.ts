import { loadGardenState } from '../../api/backend';
import { normalizeGardenState } from '../../api/stateResponseNormalization';
import type { StateEngine } from '../../state/store';
import { PresenterController } from './base';
import type { GardenPresenterCommands, GardenPresenterSnapshot } from './types';

const GARDEN_REFRESH_MS = 30_000;

export class GardenPresenterController extends PresenterController<GardenPresenterSnapshot, GardenPresenterCommands> {
  private timer: ReturnType<typeof setInterval> | null = null;
  private run = 0;

  constructor(private readonly engine: StateEngine, private readonly now: () => number = Date.now) {
    super({ schemaVersion: 1, garden: null, loading: true, error: null, lastUpdated: null, source: 'empty', updatedAt: now() }, { refresh: () => undefined });
    this.commands.refresh = () => { void this.refresh(); };
    void this.engine;
  }

  protected onStart(): void {
    const run = ++this.run;
    this.timer = setInterval(() => { void this.refresh(run); }, GARDEN_REFRESH_MS);
    this.timerActive = true;
    void this.refresh(run);
  }

  protected onStop(): void {
    this.run += 1;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.timerActive = false;
  }

  private async refresh(expectedRun = this.run): Promise<void> {
    this.setSnapshot({ ...this.snapshot, loading: true, error: null, updatedAt: this.now() });
    try {
      const garden = normalizeGardenState(await loadGardenState());
      if (!garden) throw new Error('花园状态响应格式无效');
      if (expectedRun !== this.run && expectedRun !== 0) return;
      const updatedAt = this.now();
      this.setSnapshot({ schemaVersion: 1, garden, loading: false, error: null, lastUpdated: updatedAt, source: 'garden-api', updatedAt });
    } catch (error) {
      if (expectedRun !== this.run && expectedRun !== 0) return;
      this.setSnapshot({ ...this.snapshot, loading: false, error: String(error), source: this.snapshot.garden ? 'garden-api' : 'empty', updatedAt: this.now() });
    }
  }
}
