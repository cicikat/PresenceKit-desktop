export interface TransformPoint { x: number; y: number; }

export interface TransformState {
  basePosition: TransformPoint;
  dragOffset: TransformPoint;
  motionOffset: TransformPoint;
  physicsOffset: TransformPoint;
  visualTransform: string;
  dragging: boolean;
}

const ZERO: TransformPoint = Object.freeze({ x: 0, y: 0 });

function point(value: Partial<TransformPoint> = {}): TransformPoint {
  return { x: Number.isFinite(value.x) ? value.x! : 0, y: Number.isFinite(value.y) ? value.y! : 0 };
}

/**
 * Owns every positional transform for one freeform node. Callers may style a
 * visual shell, but only this controller writes the placement transform.
 */
export class TransformController {
  private state: TransformState;
  private frame: number | null = null;
  private disposed = false;

  constructor(basePosition: TransformPoint = ZERO, visualTransform = '') {
    this.state = { basePosition: point(basePosition), dragOffset: point(), motionOffset: point(), physicsOffset: point(), visualTransform, dragging: false };
  }

  get(): Readonly<TransformState> { return this.state; }

  setBasePosition(value: TransformPoint): void { this.update({ basePosition: point(value) }); }
  setVisualTransform(value: string): void { this.update({ visualTransform: value }); }
  setMotionOffset(value: TransformPoint): void { if (!this.state.dragging) this.update({ motionOffset: point(value) }); }
  setPhysicsOffset(value: TransformPoint): void { if (!this.state.dragging) this.update({ physicsOffset: point(value) }); }

  beginDrag(): void { this.update({ dragging: true, motionOffset: point(), physicsOffset: point() }); }
  moveDrag(value: TransformPoint): void { if (this.state.dragging) this.update({ dragOffset: point(value) }); }
  endDrag(): void { this.update({ dragging: false }); }

  compose(): string {
    const { basePosition, dragOffset, motionOffset, physicsOffset, visualTransform } = this.state;
    const x = basePosition.x + dragOffset.x + motionOffset.x + physicsOffset.x;
    const y = basePosition.y + dragOffset.y + motionOffset.y + physicsOffset.y;
    return `translate3d(${x}px, ${y}px, 0)${visualTransform ? ` ${visualTransform}` : ''}`;
  }

  commit(element: HTMLElement): void {
    if (!this.disposed) element.style.transform = this.compose();
  }

  commitFrame(element: HTMLElement): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.commit(element);
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.state = { ...this.state, dragOffset: point(), motionOffset: point(), physicsOffset: point(), dragging: false };
  }

  private update(patch: Partial<TransformState>): void { this.state = { ...this.state, ...patch }; }
}
