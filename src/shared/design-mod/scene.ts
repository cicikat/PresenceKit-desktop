import type { DesignComponentId } from './contract';
import { samplePath, type EdgePoint } from './edge';
import type { GeometrySnapshot } from './geometry';
import { TransformController, type TransformPoint } from './transform';

export type SceneLayer = 'underlay' | 'components' | 'overlay';
export type ScenePointerMode = 'none' | 'auto';
export type SceneAnchor =
  | { kind: 'viewport'; x: number; y: number }
  | { kind: 'component'; id: DesignComponentId; x: number; y: number }
  | { kind: 'path'; points: readonly EdgePoint[]; progress: number };
export interface SceneNodeOptions {
  id: string;
  sourcePrimitive?: DesignComponentId;
  layer: SceneLayer;
  anchor: SceneAnchor;
  size?: { width?: number; height?: number; minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number };
  basePosition?: TransformPoint;
  visualTransform?: string;
  zIndex?: number;
  pointerMode?: ScenePointerMode;
  visible?: boolean;
}
export interface SceneGeometrySource {
  viewport(): { width: number; height: number };
  component(id: DesignComponentId): GeometrySnapshot | null;
}

export class SceneNode {
  readonly transform: TransformController;
  private options: SceneNodeOptions;
  private disposed = false;
  private capturedPointerId: number | null = null;

  constructor(
    private readonly element: HTMLElement,
    options: SceneNodeOptions,
    private readonly source: SceneGeometrySource,
    private readonly request: () => void,
    private readonly unregister: () => void,
  ) {
    this.options = { ...options };
    this.transform = new TransformController(options.basePosition, options.visualTransform);
    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = '0';
    this.applyStatic();
  }

  update(options: Partial<Omit<SceneNodeOptions, 'id' | 'layer'>>): void {
    if (this.disposed) return;
    this.options = { ...this.options, ...options };
    if (options.visualTransform !== undefined) this.transform.setVisualTransform(options.visualTransform);
    if (options.basePosition !== undefined) this.transform.setBasePosition(options.basePosition);
    this.applyStatic(); this.request();
  }

  setMotionOffset(offset: TransformPoint): void { if (!this.disposed) { this.transform.setMotionOffset(offset); this.request(); } }
  setPhysicsOffset(offset: TransformPoint): void { if (!this.disposed) { this.transform.setPhysicsOffset(offset); this.request(); } }
  beginDrag(): void { if (!this.disposed) { this.transform.beginDrag(); this.request(); } }
  moveDrag(offset: TransformPoint): void { if (!this.disposed) { this.transform.moveDrag(offset); this.request(); } }
  endDrag(): void { if (!this.disposed) { this.transform.endDrag(); this.request(); } }
  capturePointer(pointerId: number): void {
    if (this.disposed) return;
    this.element.setPointerCapture?.(pointerId);
    this.capturedPointerId = pointerId;
  }

  commit(): void {
    if (this.disposed) return;
    const anchor = this.resolveAnchor();
    const base = this.options.basePosition ?? { x: 0, y: 0 };
    this.transform.setBasePosition({ x: anchor.x + base.x, y: anchor.y + base.y });
    this.transform.commit(this.element);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.capturedPointerId !== null && this.element.hasPointerCapture?.(this.capturedPointerId)) this.element.releasePointerCapture?.(this.capturedPointerId);
    this.capturedPointerId = null;
    this.transform.dispose();
    this.element.remove();
    this.unregister();
  }

  private resolveAnchor(): EdgePoint {
    const { anchor } = this.options;
    if (anchor.kind === 'path') return samplePath(anchor.points, anchor.progress);
    if (anchor.kind === 'component') {
      const component = this.source.component(anchor.id);
      if (component) return { x: component.rect.left + component.rect.width * anchor.x, y: component.rect.top + component.rect.height * anchor.y };
    }
    const viewport = this.source.viewport();
    return { x: viewport.width * anchor.x, y: viewport.height * anchor.y };
  }

  private applyStatic(): void {
    const { size, zIndex = 0, pointerMode = 'none', visible = true } = this.options;
    this.element.style.zIndex = String(zIndex);
    this.element.style.pointerEvents = pointerMode === 'auto' ? 'auto' : 'none';
    this.element.style.visibility = visible ? 'visible' : 'hidden';
    if (size?.width !== undefined) this.element.style.width = `${size.width}px`;
    if (size?.height !== undefined) this.element.style.height = `${size.height}px`;
    if (size?.minWidth !== undefined) this.element.style.minWidth = `${size.minWidth}px`;
    if (size?.minHeight !== undefined) this.element.style.minHeight = `${size.minHeight}px`;
    if (size?.maxWidth !== undefined) this.element.style.maxWidth = `${size.maxWidth}px`;
    if (size?.maxHeight !== undefined) this.element.style.maxHeight = `${size.maxHeight}px`;
  }
}

/** A scene owns one on-demand animation-frame commit for all its nodes. */
export class SceneScheduler {
  private readonly nodes = new Map<string, SceneNode>();
  private frame: number | null = null;
  private disposed = false;
  constructor(private readonly source: SceneGeometrySource) {}

  create(element: HTMLElement, options: SceneNodeOptions): SceneNode {
    if (this.disposed) throw new Error('Scene scheduler is disposed');
    if (this.nodes.has(options.id)) throw new Error(`Scene node already exists: ${options.id}`);
    let node: SceneNode;
    node = new SceneNode(element, options, this.source, () => this.schedule(), () => {
      if (this.nodes.get(options.id) === node) this.nodes.delete(options.id);
    });
    this.nodes.set(options.id, node); this.schedule();
    return node;
  }

  schedule(): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.commit(); });
  }
  commit(): void { if (!this.disposed) this.nodes.forEach(node => node.commit()); }
  dispose(): void { if (this.disposed) return; this.disposed = true; if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.nodes.forEach(node => node.dispose()); this.nodes.clear(); }
}
