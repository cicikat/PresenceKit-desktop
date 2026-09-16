import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadDocument, sendChat, transcribeAudio, deleteCharacterAvatar, getPromptAssets, invalidatePromptAssetsCache, patchPromptAssets, uploadCharacterAvatar } from './backend';

const { invokeGated } = vi.hoisted(() => ({ invokeGated: vi.fn() }));
vi.mock('./authGate', () => ({ invokeGated }));

const assets = (avatarUrl: string | null) => ({
  characters: [{ id: 'a', label: 'A', avatar_url: avatarUrl }],
  lorebooks: [], jailbreaks: [], dream_presets: [], world_cards: [],
  active: { active_character: 'a', enabled_lorebooks: [], enabled_jailbreaks: [] },
});

describe('prompt asset mutation cache boundary', () => {
  beforeEach(() => {
    invokeGated.mockReset();
    invalidatePromptAssetsCache();
  });

  it('preserves routing status and leaves absent fields unknown', async () => {
    const response = assets(null);
    Object.assign(response.characters[0], { model_routing: null, effective_profile: 'default', resolved_chat_preset: 'local', resolved_chat_model: 'example', global_profile: 'default', binding_source: 'global', chat_configured: false });
    invokeGated.mockResolvedValueOnce(response).mockResolvedValueOnce(assets(null));
    expect((await getPromptAssets()).characters[0]).toMatchObject({ model_routing: null, effective_profile: 'default', resolved_chat_preset: 'local', resolved_chat_model: 'example', global_profile: 'default', binding_source: 'global', chat_configured: false });
    const missing = (await getPromptAssets({ force: true })).characters[0];
    expect(missing.model_routing).toBeUndefined();
    expect(missing.chat_configured).toBeUndefined();
  });

  it('an old request follows the fresh request after a character switch', async () => {
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    const next = assets(null);
    next.characters[0].id = 'b'; next.active.active_character = 'b';
    invokeGated.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ active: next.active })
      .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
    const old = getPromptAssets();
    await patchPromptAssets({ active_character: 'b' });
    const fresh = getPromptAssets();
    finishOld(assets('/stale.png'));
    await Promise.resolve();
    finishNew(next);
    expect((await old).active.active_character).toBe('b');
    expect(await fresh).toEqual(await getPromptAssets());
    expect(invokeGated).toHaveBeenCalledTimes(3);
  });

  it('retries after failure and invalidation without retaining an old cache', async () => {
    invokeGated.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(assets('/fresh.png'));
    await expect(getPromptAssets()).rejects.toThrow('offline');
    invalidatePromptAssetsCache();
    expect((await getPromptAssets()).characters[0].avatar_url).toBe('/fresh.png');
  });

  it('invalidates prompt assets after avatar upload and deletion', async () => {
    invokeGated
      .mockResolvedValueOnce(assets('/old.png'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(assets('/new.png'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(assets(null));
    expect((await getPromptAssets()).characters[0].avatar_url).toBe('/old.png');
    await uploadCharacterAvatar('a', { type: 'image/png', arrayBuffer: async () => new ArrayBuffer(0) } as File);
    expect((await getPromptAssets()).characters[0].avatar_url).toBe('/new.png');
    await deleteCharacterAvatar('a');
    expect((await getPromptAssets()).characters[0].avatar_url).toBeNull();
    expect(invokeGated).toHaveBeenCalledWith('upload_character_avatar', expect.any(Object));
    expect(invokeGated).toHaveBeenCalledWith('delete_character_avatar', { charId: 'a' });
  });
});

describe('chat transport compatibility', () => {
  it('keeps original single-path upload and forwards buffered media in one command', async () => {
    invokeGated.mockReset(); invokeGated.mockResolvedValue({ reply: 'ok' });
    await uploadDocument('photo.png', 'caption');
    expect(invokeGated).toHaveBeenLastCalledWith('upload_document', { filePath: 'photo.png', message: 'caption' });
    const attachments = [{ filename: 'paste.png', dataB64: 'aGVsbG8=' }, { filePath: 'second.png' }];
    await uploadDocument(attachments, 'together');
    expect(invokeGated).toHaveBeenLastCalledWith('upload_document', { attachments, message: 'together' });
    await sendChat('reply', { text: 'my own message', ts: 123 });
    expect(invokeGated).toHaveBeenLastCalledWith('send_chat', { message: 'reply', replyTo: { text: 'my own message', ts: 123 } });
  });
});

it('forwards a voice receipt once and drops it when transcript is edited', async () => {
  invokeGated.mockReset();
  invokeGated.mockResolvedValueOnce({ text: 'hello', audio_perception_id: 'fixture-receipt' });
  await transcribeAudio('fixture-audio');
  await sendChat('hello');
  expect(invokeGated).toHaveBeenLastCalledWith('send_chat', { message: 'hello', audioPerceptionId: 'fixture-receipt' });
  await sendChat('hello');
  expect(invokeGated).toHaveBeenLastCalledWith('send_chat', { message: 'hello' });
  invokeGated.mockResolvedValueOnce({ text: 'hello', audio_perception_id: 'fixture-receipt' });
  await transcribeAudio('fixture-audio');
  await sendChat('edited');
  expect(invokeGated).toHaveBeenLastCalledWith('send_chat', { message: 'edited' });
});
