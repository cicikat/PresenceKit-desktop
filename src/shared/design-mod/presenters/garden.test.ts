import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StateEngine } from '../../state/store';
import { GardenPresenterController } from './garden';

vi.mock('../../api/backend', () => ({ loadGardenState: vi.fn() }));

describe('garden presenter loading and retry state', () => {
  beforeEach(async () => {
    const backend = await import('../../api/backend');
    vi.mocked(backend.loadGardenState).mockReset();
  });

  it('normalizes a garden snapshot and exposes lastUpdated', async () => {
    const backend = await import('../../api/backend');
    vi.mocked(backend.loadGardenState).mockResolvedValue({ slots: [], harvest_count: 2, vase_count: 1 });
    const presenter = new GardenPresenterController(new StateEngine(), () => 2_000);
    const release = presenter.acquire('test');
    await Promise.resolve();
    await Promise.resolve();
    expect(presenter.get()).toMatchObject({ loading: false, source: 'garden-api', garden: { harvest_count: 2 }, lastUpdated: 2_000 });
    release();
    presenter.dispose();
  });

  it('keeps an explicit error and supports retry', async () => {
    const backend = await import('../../api/backend');
    vi.mocked(backend.loadGardenState).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ slots: [], harvest_count: 0, vase_count: 0 });
    const presenter = new GardenPresenterController(new StateEngine());
    const release = presenter.acquire('test');
    await Promise.resolve();
    await Promise.resolve();
    expect(presenter.get().error).toContain('offline');
    presenter.commands.refresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(presenter.get().error).toBeNull();
    release();
    presenter.dispose();
  });
});
