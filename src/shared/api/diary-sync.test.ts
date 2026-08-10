import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { clearDiaryDirectory, getDiarySyncStatus, setDiaryDirectory, syncDiary } = await import('./diary-sync');

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ configured: false, trackedEntries: 0, lastSyncAt: null });
});

describe('diary sync command contract', () => {
  it('reads local status without exposing the selected path', async () => {
    await getDiarySyncStatus();
    expect(invokeMock).toHaveBeenCalledWith('get_diary_sync_status', undefined);
  });

  it('sends the selected directory only to the local Tauri command', async () => {
    await setDiaryDirectory('selected-diary-directory');
    expect(invokeMock).toHaveBeenCalledWith('set_diary_directory', {
      path: 'selected-diary-directory',
    });
  });

  it('keeps sync and clear commands separate and argument-free', async () => {
    await syncDiary();
    await clearDiaryDirectory();
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'sync_diary', undefined);
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'clear_diary_directory', undefined);
  });
});
