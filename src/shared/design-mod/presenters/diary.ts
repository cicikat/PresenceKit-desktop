import { getPromptAssets, loadDiaryList } from '../../api/backend';
import type { DiaryListItem, PromptAssetCharacter } from '../../api/types';
import { getActiveCharacterInfo, subscribeActiveCharacter } from '../../activeCharacter';
import type { StateEngine } from '../../state/store';
import { PresenterController } from './base';
import type { DiaryPresenterCommands, DiaryPresenterSnapshot } from './types';

export class DiaryPresenterController extends PresenterController<DiaryPresenterSnapshot, DiaryPresenterCommands> {
  private run = 0;
  private unsubscribeActiveCharacter: (() => void) | null = null;

  constructor(private readonly engine: StateEngine, private readonly now: () => number = Date.now) {
    const activeCharacterId = getActiveCharacterInfo().id;
    super({ schemaVersion: 1, characters: [], activeCharacterId, entries: [], loading: true, error: null, selectedEntryId: null, lastUpdated: null, source: 'empty', updatedAt: now() }, {
      refresh: () => undefined,
      selectCharacter: () => undefined,
      openEntry: async () => undefined,
    });
    this.commands.refresh = () => { void this.refresh(); };
    this.commands.selectCharacter = characterId => { void this.selectCharacter(characterId); };
    this.commands.openEntry = entryId => this.openEntry(entryId);
    void this.engine;
  }

  protected onStart(): void {
    const run = ++this.run;
    this.timerActive = true;
    this.unsubscribeActiveCharacter = subscribeActiveCharacter(info => {
      if (info.id === this.snapshot.activeCharacterId) return;
      const nextRun = ++this.run;
      this.setSnapshot({ ...this.snapshot, activeCharacterId: info.id, entries: [], loading: true, error: null, selectedEntryId: null, updatedAt: this.now() });
      void this.refresh(nextRun, info.id);
    });
    void this.refresh(run, getActiveCharacterInfo().id);
  }

  protected onStop(): void {
    this.run += 1;
    this.timerActive = false;
    this.unsubscribeActiveCharacter?.();
    this.unsubscribeActiveCharacter = null;
  }

  private async refresh(expectedRun = this.run, requestedCharacterId = getActiveCharacterInfo().id): Promise<void> {
    this.setSnapshot({ ...this.snapshot, loading: true, error: null, updatedAt: this.now() });
    let characters: PromptAssetCharacter[] = this.snapshot.characters;
    let characterFailure: unknown = null;
    let activeFromAssets = '';
    try {
      const assets = await getPromptAssets();
      characters = assets.characters;
      activeFromAssets = assets.active?.active_character || '';
    } catch (error) {
      characterFailure = error;
    }
    const activeCharacterId = requestedCharacterId || activeFromAssets || characters[0]?.id || '';
    let diaryResult: { entries: DiaryListItem[] } | null = null;
    let diaryFailure: unknown = null;
    try {
      diaryResult = await loadDiaryList(activeCharacterId || undefined);
    } catch (error) {
      diaryFailure = error;
    }
    if (expectedRun !== this.run) return;
    const entries: DiaryListItem[] = diaryFailure || !diaryResult ? [] : diaryResult.entries;
    const error = characterFailure || diaryFailure;
    const updatedAt = error ? this.snapshot.lastUpdated : this.now();
    this.setSnapshot({
      schemaVersion: 1,
      characters,
      activeCharacterId,
      entries,
      loading: false,
      error: error ? String(error) : null,
      selectedEntryId: this.snapshot.selectedEntryId,
      lastUpdated: updatedAt,
      source: diaryFailure ? 'empty' : 'diary-api',
      updatedAt: this.now(),
    });
  }

  private async selectCharacter(characterId: string): Promise<void> {
    // Deprecated Mod command. Official diary UI is always the active character.
    void characterId;
  }

  private async openEntry(entryId: string): Promise<void> {
    const item = this.snapshot.entries.find(entry => entry.date === entryId || entryId === entry.title);
    if (!item) return;
    this.setSnapshot({ ...this.snapshot, selectedEntryId: item.date, updatedAt: this.now() });
    const charId = this.snapshot.activeCharacterId || '';
    const safeCharId = charId.replace(/[^a-zA-Z0-9_-]/g, c => `u${c.codePointAt(0)!.toString(16)}`);
    const label = `diary-detail-${safeCharId}-${item.date}`;
    const params = new URLSearchParams({ window: 'diary-detail', date: item.date, char: charId });
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.setFocus();
        return;
      }
      const window = new WebviewWindow(label, {
        url: `index.html?${params.toString()}`,
        title: item.title,
        width: 520,
        height: 600,
        decorations: false,
        resizable: true,
        focus: true,
        visible: false,
      });
      window.once('tauri://error', event => console.error('[diary] window creation failed', event));
    } catch (error) {
      this.setSnapshot({ ...this.snapshot, error: String(error), updatedAt: this.now() });
    }
  }
}
