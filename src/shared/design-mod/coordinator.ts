import { createDesignModHostLedger, DesignModLifecycle } from './lifecycle';

/** Owns host activation epochs and runtime resource lifetime, outside React.
 * Portal rendering and host API construction remain in DesignModHost.
 */
export class DesignRuntimeCoordinator {
  readonly lifecycle = new DesignModLifecycle();
  readonly ledger = createDesignModHostLedger();
  private mounted = true;
  private request = 0;

  get activeRequest(): number { return this.request; }

  mount(): void { this.mounted = true; }

  beginActivation(): () => boolean {
    const request = ++this.request;
    return () => this.mounted && request === this.request;
  }

  /** Unmount invalidates package loads as well as already-started activation. */
  unmount(): void {
    this.mounted = false;
    ++this.request;
  }

  /** Keep existing disposer-before-service ordering. Native teardown is host-owned. */
  cleanup(): void {
    this.lifecycle.dispose();
    this.ledger.clear();
  }
}
