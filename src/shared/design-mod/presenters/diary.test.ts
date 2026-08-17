import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StateEngine } from '../../state/store';
import { DiaryPresenterController } from './diary';
import { setActiveCharacterInfo } from '../../activeCharacter';

vi.mock('../../api/backend', () => ({
  getPromptAssets: vi.fn(),
  loadDiaryList: vi.fn(),
}));

describe('diary presenter loading and empty states', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', new EventTarget());
    const backend = await import('../../api/backend');
    vi.mocked(backend.getPromptAssets).mockReset();
    vi.mocked(backend.loadDiaryList).mockReset();
    setActiveCharacterInfo({ id: '', name: '', avatarRevision: 0 });
  });

  it('follows the active character and drops a late previous response', async () => {
    const backend = await import('../../api/backend');
    let resolveA!: (value: any) => void;
    vi.mocked(backend.getPromptAssets).mockResolvedValue({ characters: [{ id: 'a', label: 'A', avatar_url: null }, { id: 'b', label: 'B', avatar_url: null }], lorebooks: [], jailbreaks: [], active: { active_character: 'a', enabled_lorebooks: [], enabled_jailbreaks: [] } } as any);
    vi.mocked(backend.loadDiaryList).mockImplementation(charId => charId === 'a'
      ? new Promise(resolve => { resolveA = resolve; })
      : Promise.resolve({ entries: [{ date: '2026-08-18', title: 'B entry', emotion: null, feeling: '' }], count: 1 }));
    setActiveCharacterInfo({ id: 'a', name: 'A', avatarRevision: 0 });
    const presenter = new DiaryPresenterController(new StateEngine());
    const release = presenter.acquire('test');
    await Promise.resolve();
    await Promise.resolve();
    setActiveCharacterInfo({ id: 'b', name: 'B', avatarRevision: 0 });
    await Promise.resolve();
    await Promise.resolve();
    resolveA({ entries: [{ date: '2026-08-17', title: 'A entry', emotion: null, feeling: '' }], count: 1 });
    await Promise.resolve();
    expect(presenter.get()).toMatchObject({ activeCharacterId: 'b', entries: [{ title: 'B entry' }] });
    release();
    presenter.dispose();
  });

  it('loads characters and lightweight entries without body paths', async () => {
    const backend = await import('../../api/backend');
    vi.mocked(backend.getPromptAssets).mockResolvedValue({ characters: [{ id: 'a', label: 'A', avatar_url: null }], lorebooks: [], jailbreaks: [], active: { active_character: 'a', enabled_lorebooks: [], enabled_jailbreaks: [] } } as any);
    vi.mocked(backend.loadDiaryList).mockResolvedValue({ entries: [{ date: '2026-08-17', title: 'Entry', emotion: null, feeling: 'text' }], count: 1 });
    const presenter = new DiaryPresenterController(new StateEngine());
    const release = presenter.acquire('test');
    await Promise.resolve();
    await Promise.resolve();
    expect(presenter.get()).toMatchObject({ loading: false, activeCharacterId: 'a', entries: [{ date: '2026-08-17', title: 'Entry' }] });
    expect((presenter.get().entries[0] as unknown as Record<string, unknown>).path).toBeUndefined();
    release();
    presenter.dispose();
  });

  it('keeps an empty list and error when the diary endpoint fails', async () => {
    const backend = await import('../../api/backend');
    vi.mocked(backend.getPromptAssets).mockResolvedValue({ characters: [], lorebooks: [], jailbreaks: [], active: { active_character: '', enabled_lorebooks: [], enabled_jailbreaks: [] } } as any);
    vi.mocked(backend.loadDiaryList).mockRejectedValue(new Error('diary offline'));
    const presenter = new DiaryPresenterController(new StateEngine());
    const release = presenter.acquire('test');
    await Promise.resolve();
    await Promise.resolve();
    expect(presenter.get()).toMatchObject({ loading: false, entries: [], error: 'Error: diary offline', source: 'empty' });
    release();
    presenter.dispose();
  });
});
