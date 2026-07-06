import { getPromptAssets } from './api/backend';
import { getUIPref, setUIPref, onUIPrefChange } from './uiPreferences';
import type { PromptAssetsResponse } from './api/types';

/**
 * Cross-window "who's the active character" cache. Every client window (chat, room,
 * activity, toy, presence-nag) is its own webview/JS runtime, so this can't live on an
 * in-memory singleton — it rides the same file+localStorage-backed uiPreferences store
 * that cc-tasks/15 §A introduced, which already syncs across windows via storage events.
 * ChatWindow (the settings owner) is the writer; everyone else reads.
 */

const KEY = 'character.active';

export interface ActiveCharacterInfo {
  id: string;
  name: string;
}

const DEFAULT_INFO: ActiveCharacterInfo = { id: '', name: '' };

export function getActiveCharacterInfo(): ActiveCharacterInfo {
  return getUIPref<ActiveCharacterInfo>(KEY, DEFAULT_INFO);
}

/** Best-effort display name: label, else raw char_id, else the given fallback. */
export function getActiveCharacterName(fallback = 'TA'): string {
  const info = getActiveCharacterInfo();
  return info.name || info.id || fallback;
}

export function setActiveCharacterInfo(info: ActiveCharacterInfo): void {
  setUIPref(KEY, info);
}

export function subscribeActiveCharacter(handler: (info: ActiveCharacterInfo) => void): () => void {
  return onUIPrefChange(key => {
    if (key === KEY) handler(getActiveCharacterInfo());
  });
}

function pickInfo(assets: PromptAssetsResponse): ActiveCharacterInfo {
  const id = assets.active.active_character || '';
  const name = assets.characters.find(c => c.id === id)?.label || '';
  return { id, name };
}

/** Derive the cache entry from an already-fetched prompt-assets response (avoids a duplicate round-trip). */
export function updateActiveCharacterFromAssets(assets: PromptAssetsResponse): ActiveCharacterInfo {
  const info = pickInfo(assets);
  setActiveCharacterInfo(info);
  return info;
}

/** Fetch prompt-assets fresh and refresh the cache. Call once from whichever window owns character settings. */
export async function refreshActiveCharacterInfo(): Promise<ActiveCharacterInfo> {
  const assets = await getPromptAssets();
  return updateActiveCharacterFromAssets(assets);
}
