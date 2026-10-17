/** Window-local artistic preview; never sends actions to another window or the backend. */
export interface StageControls {
  model: string;
  expressions: string[];
  motions: string[];
  actions: string[];
  playExpression: (name: string | null) => void;
  playMotion: (file: string) => void;
  playAction: (name: string) => void;
  stop: () => void;
}
let current: StageControls | null = null;
const listeners = new Set<() => void>();
export function getStageControls(): StageControls | null { return current; }
export function subscribeStageControls(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function registerStageControls(controls: StageControls): () => void {
  current = controls;
  listeners.forEach(listener => listener());
  return () => {
    if (current !== controls) return;
    current = null;
    listeners.forEach(listener => listener());
  };
}
