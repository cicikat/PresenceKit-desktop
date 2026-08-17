import { describe, expect, it, vi } from 'vitest';
import { StateEngine } from '../../state/store';
import { SharedStatePollingController } from './polling';

vi.mock('../../api/backend', () => ({
  loadMoodState: vi.fn(),
  loadActivityState: vi.fn(),
}));

describe('shared presenter polling', () => {
  it('surfaces errors and clears them on an explicit retry', async () => {
    const backend = await import('../../api/backend');
    vi.mocked(backend.loadMoodState).mockRejectedValueOnce(new Error('mood offline')).mockResolvedValueOnce({ current: 'calm' } as any);
    const engine = new StateEngine();
    const polling = new SharedStatePollingController(engine);
    polling.retryMood();
    await Promise.resolve();
    expect(polling.get().moodError).toContain('mood offline');
    polling.retryMood();
    await Promise.resolve();
    expect(polling.get().moodError).toBeNull();
    polling.dispose();
  });
});
