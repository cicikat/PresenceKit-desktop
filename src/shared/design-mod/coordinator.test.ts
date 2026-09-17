import { describe, expect, it, vi } from 'vitest';
import { DesignRuntimeCoordinator } from './coordinator';

describe('Design runtime coordinator', () => {
  it('does not resurrect a pending package load after StrictMode remount', () => {
    const coordinator = new DesignRuntimeCoordinator();
    const oldLoad = coordinator.beginActivation();
    coordinator.unmount();
    coordinator.cleanup();
    coordinator.mount();
    expect(oldLoad()).toBe(false);
    expect(coordinator.beginActivation()()).toBe(true);
  });

  it('invalidates superseded requests and disposes runtime before service resources', async () => {
    const coordinator = new DesignRuntimeCoordinator();
    const first = coordinator.beginActivation();
    const second = coordinator.beginActivation();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
    const calls: string[] = [];
    await coordinator.lifecycle.activate(() => () => calls.push('mod'));
    coordinator.ledger.add(() => calls.push('service'));
    coordinator.cleanup();
    coordinator.cleanup();
    expect(calls).toEqual(['mod', 'service']);
  });

  it('cleanup does not invalidate the current activation epoch', () => {
    const coordinator = new DesignRuntimeCoordinator();
    const current = coordinator.beginActivation();
    coordinator.cleanup();
    expect(current()).toBe(true);
  });

  it('cleans late async activation exactly once after unmount', async () => {
    const coordinator = new DesignRuntimeCoordinator();
    let resolve!: (cleanup: () => void) => void;
    const cleanup = vi.fn();
    const activation = coordinator.lifecycle.activate(() => new Promise<() => void>(r => { resolve = r; }));
    coordinator.unmount();
    coordinator.cleanup();
    resolve(cleanup);
    expect(await activation).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
