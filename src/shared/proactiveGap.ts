import { invoke } from '@tauri-apps/api/core';

export async function getProactiveGapHours(): Promise<number> {
  try { return await invoke<number>('get_proactive_gap_hours'); }
  catch { return 0.75; }
}

export async function patchProactiveGapHours(hours: number): Promise<void> {
  await invoke('patch_proactive_gap', { hours });
}
