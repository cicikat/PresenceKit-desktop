import { getUIPref, setUIPref } from './uiPreferences';
import { invoke } from '@tauri-apps/api/core';

const PREF_KEY = 'presenceNag.enabled';

export type PresenceNagPayload = {
  text: string;
  avatar: string;
};

export function isPresenceNagEnabled(): boolean {
  return getUIPref(PREF_KEY, false);
}

export function setPresenceNagEnabled(enabled: boolean): void {
  setUIPref(PREF_KEY, enabled);
}

export async function patchPresenceNagEnabled(enabled: boolean): Promise<void> {
  await invoke('patch_presence_nag', { enabled });
  setPresenceNagEnabled(enabled);
}
