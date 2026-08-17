import { describe, expect, it } from 'vitest';
import { PresenterController } from './base';

class TestPresenter extends PresenterController<{ schemaVersion: 1; updatedAt: number }, { ping(): void }> {
  starts = 0;
  stops = 0;
  constructor() { super({ schemaVersion: 1, updatedAt: 1 }, { ping: () => undefined }); }
  protected onStart(): void { this.starts += 1; this.timerActive = true; }
  protected onStop(): void { this.stops += 1; this.timerActive = false; }
}

describe('design presenter consumer lifecycle', () => {
  it('starts once for shared consumers and stops after the final release', () => {
    const presenter = new TestPresenter();
    const releaseA = presenter.acquire('a');
    const releaseB = presenter.acquire('b');
    expect(presenter.starts).toBe(1);
    expect(presenter.getDiagnostics()).toMatchObject({ consumerCount: 2, active: true, timerActive: true });
    releaseA();
    expect(presenter.stops).toBe(0);
    releaseB();
    expect(presenter.stops).toBe(1);
    releaseB();
    expect(presenter.getDiagnostics().consumerCount).toBe(0);
  });

  it('pauses and resumes without losing the consumer lease', () => {
    const presenter = new TestPresenter();
    const release = presenter.acquire('mod');
    presenter.setPaused(true);
    expect(presenter.getDiagnostics()).toMatchObject({ consumerCount: 1, active: false });
    presenter.setPaused(false);
    expect(presenter.starts).toBe(2);
    release();
  });
});
