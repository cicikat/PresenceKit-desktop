import { invokeGated } from './authGate';

export interface DiarySyncStatus {
  configured: boolean;
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

export function setDiaryDirectory(path: string): Promise<DiarySyncStatus> {
  return invokeGated<DiarySyncStatus>('set_diary_directory', { path });
}

export function clearDiaryDirectory(): Promise<DiarySyncStatus> {
  return invokeGated<DiarySyncStatus>('clear_diary_directory');
}

export function syncDiary(): Promise<DiarySyncSummary> {
  return invokeGated<DiarySyncSummary>('sync_diary');
}
