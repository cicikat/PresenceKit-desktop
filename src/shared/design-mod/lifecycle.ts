export interface ActivationContext {
  generation: number;
  signal: AbortSignal;
}
export class DesignModLifecycle {
  private generation = 0;
  private controller: AbortController | null = null;
  private disposer: (() => void) | null = null;

  async activate(
    activateFn: (context: ActivationContext) => void | (() => void) | Promise<void | (() => void)>,
    onError?: (error: unknown) => void,
  ): Promise<boolean> {
    this.dispose();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const maybeDisposer = await activateFn({ generation, signal: controller.signal });
      if (generation !== this.generation || controller.signal.aborted) {
        if (typeof maybeDisposer === 'function') maybeDisposer();
        return false;
      }
      this.disposer = typeof maybeDisposer === 'function' ? maybeDisposer : null;
      return true;
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted) onError?.(error);
      return false;
    }
  }

  dispose(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    const disposer = this.disposer;
    this.disposer = null;
    disposer?.();
  }

  get activeGeneration(): number { return this.generation; }
}

export interface DesignModHostLedger {
  add(cleanup: () => void): () => void;
  size(): number;
  clear(): void;
}

export function createDesignModHostLedger(): DesignModHostLedger {
  const cleanups = new Set<() => void>();
  return {
    add(cleanup) { cleanups.add(cleanup); return () => cleanups.delete(cleanup); },
    size: () => cleanups.size,
    clear() { for (const cleanup of [...cleanups]) cleanup(); cleanups.clear(); },
  };
}
