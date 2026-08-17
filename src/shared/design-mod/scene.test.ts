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
});
