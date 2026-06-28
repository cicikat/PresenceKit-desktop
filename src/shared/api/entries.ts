import { invoke } from '@tauri-apps/api/core';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface LoreEntry {
  id: string;
  keyword: string[];
  content: string;
  enabled: boolean;
  regex: boolean;
  insertion_order: number;
}

export interface JailbreakEntry {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  layer: number;
}

// ── Lorebook API ──────────────────────────────────────────────────────────────

export async function getLoreEntries(): Promise<LoreEntry[]> {
  const resp = await invoke<{ entries: unknown[] }>('get_lorebook_entries');
  return (resp.entries ?? []) as LoreEntry[];
}

export async function addLoreEntry(entry: Omit<LoreEntry, 'id'>): Promise<{ id: string }> {
  return invoke<{ id: string }>('add_lorebook_entry', { entry });
}

export async function updateLoreEntry(eid: string, entry: Omit<LoreEntry, 'id'>): Promise<void> {
  await invoke('update_lorebook_entry', { eid, entry });
}

export async function deleteLoreEntry(eid: string): Promise<void> {
  await invoke('delete_lorebook_entry', { eid });
}

// ── Jailbreak API ─────────────────────────────────────────────────────────────

export async function getJailbreakEntries(): Promise<JailbreakEntry[]> {
  const resp = await invoke<{ entries: unknown[] }>('get_jailbreak_entries');
  return (resp.entries ?? []) as JailbreakEntry[];
}

export async function addJailbreakEntry(entry: Omit<JailbreakEntry, 'id'>): Promise<void> {
  await invoke('add_jailbreak_entry', { entry });
}

export async function updateJailbreakEntry(eid: string, entry: Omit<JailbreakEntry, 'id'>): Promise<void> {
  await invoke('update_jailbreak_entry', { eid, entry });
}

export async function deleteJailbreakEntry(eid: string): Promise<void> {
  await invoke('delete_jailbreak_entry', { eid });
}
