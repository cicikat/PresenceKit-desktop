import type { ScreenActivity } from './screenConfig';
// Room-only transient activity. Never writes StateEngine, mood, or persistent storage.
let activity: ScreenActivity = 'idle';
export const setCallActivity = (next: ScreenActivity): void => { activity = next; };
export const getCallActivity = (): ScreenActivity => activity;
