import { describe, expect, it, vi } from 'vitest';
import { deferredModule } from './deferredModule';

describe('deferred code modules', () => {
  it('shares preload and render loading, then reads synchronously without another suspension', async () => {
    let resolve!: (value: object) => void;
    const loader = vi.fn(() => new Promise<object>(done => { resolve = done; }));
    const resource = deferredModule(loader);
    expect(resource.peek()).toBeUndefined();
    const pending = resource.preload();
    expect(resource.preload()).toBe(pending);
    const component = {};
    resolve(component);
    await pending;
    expect(resource.peek()).toBe(component);
    await resource.preload();
    expect(resource.peek()).toBe(component);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed import to the error boundary instead of suspending forever', async () => {
    const error = new Error('missing chunk');
    const loader = vi.fn(() => Promise.reject(error));
    const resource = deferredModule(loader);
    await expect(resource.preload()).rejects.toBe(error);
    await expect(resource.preload()).rejects.toBe(error);
    expect(resource.peek()).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
