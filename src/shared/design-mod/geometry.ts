export interface GeometrySnapshot {
  rect: { x: number; y: number; width: number; height: number; top: number; right: number; bottom: number; left: number };
  visible: boolean;
  version: number;
}

export function geometryFromRect(rect: Pick<DOMRect, 'x' | 'y' | 'width' | 'height' | 'top' | 'right' | 'bottom' | 'left'>, visible = true, version = 0): GeometrySnapshot {
  return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }, visible, version };
}

function hasSameGeometry(first: GeometrySnapshot | undefined, second: Omit<GeometrySnapshot, 'version'>): boolean {
  if (!first || first.visible !== second.visible) return false;
  return Object.keys(first.rect).every(key => first.rect[key as keyof GeometrySnapshot['rect']] === second.rect[key as keyof GeometrySnapshot['rect']]);
}

export class GeometryRegistry {
  private readonly mounts = new Map<string, HTMLElement>();
  private readonly snapshots = new Map<string, GeometrySnapshot>();
  private readonly dirty = new Set<string>();
  private readonly listeners = new Map<string, Set<(snapshot: GeometrySnapshot) => void>>();
  private readonly dirtyListeners = new Set<() => void>();
  private readonly observers = new Map<string, ResizeObserver>();
  private version = 0;

  register(id: string, mount: HTMLElement): () => void {
    this.mounts.set(id, mount);
    this.markDirty(id);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.markDirty(id));
      observer.observe(mount);
      this.observers.set(id, observer);
    }
    return () => {
      if (this.mounts.get(id) === mount) {
        this.mounts.delete(id);
        this.snapshots.delete(id);
        this.listeners.delete(id);
        this.observers.get(id)?.disconnect();
        this.observers.delete(id);
      }
    };
  }

  markDirty(id: string): void {
    if (!this.mounts.has(id)) return;
    this.dirty.add(id);
    this.dirtyListeners.forEach(listener => listener());
  }

  markAllDirty(): void {
    this.mounts.forEach((_mount, id) => this.dirty.add(id));
    this.dirtyListeners.forEach(listener => listener());
  }

  subscribeDirty(listener: () => void): () => void { this.dirtyListeners.add(listener); return () => this.dirtyListeners.delete(listener); }

  flush(): string[] {
    const changed = [...this.dirty];
    this.dirty.clear();
    for (const id of changed) {
      const mount = this.mounts.get(id);
      if (!mount) continue;
      const rect = mount.getBoundingClientRect();
      const next = geometryFromRect(rect, rect.width > 0 && rect.height > 0);
      const current = this.snapshots.get(id);
      if (hasSameGeometry(current, next)) continue;
      const snapshot = { ...next, version: ++this.version };
      this.snapshots.set(id, snapshot);
      this.listeners.get(id)?.forEach(listener => listener(snapshot));
    }
    return changed;
  }

  get(id: string): GeometrySnapshot | null { return this.snapshots.get(id) ?? null; }

  observe(id: string, listener: (snapshot: GeometrySnapshot) => void): () => void {
    const set = this.listeners.get(id) ?? new Set<(snapshot: GeometrySnapshot) => void>();
    set.add(listener);
    this.listeners.set(id, set);
    const current = this.snapshots.get(id);
    if (current) listener(current);
    return () => { set.delete(listener); if (set.size === 0) this.listeners.delete(id); };
  }

  dirtyIds(): string[] { return [...this.dirty]; }
}
