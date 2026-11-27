import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ char: 'role-a', connection: 'connection', invoke: vi.fn(),
  listeners: new Set<(info: { id: string }) => void>(), nativeConfigChanged: undefined as (() => void) | undefined }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: state.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async (_event: string, callback: () => void) => {
  state.nativeConfigChanged = callback; return () => { state.nativeConfigChanged = undefined; };
} }));
vi.mock('../activeCharacter', () => ({ getActiveCharacterInfo: () => ({ id: state.char }),
  subscribeActiveCharacter: (fn: (info: { id: string }) => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); } }));
vi.mock('../i18n', () => ({ t: () => 'Please reopen the conversation.' }));
vi.mock('../character/behaviorEvents', () => ({ publishBehavior: () => Promise.resolve() }));
vi.mock('../runtimeDiagnostics', () => ({ runtimeDiagnostics: { measureCommand: (_cmd: string, call: () => unknown) => call() } }));

function role(id: string) { state.char = id; state.listeners.forEach(fn => fn({ id })); }
beforeEach(() => {
  vi.resetModules(); state.listeners.clear(); state.char = 'role-a'; state.connection = 'connection';
  state.invoke.mockReset().mockImplementation(async (cmd: string, args: Record<string, string>) => {
    if (cmd === 'reality_connection_key') return state.connection;
    if (cmd === 'open_reality_session') return { session_id: `session-${args.charId}`, char_id: args.charId,
      owner_id: 'fixture-owner', domain: 'reality', expires_at: Date.now() / 1000 + 3600, connection_key: state.connection };
    if (cmd === 'transcribe_audio') return { text: 'hello', audio_perception_id: 'receipt-a' };
    return { reply: 'ok', msg_id: 'fixture-turn' };
  });
});

it('does not attach an A receipt to B with identical transcript', async () => {
  const { transcribeAudio, sendChat } = await import('./backend');
  await transcribeAudio('fixture'); role('role-b');
  await sendChat('hello');
  const send = state.invoke.mock.calls.find(([cmd]) => cmd === 'send_chat');
  expect(send?.[1].audioPerceptionId).toBeUndefined();
});

for (const aba of [false, true]) it(`rejects late transcription after ${aba ? 'A-B-A' : 'A-B'}`, async () => {
  const { transcribeAudio } = await import('./backend');
  let complete!: (result: unknown) => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const previous = state.invoke.getMockImplementation()!;
  state.invoke.mockImplementation((cmd: string, args: Record<string, string>) => cmd === 'transcribe_audio'
    ? new Promise(resolve => { complete = resolve; entered(); }) : previous(cmd, args));
  const pending = transcribeAudio('fixture');
  await started; role('role-b'); if (aba) role('role-a');
  const rejected = expect(pending).rejects.toThrow();
  complete({ text: 'old A', audio_perception_id: 'receipt-a' });
  await rejected;
});

it('rejects a connection and authorization ABA during transcription', async () => {
  const { transcribeAudio } = await import('./backend');
  let complete!: (result: unknown) => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const previous = state.invoke.getMockImplementation()!;
  state.invoke.mockImplementation((cmd: string, args: Record<string, string>) => cmd === 'transcribe_audio'
    ? new Promise(resolve => { complete = resolve; entered(); }) : previous(cmd, args));
  const pending = transcribeAudio('fixture'); await started;
  state.connection = 'other-authorization'; state.nativeConfigChanged!();
  state.connection = 'connection'; state.nativeConfigChanged!();
  const rejected = expect(pending).rejects.toThrow();
  complete({ text: 'old', audio_perception_id: 'old' }); await rejected;
});

it('keeps a newer receipt when two responses complete in reverse order', async () => {
  const { transcribeAudio, sendChat } = await import('./backend');
  const complete: ((result: unknown) => void)[] = [];
  const entered: (() => void)[] = [];
  const started = [0, 1].map(() => new Promise<void>(resolve => { entered.push(resolve); }));
  const previous = state.invoke.getMockImplementation()!;
  state.invoke.mockImplementation((cmd: string, args: Record<string, string>) => cmd === 'transcribe_audio'
    ? new Promise(resolve => { const i = complete.length; complete.push(resolve); entered[i](); }) : previous(cmd, args));
  const old = transcribeAudio('old'); await started[0];
  const newer = transcribeAudio('new'); await started[1];
  complete[1]({ text: 'new', audio_perception_id: 'new-receipt' }); await newer;
  const rejected = expect(old).rejects.toThrow();
  complete[0]({ text: 'old', audio_perception_id: 'old-receipt' }); await rejected;
  await sendChat('new');
  expect(state.invoke.mock.calls.find(([cmd]) => cmd === 'send_chat')?.[1].audioPerceptionId).toBe('new-receipt');
});

it('refuses explicit continuous-call sources belonging to the previous role', async () => {
  const { transcribeAudio, sendChat } = await import('./backend');
  const result = await transcribeAudio('fixture'); role('role-b');
  await expect(sendChat('hello', undefined, undefined, { text: result.text, id: result.audio_perception_id!, scope: result.scope })).rejects.toThrow();
  expect(state.invoke.mock.calls.some(([cmd]) => cmd === 'send_chat')).toBe(false);
});
