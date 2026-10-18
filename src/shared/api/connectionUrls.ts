const LEGACY_WEBSOCKET_BASE = 'ws://127.0.0.1:8080/ws/desktop';

export function deriveWebsocketBase(backendBase: string): string | null {
  try {
    const url = new URL(backendBase.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws/desktop`;
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return null;
  }
}

// Keep following while the user edits an address, including incomplete input.
// A custom WS endpoint is retained until the user explicitly edits it.
export function followBackendWebsocket(previousBackend: string, websocketBase: string, nextBackend: string): string {
  const current = websocketBase.trim();
  if (!current || current === LEGACY_WEBSOCKET_BASE || current === deriveWebsocketBase(previousBackend)) {
    return deriveWebsocketBase(nextBackend) ?? '';
  }
  return websocketBase;
}
