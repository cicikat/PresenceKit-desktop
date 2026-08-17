import { describe, expect, it, vi } from 'vitest';
import { TransformController } from './transform';

describe('design transform controller', () => {
  it('composes every offset once and freezes motion while dragging', () => {
    const controller = new TransformController({ x: 10, y: 20 }, 'rotate(3deg)');
    controller.setMotionOffset({ x: 2, y: 3 });
    controller.setPhysicsOffset({ x: 4, y: 5 });
    controller.beginDrag();
    controller.setMotionOffset({ x: 99, y: 99 });
    controller.moveDrag({ x: 7, y: 8 });
    expect(controller.compose()).toBe('translate3d(17px, 28px, 0) rotate(3deg)');
    controller.endDrag();
    controller.setMotionOffset({ x: 1, y: 1 });
    expect(controller.compose()).toBe('translate3d(18px, 29px, 0) rotate(3deg)');
  });

  it('owns at most one pending animation frame and cleanup is idempotent', () => {
    vi.useFakeTimers();
    const request = vi.fn(() => 7);
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    try {
      const controller = new TransformController();
      const element = { style: {} } as unknown as HTMLElement;
      controller.commitFrame(element);
      controller.commitFrame(element);
      expect(request).toHaveBeenCalledTimes(1);
      controller.dispose();
      controller.dispose();
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
