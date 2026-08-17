import { getCurrentWindow } from '@tauri-apps/api/window';

export interface PointerSnapshot {
  x: number;
  y: number;
  buttons: number;
  pressed: boolean;
  dragging: boolean;
  updatedAt: number;
}

export interface ViewportSnapshot {
  width: number;
  height: number;
  devicePixelRatio: number;
  visible: boolean;
  covered: boolean;
  paused: boolean;
}

export interface NativeMotionSnapshot {
  x: number;
  y: number;
  delta: { x: number; y: number };
  velocity: { x: number; y: number };
  moving: boolean;
  updatedAt: number;
}

export interface NativeMotionSample { x: number; y: number; timestamp: number; }

export function deriveNativeMotion(previous: NativeMotionSample | null, next: NativeMotionSample, dpr = 1): NativeMotionSnapshot {
  if (!previous) {
    return { x: next.x, y: next.y, delta: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, moving: false, updatedAt: next.timestamp };
  }
  const elapsed = Math.max(1, next.timestamp - previous.timestamp);
  const delta = { x: (next.x - previous.x) / dpr, y: (next.y - previous.y) / dpr };
  const velocity = { x: delta.x / elapsed * 1000, y: delta.y / elapsed * 1000 };
  return { x: next.x, y: next.y, delta, velocity, moving: Math.abs(delta.x) + Math.abs(delta.y) > 0, updatedAt: next.timestamp };
}

export function createPointerStore() {
  let value: PointerSnapshot = { x: 0, y: 0, buttons: 0, pressed: false, dragging: false, updatedAt: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    update(next: Partial<PointerSnapshot>) { value = { ...value, ...next, updatedAt: Date.now() }; listeners.forEach(listener => listener()); },
  };
}

export const pointerStore = createPointerStore();

export function createViewportStore() {
  let value: ViewportSnapshot = { width: 0, height: 0, devicePixelRatio: 1, visible: true, covered: false, paused: false };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    update(next: Partial<ViewportSnapshot>) { value = { ...value, ...next }; listeners.forEach(listener => listener()); },
  };
}

export const viewportStore = createViewportStore();

export function createNativeMotionStore() {
  let value: NativeMotionSnapshot = { x: 0, y: 0, delta: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, moving: false, updatedAt: 0 };
  let previous: NativeMotionSample | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    sample(x: number, y: number, timestamp = Date.now(), dpr = 1) {
      const next = { x, y, timestamp };
      value = deriveNativeMotion(previous, next, dpr);
      previous = next;
      listeners.forEach(listener => listener());
    },
    reset() { previous = null; value = { x: 0, y: 0, delta: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, moving: false, updatedAt: 0 }; listeners.forEach(listener => listener()); },
  };
}

export const nativeMotionStore = createNativeMotionStore();

export async function listenNativeWindowMotion(signal: AbortSignal): Promise<() => void> {
  const window = getCurrentWindow();
  const unlisten = await window.onMoved(({ payload }) => {
    if (!signal.aborted) nativeMotionStore.sample(payload.x, payload.y, Date.now(), globalThis.devicePixelRatio || 1);
  });
  if (signal.aborted) { unlisten(); return () => {}; }
  const abort = () => unlisten();
  signal.addEventListener('abort', abort, { once: true });
  return () => { signal.removeEventListener('abort', abort); unlisten(); };
}
