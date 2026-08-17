export const DESIGN_PRESENTER_SCHEMA_VERSION = 1 as const;

export interface PresenterRuntimeDiagnostics {
  schemaVersion: typeof DESIGN_PRESENTER_SCHEMA_VERSION;
  consumerCount: number;
  active: boolean;
  timerActive: boolean;
  updatedAt: number;
}

export interface DesignPresenter<TSnapshot, TCommands> {
  readonly schemaVersion: typeof DESIGN_PRESENTER_SCHEMA_VERSION;
  get(): TSnapshot;
  subscribe(listener: () => void): () => void;
  readonly commands: TCommands;
  acquire(consumerId: string): () => void;
  getDiagnostics(): PresenterRuntimeDiagnostics;
  subscribeDiagnostics(listener: () => void): () => void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

export abstract class PresenterController<TSnapshot extends { updatedAt: number }, TCommands>
  implements DesignPresenter<TSnapshot, TCommands> {
  readonly schemaVersion = DESIGN_PRESENTER_SCHEMA_VERSION;
  protected snapshot: TSnapshot;
  protected timerActive = false;
  private paused = false;
  private readonly consumers = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly diagnosticListeners = new Set<() => void>();
  private started = false;

  protected constructor(initial: TSnapshot, public commands: TCommands) {
    this.snapshot = initial;
  }

  get(): TSnapshot { return this.snapshot; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeDiagnostics(listener: () => void): () => void {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  acquire(consumerId: string): () => void {
    const id = consumerId || 'anonymous';
    this.consumers.set(id, (this.consumers.get(id) ?? 0) + 1);
    if (this.consumerCount === 1 && !this.paused) this.start();
    this.notifyDiagnostics();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = (this.consumers.get(id) ?? 1) - 1;
      if (next > 0) this.consumers.set(id, next);
      else this.consumers.delete(id);
      if (this.consumerCount === 0) this.stop();
      this.notifyDiagnostics();
    };
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (this.consumerCount > 0) {
      if (paused) this.stop();
      else this.start();
    }
    this.notifyDiagnostics();
  }

  dispose(): void {
    this.consumers.clear();
    this.stop();
    this.listeners.clear();
    this.diagnosticListeners.clear();
  }

  getDiagnostics(): PresenterRuntimeDiagnostics {
    return {
      schemaVersion: this.schemaVersion,
      consumerCount: this.consumerCount,
      active: this.started && !this.paused,
      timerActive: this.timerActive,
      updatedAt: this.snapshot.updatedAt,
    };
  }

  protected setSnapshot(next: TSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach(listener => listener());
    this.notifyDiagnostics();
  }

  protected get isPaused(): boolean { return this.paused; }
  protected get consumerCount(): number {
    return [...this.consumers.values()].reduce((sum, count) => sum + count, 0);
  }

  protected abstract onStart(): void;
  protected abstract onStop(): void;

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.onStart();
    this.notifyDiagnostics();
  }

  private stop(): void {
    if (!this.started) return;
    this.started = false;
    this.onStop();
    this.notifyDiagnostics();
  }

  private notifyDiagnostics(): void {
    this.diagnosticListeners.forEach(listener => listener());
  }
}
