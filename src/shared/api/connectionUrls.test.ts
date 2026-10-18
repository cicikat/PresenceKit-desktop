import { describe, expect, it } from 'vitest';
import { deriveWebsocketBase, followBackendWebsocket } from './connectionUrls';

describe('backend WebSocket addresses', () => {
  it.each([
    ['http://127.0.0.1:8080', 'ws://127.0.0.1:8080/ws/desktop'],
    ['https://backend.example', 'wss://backend.example/ws/desktop'],
    ['https://backend.example:8443/presence/', 'wss://backend.example:8443/presence/ws/desktop'],
    ['http://[::1]:8080/', 'ws://[::1]:8080/ws/desktop'],
    ['https://name:password@backend.example/api?token=secret#part', 'wss://backend.example/api/ws/desktop'],
  ])('derives %s without copying credentials', (backend, websocket) => {
    expect(deriveWebsocketBase(backend)).toBe(websocket);
  });

  it('repairs the legacy localhost value when moving to a server', () => {
    expect(followBackendWebsocket('http://127.0.0.1:8080', 'ws://127.0.0.1:8080/ws/desktop', 'https://backend.example'))
      .toBe('wss://backend.example/ws/desktop');
  });

  it('follows an existing remote endpoint through incomplete edits and back to localhost', () => {
    let backend = 'https://old.example';
    let websocket = 'wss://old.example/ws/desktop';
    for (const next of ['', 'h', 'http://127.0.0.1:8080']) {
      websocket = followBackendWebsocket(backend, websocket, next);
      backend = next;
    }
    expect(websocket).toBe('ws://127.0.0.1:8080/ws/desktop');
  });

  it('preserves a separately configured endpoint, including its path and query', () => {
    const custom = 'wss://push.example/custom?client=desktop';
    expect(followBackendWebsocket('https://old.example', custom, 'https://new.example')).toBe(custom);
  });

  it.each(['', 'h', 'ftp://backend.example'])('does not derive invalid or unsupported input %s', backend => {
    expect(deriveWebsocketBase(backend)).toBeNull();
  });
});
