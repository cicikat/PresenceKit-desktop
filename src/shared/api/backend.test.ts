import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCharacterAvatar, getPromptAssets, invalidatePromptAssetsCache, uploadCharacterAvatar } from './backend';

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
