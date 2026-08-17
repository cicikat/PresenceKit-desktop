import { describe, expect, it } from 'vitest';
import { createWindowCoordinator } from './windowCoordinator';

describe('window coordinator', () => {
  it('deduplicates concurrent opens and exposes structured failures', async () => {
    let opens = 0;
    const coordinator = createWindowCoordinator({
      open: async () => { opens += 1; }, show: async () => {}, hide: async () => {}, destroy: async () => {},
    });
    await Promise.all([coordinator.open('pet'), coordinator.open('pet')]);
    expect(opens).toBe(1);
    expect(coordinator.state('pet')).toBe('open');
  });

  it('keeps failed windows retryable', async () => {
    let fail = true;
    const coordinator = createWindowCoordinator({
      open: async () => { if (fail) throw new Error('offline'); }, show: async () => {}, hide: async () => {}, destroy: async () => {},
    });
    await expect(coordinator.open('room')).rejects.toMatchObject({ code: 'open_failed', label: 'room' });
    fail = false;
    await coordinator.retry('room');
    expect(coordinator.state('room')).toBe('visible');
  });
});
