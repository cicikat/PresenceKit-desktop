export interface RuntimeCommandMetric { count: number; totalMs: number; maxMs: number; }
export interface RuntimeDiagnosticsSnapshot {
  enabled: boolean;
  frameCount: number;
  frameAverageMs: number;
  frameP95Ms: number;
  longTaskCount: number;
  commands: Record<string, RuntimeCommandMetric>;
  heapUsedBytes: number | null;
}

type MemoryPerformance = Performance & { memory?: { usedJSHeapSize?: number } };

export function createRuntimeDiagnostics(clock: () => number = Date.now) {
  let enabled = false;
  let windowStartedAt = clock();
  let frames: number[] = [];
  let longTaskCount = 0;
  const commands = new Map<string, RuntimeCommandMetric>();
  const prune = () => {
    const now = clock();
    if (now - windowStartedAt >= 1000) { frames = []; longTaskCount = 0; windowStartedAt = now; }
  };
  return {
    setEnabled(value: boolean) { enabled = value; },
    isEnabled: () => enabled,
    recordFrame(durationMs: number) { if (!enabled) return; prune(); frames.push(Math.max(0, durationMs)); },
    recordLongTask(durationMs: number) { if (!enabled) return; prune(); if (durationMs >= 50) longTaskCount += 1; },
    recordCommand(command: string, durationMs: number) {
      if (!enabled) return;
      const current = commands.get(command) ?? { count: 0, totalMs: 0, maxMs: 0 };
      current.count += 1; current.totalMs += Math.max(0, durationMs); current.maxMs = Math.max(current.maxMs, durationMs);
      commands.set(command, current);
    },
    measureCommand<T>(command: string, task: () => Promise<T>): Promise<T> {
      const started = clock();
      return task().finally(() => this.recordCommand(command, clock() - started));
    },
    snapshot(): RuntimeDiagnosticsSnapshot {
      prune();
      const sorted = [...frames].sort((a, b) => a - b);
      const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
      const memory = typeof performance !== 'undefined' ? (performance as MemoryPerformance).memory?.usedJSHeapSize : undefined;
      return {
        enabled,
        frameCount: sorted.length,
        frameAverageMs: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0,
        frameP95Ms: p95,
        longTaskCount,
        commands: Object.fromEntries([...commands.entries()].map(([name, metric]) => [name, { ...metric }])),
        heapUsedBytes: typeof memory === 'number' ? memory : null,
      };
    },
    reset() { frames = []; longTaskCount = 0; commands.clear(); windowStartedAt = clock(); },
  };
}

export const runtimeDiagnostics = createRuntimeDiagnostics();
