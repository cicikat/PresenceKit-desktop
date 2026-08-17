import { describe, expect, it, vi } from 'vitest';
import { createDesignModHostLedger, DesignModLifecycle } from './lifecycle';

describe('design Mod lifecycle', () => {
  it('does not let a stale async activation become current', async () => {
    const lifecycle = new DesignModLifecycle();
    let resolveOld!: (cleanup: () => void) => void;
    const old = new Promise<() => void>(resolve => { resolveOld = resolve; });
    const first = lifecycle.activate(() => old);
    const second = lifecycle.activate(() => undefined);
    resolveOld(vi.fn());
    expect(await second).toBe(true);
    expect(await first).toBe(false);
  });

  it('aborts and disposes idempotently while clearing the host ledger', () => {
    const lifecycle = new DesignModLifecycle();
    const disposer = vi.fn();
    const ledger = createDesignModHostLedger();
    const remove = ledger.add(disposer);
    expect(ledger.size()).toBe(1);
    remove();
    expect(ledger.size()).toBe(0);
    ledger.add(disposer);
    ledger.clear();
    ledger.clear();
    expect(disposer).toHaveBeenCalledTimes(1);
    lifecycle.dispose();
  });
});
