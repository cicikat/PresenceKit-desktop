import { describe, expect, it } from 'vitest';
import { GeometryRegistry, geometryFromRect } from './geometry';

describe('geometry snapshots', () => {
  it('keeps viewport rect fields and visibility separate from transforms', () => {
    expect(geometryFromRect({ x: 4, y: 5, width: 20, height: 30, top: 5, right: 24, bottom: 35, left: 4 }, true, 3)).toEqual({
      rect: { x: 4, y: 5, width: 20, height: 30, top: 5, right: 24, bottom: 35, left: 4 }, visible: true, version: 3,
    });
  });

  it('deduplicates a dirty component within the same measurement frame', () => {
    const registry = new GeometryRegistry();
    const mount = { getBoundingClientRect: () => ({ x: 0, y: 0, width: 10, height: 10, top: 0, right: 10, bottom: 10, left: 0 }) } as unknown as HTMLElement;
    registry.register('chat.header', mount);
    registry.markDirty('chat.header');
    registry.markDirty('chat.header');
    expect(registry.dirtyIds()).toEqual(['chat.header']);
    expect(registry.flush()).toEqual(['chat.header']);
    expect(registry.get('chat.header')?.version).toBe(1);
  });

  it('does not republish unchanged geometry', () => {
    const registry = new GeometryRegistry();
    const mount = { getBoundingClientRect: () => ({ x: 0, y: 0, width: 10, height: 10, top: 0, right: 10, bottom: 10, left: 0 }) } as unknown as HTMLElement;
    registry.register('chat.header', mount); registry.flush();
    let calls = 0; registry.observe('chat.header', () => { calls += 1; });
    registry.markDirty('chat.header'); registry.flush();
    expect(calls).toBe(1);
  });

  it('invalidates all mounted components for scroll and resize', () => {
    const registry = new GeometryRegistry();
    const mount = { getBoundingClientRect: () => ({ x: 0, y: 0, width: 10, height: 10, top: 0, right: 10, bottom: 10, left: 0 }) } as unknown as HTMLElement;
    registry.register('chat.header', mount);
    registry.register('chat.transcript', mount);
    registry.flush();
    registry.markAllDirty();
    expect(registry.dirtyIds()).toEqual(['chat.header', 'chat.transcript']);
  });
});
