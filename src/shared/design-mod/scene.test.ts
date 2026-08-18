import { describe, expect, it, vi } from 'vitest';
import { SceneScheduler } from './scene';

describe('scene nodes', () => {
  it('anchors nodes through one scheduler and composes visual transforms', () => {
    const request = vi.fn(() => 1); vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const scheduler = new SceneScheduler({ viewport: () => ({ width: 200, height: 100 }), component: () => null });
      const element = { style: {}, remove: vi.fn() } as unknown as HTMLElement;
      const node = scheduler.create(element, { id: 'top', layer: 'overlay', anchor: { kind: 'viewport', x: .5, y: .25 }, visualTransform: 'rotate(2deg)' });
      node.setMotionOffset({ x: 2, y: 3 }); scheduler.commit();
      expect(element.style.transform).toBe('translate3d(102px, 28px, 0) rotate(2deg)');
      expect(request).toHaveBeenCalledTimes(1);
      scheduler.dispose(); expect(element.remove).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it('unregisters disposed nodes, releases pointer capture, and permits an id to be rebuilt', () => {
    const request = vi.fn(() => 1); vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const scheduler = new SceneScheduler({ viewport: () => ({ width: 200, height: 100 }), component: () => null });
      const first = { style: {}, remove: vi.fn(), setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn() } as unknown as HTMLElement;
      const second = { style: {}, remove: vi.fn() } as unknown as HTMLElement;
      const sibling = { style: {}, remove: vi.fn() } as unknown as HTMLElement;
      const options = { id: 'rebuildable', layer: 'overlay' as const, anchor: { kind: 'viewport' as const, x: .5, y: .5 } };

      const node = scheduler.create(first, options);
      scheduler.create(sibling, { id: 'survives', layer: 'overlay', anchor: { kind: 'viewport', x: 0, y: 0 } });
      node.capturePointer(7);
      node.dispose(); node.dispose();

      expect(first.releasePointerCapture).toHaveBeenCalledTimes(1);
      expect(first.remove).toHaveBeenCalledTimes(1);
      scheduler.commit();
      expect(sibling.style.transform).toBe('translate3d(0px, 0px, 0)');
      expect(() => scheduler.create(second, options)).not.toThrow();
      scheduler.dispose();
      expect(second.remove).toHaveBeenCalledTimes(1);
      expect(sibling.remove).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it('does not schedule disposed nodes or create nodes after scheduler disposal', () => {
    const request = vi.fn(() => 1); const cancel = vi.fn(); vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', cancel);
    try {
      const scheduler = new SceneScheduler({ viewport: () => ({ width: 200, height: 100 }), component: () => null });
      const element = { style: {}, remove: vi.fn() } as unknown as HTMLElement;
      const node = scheduler.create(element, { id: 'once', layer: 'overlay', anchor: { kind: 'viewport', x: 0, y: 0 } });
      node.dispose();
      const scheduledBefore = request.mock.calls.length;
      node.setMotionOffset({ x: 2, y: 3 });
      expect(request).toHaveBeenCalledTimes(scheduledBefore);

      scheduler.dispose(); scheduler.dispose();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(() => scheduler.create({ style: {}, remove: vi.fn() } as unknown as HTMLElement, { id: 'after-dispose', layer: 'overlay', anchor: { kind: 'viewport', x: 0, y: 0 } })).toThrow('Scene scheduler is disposed');
    } finally { vi.unstubAllGlobals(); }
  });
});
