import { describe, expect, it } from 'vitest';
import { anchoredLayout, wheelScale } from './layout';

describe('Live2D head-anchored layout', () => {
  it('keeps both head coordinates fixed when zooming and preserves deliberate translation', () => {
    const head = { x: 0.04, y: -0.38 };
    const base = anchoredLayout(800, 900, 2000, 1, 1, [0.1, -0.1], head);
    const zoomed = anchoredLayout(800, 900, 2000, 2.5, 1, [0.1, -0.1], head);
    expect(base.x + head.x * 2000 * base.scale).toBeCloseTo(zoomed.x + head.x * 2000 * zoomed.scale);
    expect(base.y + head.y * 2000 * base.scale).toBeCloseTo(zoomed.y + head.y * 2000 * zoomed.scale);
    const moved = anchoredLayout(800, 900, 2000, 2.5, 1, [0.2, 0], head);
    expect(moved.x - zoomed.x).toBeCloseTo(80);
    expect(moved.y - zoomed.y).toBeCloseTo(90);
  });
  it('keeps a complete head visible at 8x in a small pet window', () => {
    const head = { x: 0.04, y: -0.38, width: 0.14, height: 0.18 };
    const layout = anchoredLayout(340, 400, 2000, 1, 8, [0, 0], head);
    const h = layout.scale * 2000;
    expect(layout.y + (head.y - head.height / 2) * h).toBeGreaterThanOrEqual(8);
    expect(layout.y + (head.y + head.height / 2) * h).toBeLessThanOrEqual(392);
    expect(layout.x + (head.x - head.width / 2) * h).toBeGreaterThanOrEqual(8);
    expect(layout.x + (head.x + head.width / 2) * h).toBeLessThanOrEqual(332);
  });
  it('normalizes wheel modes and clamps rapid scrolling', () => {
    expect(wheelScale(1, -100, 0, 900)).toBeGreaterThan(1);
    expect(wheelScale(1, 1, 1, 900)).toBe(wheelScale(1, 16, 0, 900));
    expect(wheelScale(8, -1000, 0, 900)).toBe(8);
    expect(wheelScale(0.2, 1000, 0, 900)).toBe(0.2);
  });
});
