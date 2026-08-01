import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_PREFERENCE_KEYS,
  ACTIVITY_PREFERENCE_TABS,
  CHAT_PREFERENCE_SECTION_IDS,
  CHAT_PREFERENCE_TABS,
  COMPUTER_OPERATION_TAURI_COMMANDS,
} from './preferencesInfoArchitecture';

describe('preferences information architecture', () => {
  it('exposes the seven scoped chat preference categories', () => {
    expect(CHAT_PREFERENCE_TABS.map(tab => tab.key)).toEqual([
      'general', 'models', 'capabilities', 'interface', 'characterChat', 'petInteraction', 'advanced',
    ]);
  });

  it('keeps existing settings reachable from their new categories', () => {
    expect(CHAT_PREFERENCE_SECTION_IDS.general).toContain('connection');
    expect(CHAT_PREFERENCE_SECTION_IDS.models).toEqual(expect.arrayContaining(['modelRouting', 'characterModelRouting', 'thinking', 'outputSegmentEnforce']));
    expect(CHAT_PREFERENCE_SECTION_IDS.capabilities).toEqual(expect.arrayContaining(['desktopTts', 'toolLoop', 'visualPerception', 'computerOperationSafety']));
    expect(CHAT_PREFERENCE_SECTION_IDS.petInteraction).toEqual(expect.arrayContaining(['call', 'coplay']));
  });

  it('keeps activity scoped to appearance and debug without changing its preference keys', () => {
    expect(ACTIVITY_PREFERENCE_TABS.map(tab => tab.key)).toEqual(['appearance', 'debug']);
    expect(ACTIVITY_PREFERENCE_KEYS).toEqual([
      'activity.reading.fontSize', 'activity.reading.maxWidth', 'activity.board.theme', 'activity.chess.pieceStyle', 'activity.debug',
    ]);
  });

  it('locks the computer-operation IPC commands while moving their UI entry point', () => {
    expect(COMPUTER_OPERATION_TAURI_COMMANDS).toEqual(['get_meta_mode', 'patch_meta_mode']);
  });
});
