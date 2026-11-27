import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ char: 'first', connection: 'connection', invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: state.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
vi.mock('../activeCharacter', () => ({ getActiveCharacterInfo: () => ({ id: state.char }), subscribeActiveCharacter: () => () => {} }));
vi.mock('../i18n', () => ({ t: () => 'Please reopen the chat window.' }));
vi.mock('../runtimeDiagnostics', () => ({ runtimeDiagnostics: { measureCommand: (_cmd: string, call: () => unknown) => call() } }));

beforeEach(() => {
  vi.resetModules();
  state.char = 'first';
  state.invoke.mockReset().mockImplementation(async (cmd: string) => {
    if (cmd === 'reality_connection_key') return state.connection;
    if (cmd === 'open_reality_session') return { session_id: 'session', char_id: 'first',
      domain: 'reality', owner_id: 'owner', expires_at: Date.now() / 1000 + 3600, connection_key: state.connection };
    return { reply: 'hello' };
  });
});

it('dispatches chat and history with the same grant and connection identity', async () => {
  const { invokeGated } = await import('./authGate');
  await invokeGated('send_chat', { message: 'hello' });
  await invokeGated('load_chat_log_dates');
  expect(state.invoke).toHaveBeenCalledWith('send_chat', { message: 'hello', sessionId: 'session', connectionKey: 'connection' });
  expect(state.invoke).toHaveBeenCalledWith('load_chat_log_dates', { sessionId: 'session', connectionKey: 'connection' });
  expect(state.invoke.mock.calls.filter(([cmd]) => cmd === 'open_reality_session')).toHaveLength(1);
});

it('does not dispatch or replay a message when binding fails', async () => {
  state.invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'reality_connection_key') return state.connection;
    throw 'HTTP 403';
  });
  const { invokeGated } = await import('./authGate');
  await expect(invokeGated('send_chat', { message: 'hello' })).rejects.toMatchObject({ name: 'Error', message: 'Please reopen the chat window.' });
  expect(state.invoke.mock.calls.some(([cmd]) => cmd === 'send_chat')).toBe(false);
});

it('keeps unrelated settings outside the Reality session contract', async () => {
  const { invokeGated } = await import('./authGate');
  await invokeGated('load_garden_state');
  expect(state.invoke).toHaveBeenCalledExactlyOnceWith('load_garden_state', undefined);
});

it('reports a rejected grant without binding a replacement or replaying the send', async () => {
  const previous = state.invoke.getMockImplementation()!;
  state.invoke.mockImplementation(async (cmd: string, ...args: unknown[]) => {
    if (cmd === 'send_chat') throw 'HTTP 404: session_not_found';
    return previous(cmd, ...args);
  });
  const { invokeGated } = await import('./authGate');
  await expect(invokeGated('send_chat', { message: 'hello' })).rejects.toThrow('Please reopen the chat window.');
  expect(state.invoke.mock.calls.filter(([cmd]) => cmd === 'send_chat')).toHaveLength(1);
  expect(state.invoke.mock.calls.filter(([cmd]) => cmd === 'open_reality_session')).toHaveLength(1);
});
