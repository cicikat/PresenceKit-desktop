import { useSyncExternalStore } from 'react';
import { getUIPref, onUIPrefChange, setUIPref } from './uiPreferences';

const KEY = 'chat.reasoningVisible';

export function getReasoningVisible(): boolean {
  return getUIPref<boolean>(KEY, true) !== false;
}

export function setReasoningVisible(visible: boolean): void {
  setUIPref(KEY, visible);
}

function subscribe(listener: () => void): () => void {
  return onUIPrefChange(key => { if (key === KEY) listener(); });
}

/** Display only; never changes backend generation or archival settings. */
export function useReasoningVisible(): boolean {
  return useSyncExternalStore(subscribe, getReasoningVisible, () => true);
}
