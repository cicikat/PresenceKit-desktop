export interface LatestTimer {
  schedule(callback: () => void, delayMs: number): void;
  cancel(): void;
  hasPending(): boolean;
}

/**
 * A latest-wins timer slot for UI callbacks that may outlive the event which
 * scheduled them. The generation check is intentional: it protects against a
 * stale callback even when a host timer implementation invokes a cleared
 * callback late.
 */
export function createLatestTimer(): LatestTimer {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  return {
    schedule(callback, delayMs) {
      if (timerId !== null) clearTimeout(timerId);
      const scheduledGeneration = ++generation;
      const nextTimerId = setTimeout(() => {
        if (scheduledGeneration !== generation) return;
        timerId = null;
        callback();
      }, delayMs);
      timerId = nextTimerId;
    },
    cancel() {
      generation += 1;
      if (timerId !== null) clearTimeout(timerId);
      timerId = null;
    },
    hasPending() {
      return timerId !== null;
    },
  };
}
