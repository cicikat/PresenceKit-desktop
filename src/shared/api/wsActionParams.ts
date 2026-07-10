// Pure helpers for reading a DesktopActionPayload sent over the ws_bridge `action`
// message. Split out of ws.ts so they can be unit tested without pulling in
// WSClient's other imports (presenceNag/activeCharacter -> uiPreferences), which
// touch `window` at module load time and would require a DOM test environment.
import type { DesktopActionPayload } from './types';

export function actionType(action: DesktopActionPayload): string | null {
  const raw = action.action_type ?? action.type;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export function actionParams(action: DesktopActionPayload): Record<string, unknown> {
  return action.params && typeof action.params === 'object' && !Array.isArray(action.params)
    ? action.params
    : {};
}

export function stringParam(action: DesktopActionPayload, keys: string[], fallback = ''): string {
  const params = actionParams(action);
  for (const key of keys) {
    const value = params[key] ?? action[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}
