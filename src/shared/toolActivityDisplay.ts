import { useSyncExternalStore } from 'react';
import { getUIPref, onUIPrefChange, setUIPref } from './uiPreferences';
const KEY = 'chat.toolActivityVisible';
export const setToolActivityVisible = (visible: boolean) => setUIPref(KEY, visible);
const read = () => getUIPref<boolean>(KEY, true) !== false;
const subscribe = (listener: () => void) => onUIPrefChange(key => { if (key === KEY) listener(); });
export const useToolActivityVisible = () => useSyncExternalStore(subscribe, read, () => true);
