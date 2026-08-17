export type WindowLifecycleState = 'closed' | 'opening' | 'open' | 'visible' | 'hidden' | 'destroyed' | 'error';

export interface WindowLifecycleError {
  code: 'open_failed' | 'show_failed' | 'hide_failed' | 'destroy_failed' | 'stale_generation';
  label: string;
  generation: number;
  cause: unknown;
}

export interface WindowLifecycleAdapter {
  open(label: string, generation: number): Promise<void>;
  show(label: string): Promise<void>;
  hide(label: string): Promise<void>;
  destroy(label: string): Promise<void>;
}

export interface WindowCoordinator {
  state(label: string): WindowLifecycleState;
  generation(label: string): number;
  open(label: string): Promise<void>;
  show(label: string): Promise<void>;
  hide(label: string): Promise<void>;
  destroy(label: string): Promise<void>;
  retry(label: string): Promise<void>;
  subscribe(listener: (label: string, state: WindowLifecycleState, error?: WindowLifecycleError) => void): () => void;
}

export function createWindowCoordinator(adapter: WindowLifecycleAdapter): WindowCoordinator {
  const states = new Map<string, WindowLifecycleState>();
  const generations = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();
  const listeners = new Set<(label: string, state: WindowLifecycleState, error?: WindowLifecycleError) => void>();
  const publish = (label: string, state: WindowLifecycleState, error?: WindowLifecycleError) => { states.set(label, state); listeners.forEach(listener => listener(label, state, error)); };
  const run = (label: string, operation: 'open' | 'show' | 'hide' | 'destroy'): Promise<void> => {
    const currentState = states.get(label);
    if (operation === 'open' && (currentState === 'open' || currentState === 'visible' || currentState === 'hidden')) return Promise.resolve();
    if (operation === 'show' && currentState === 'visible') return Promise.resolve();
    if (operation === 'hide' && (currentState === 'hidden' || currentState === 'closed')) return Promise.resolve();
    if (operation === 'destroy' && (currentState === 'destroyed' || currentState === 'closed')) return Promise.resolve();
    const pending = inFlight.get(`${label}:${operation}`);
    if (pending) return pending;
    const generation = (generations.get(label) ?? 0) + (operation === 'open' ? 1 : 0);
    if (operation === 'open') generations.set(label, generation);
    const task = (async () => {
      try {
        if (operation === 'open') { publish(label, 'opening'); await adapter.open(label, generation); publish(label, 'open'); }
        else {
          const current = generations.get(label) ?? generation;
          if (current !== generation && operation !== 'destroy') throw { code: 'stale_generation', label, generation, cause: null } satisfies WindowLifecycleError;
          await adapter[operation](label);
          publish(label, operation === 'show' ? 'visible' : operation === 'hide' ? 'hidden' : 'destroyed');
        }
      } catch (cause) {
        const code = operation === 'open' ? 'open_failed' : `${operation}_failed` as WindowLifecycleError['code'];
        const error: WindowLifecycleError = cause && typeof cause === 'object' && 'code' in cause ? cause as WindowLifecycleError : { code, label, generation, cause };
        publish(label, 'error', error);
        throw error;
      } finally { inFlight.delete(`${label}:${operation}`); }
    })();
    inFlight.set(`${label}:${operation}`, task);
    return task;
  };
  return {
    state: label => states.get(label) ?? 'closed',
    generation: label => generations.get(label) ?? 0,
    open: label => run(label, 'open'),
    show: label => run(label, 'show'),
    hide: label => run(label, 'hide'),
    destroy: label => run(label, 'destroy'),
    retry: async label => { await run(label, 'open'); await run(label, 'show'); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
