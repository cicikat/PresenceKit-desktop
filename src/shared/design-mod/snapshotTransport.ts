/** Runtime snapshot primitives kept independent from Tauri/React for testing. */

export interface SnapshotBudget {
  foregroundHz: number;
  backgroundHz: number;
}

export const DEFAULT_SNAPSHOT_BUDGET: SnapshotBudget = { foregroundHz: 20, backgroundHz: 0 };

export interface SnapshotGate {
  shouldPublish(now: number, interactive?: boolean): boolean;
  pause(): void;
  resume(now?: number): void;
  reset(now?: number): void;
  get sequence(): number;
}

export function createSnapshotGate(budget: SnapshotBudget = DEFAULT_SNAPSHOT_BUDGET, now = 0): SnapshotGate {
  let lastPublishedAt = -Infinity;
  let paused = false;
  let sequence = 0;
  const foregroundInterval = 1000 / Math.max(1, budget.foregroundHz);
  const backgroundInterval = budget.backgroundHz > 0 ? 1000 / budget.backgroundHz : Infinity;
  return {
    shouldPublish(timestamp, interactive = true) {
      if (paused) return false;
      const interval = interactive ? foregroundInterval : backgroundInterval;
      if (timestamp - lastPublishedAt < interval) return false;
      lastPublishedAt = timestamp;
      sequence += 1;
      return true;
    },
    pause() { paused = true; },
    resume(timestamp = now) { paused = false; lastPublishedAt = timestamp - foregroundInterval; },
    reset(timestamp = now) { lastPublishedAt = timestamp - foregroundInterval; sequence = 0; paused = false; },
    get sequence() { return sequence; },
  };
}

export interface SharedSampler<T> {
  get(): T | null;
  sample(force?: boolean): Promise<T>;
  invalidate(): void;
  get sampleCount(): number;
}

export function createSharedSampler<T>(read: () => Promise<T>, isStale: (value: T) => boolean = () => false): SharedSampler<T> {
  let value: T | null = null;
  let inFlight: Promise<T> | null = null;
  let sampleCount = 0;
  return {
    get: () => value,
    sample(force = false) {
      if (!force && value !== null && !isStale(value)) return Promise.resolve(value);
      if (inFlight) return inFlight;
      inFlight = read().then(next => { value = next; sampleCount += 1; return next; }).finally(() => { inFlight = null; });
      return inFlight;
    },
    invalidate() { value = null; },
    get sampleCount() { return sampleCount; },
  };
}

export interface SnapshotBatch<T> {
  sequence: number;
  frames: T[];
  payloadBytes: number;
}

export function createSnapshotBatch<T>(sequence: number, frames: readonly T[], maxPayloadBytes = 256_000): SnapshotBatch<T> {
  const accepted: T[] = [];
  let payloadBytes = 2;
  for (const frame of frames) {
    const bytes = JSON.stringify(frame).length;
    if (accepted.length > 0 && payloadBytes + bytes > maxPayloadBytes) break;
    accepted.push(frame);
    payloadBytes += bytes + 1;
  }
  return { sequence, frames: accepted, payloadBytes };
}
