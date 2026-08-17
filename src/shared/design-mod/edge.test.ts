import { describe, expect, it } from 'vitest';
import { edgeGeometry, EdgeObserverRegistry, OrnamentGrowth, sampleEdge, samplePath } from './edge';

const snapshot = { rect: { x: -20, y: 10, width: 100, height: 40, top: 10, right: 80, bottom: 50, left: -20 }, visible: true, version: 4 };

describe('edge ornament primitives', () => {
  it('exposes directed edges, normals, dpi and negative coordinates', () => {
    const edge = edgeGeometry('page', snapshot, 1.25);
    expect(edge.edges.top.normal).toEqual({ x: 0, y: -1 });
    expect(sampleEdge(edge.edges.left, .5)).toMatchObject({ x: -20, y: 30, normal: { x: -1, y: 0 } });
    expect(edge.devicePixelRatio).toBe(1.25);
  });

  it('samples a custom path by length', () => {
    expect(samplePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], .75)).toEqual({ x: 10, y: 5 });
  });

  it('deduplicates notifications and pauses while hidden', () => {
    const registry = new EdgeObserverRegistry(); const calls: number[] = [];
    registry.observeEdge('page', edge => calls.push(edge.version));
    const edge = edgeGeometry('page', snapshot);
    registry.publish(edge); registry.publish(edge);
    registry.setPaused(true); registry.publish({ ...edge, version: 5 });
    registry.setPaused(false); registry.publish({ ...edge, version: 6, visible: false });
    registry.publish({ ...edge, version: 7 });
    expect(calls).toEqual([4, 5, 7]);
  });

  it('caps and clears session-local ornament growth', () => {
    const growth = new OrnamentGrowth(3);
    expect(growth.grow(10)).toBe(3); growth.dispose();
    expect(growth.get()).toBe(0); expect(growth.grow()).toBe(0);
  });
});
