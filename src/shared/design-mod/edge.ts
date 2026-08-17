import type { GeometrySnapshot } from './geometry';

export type EdgeTarget = 'page' | string;
export type EdgeDirection = 'top' | 'right' | 'bottom' | 'left';
export interface EdgePoint { x: number; y: number; }
export interface EdgeSegment { start: EdgePoint; end: EdgePoint; normal: EdgePoint; length: number; }
export interface EdgeGeometry {
  target: EdgeTarget;
  rect: GeometrySnapshot['rect'];
  edges: Record<EdgeDirection, EdgeSegment>;
  corners: { topLeft: EdgePoint; topRight: EdgePoint; bottomRight: EdgePoint; bottomLeft: EdgePoint };
  visible: boolean;
  devicePixelRatio: number;
  version: number;
}

export function edgeGeometry(target: EdgeTarget, snapshot: GeometrySnapshot, devicePixelRatio = 1): EdgeGeometry {
  const { left, top, right, bottom, width, height } = snapshot.rect;
  return {
    target,
    rect: snapshot.rect,
    visible: snapshot.visible,
    devicePixelRatio: devicePixelRatio > 0 ? devicePixelRatio : 1,
    version: snapshot.version,
    edges: {
      top: { start: { x: left, y: top }, end: { x: right, y: top }, normal: { x: 0, y: -1 }, length: width },
      right: { start: { x: right, y: top }, end: { x: right, y: bottom }, normal: { x: 1, y: 0 }, length: height },
      bottom: { start: { x: right, y: bottom }, end: { x: left, y: bottom }, normal: { x: 0, y: 1 }, length: width },
      left: { start: { x: left, y: bottom }, end: { x: left, y: top }, normal: { x: -1, y: 0 }, length: height },
    },
    corners: { topLeft: { x: left, y: top }, topRight: { x: right, y: top }, bottomRight: { x: right, y: bottom }, bottomLeft: { x: left, y: bottom } },
  };
}

export function sampleEdge(edge: EdgeSegment, progress: number): EdgePoint & { normal: EdgePoint } {
  const position = Math.max(0, Math.min(1, progress));
  return { x: edge.start.x + (edge.end.x - edge.start.x) * position, y: edge.start.y + (edge.end.y - edge.start.y) * position, normal: edge.normal };
}

export function samplePath(points: readonly EdgePoint[], progress: number): EdgePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return { ...points[0] };
  let remaining = Math.max(0, Math.min(1, progress)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index]) {
      const ratio = remaining / lengths[index];
      return { x: points[index].x + (points[index + 1].x - points[index].x) * ratio, y: points[index].y + (points[index + 1].y - points[index].y) * ratio };
    }
    remaining -= lengths[index];
  }
  return { ...points[points.length - 1] };
}

/** Deduplicates geometry notifications and pauses ornament work while hidden. */
export class EdgeObserverRegistry {
  private readonly listeners = new Map<EdgeTarget, Set<(edge: EdgeGeometry) => void>>();
  private readonly keys = new Map<EdgeTarget, string>();
  private readonly latest = new Map<EdgeTarget, EdgeGeometry>();
  private paused = false;

  observeEdge(target: EdgeTarget, listener: (edge: EdgeGeometry) => void): () => void {
    const listeners = this.listeners.get(target) ?? new Set<(edge: EdgeGeometry) => void>();
    listeners.add(listener);
    this.listeners.set(target, listeners);
    const current = this.latest.get(target);
    if (current && !this.paused && current.visible) listener(current);
    return () => { listeners.delete(listener); if (listeners.size === 0) this.listeners.delete(target); };
  }

  setPaused(paused: boolean): void {
    const resumed = this.paused && !paused;
    this.paused = paused;
    if (resumed) this.latest.forEach(edge => { if (edge.visible) this.listeners.get(edge.target)?.forEach(listener => listener(edge)); });
  }

  publish(edge: EdgeGeometry): void {
    const key = `${edge.version}:${edge.devicePixelRatio}:${edge.visible}:${edge.rect.left}:${edge.rect.top}:${edge.rect.width}:${edge.rect.height}`;
    if (this.keys.get(edge.target) === key) return;
    this.keys.set(edge.target, key);
    this.latest.set(edge.target, edge);
    if (this.paused || !edge.visible) return;
    this.listeners.get(edge.target)?.forEach(listener => listener(edge));
  }
}

/** Bounds a session-local ornament count without writing business state. */
export class OrnamentGrowth {
  private value = 0;
  private disposed = false;
  constructor(readonly cap: number) {}
  grow(amount = 1): number { if (!this.disposed) this.value = Math.min(this.cap, this.value + Math.max(0, amount)); return this.value; }
  get(): number { return this.value; }
  dispose(): void { this.disposed = true; this.value = 0; }
}
