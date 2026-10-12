import { invokeGated } from './authGate';
import { getPromptAssets } from './backend';

export interface DiarySyncStatus {
  configured: boolean;
  charId?: string | null;
  trackedEntries: number;
  lastSyncAt: number | null;
}

export interface DiarySyncSummary extends DiarySyncStatus {
  status: 'synced' | 'no_changes' | 'stale' | 'conflict' | string;
  scannedEntries: number;
  uploadedEntries: number;
  tombstones: number;
  staleEntries: number;
  conflicts: number;
}

export function getDiarySyncStatus(): Promise<DiarySyncStatus> {
  return invokeGated<DiarySyncStatus>('get_diary_sync_status');
}

export async function setDiaryDirectory(path: string): Promise<DiarySyncStatus> {
  const assets = await getPromptAssets({ force: true });
  const charId = assets.active.active_character;
  if (!charId) throw new Error('diary character is not configured');
  return invokeGated<DiarySyncStatus>('set_diary_directory', { path, charId });
}

export function clearDiaryDirectory(): Promise<DiarySyncStatus> {
  return invokeGated<DiarySyncStatus>('clear_diary_directory');
}

export function syncDiary(): Promise<DiarySyncSummary> {
  return invokeGated<DiarySyncSummary>('sync_diary');
}
