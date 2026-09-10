import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_PREFERENCE_KEYS,
  CHAT_PREFERENCE_SECTION_IDS,
  CHAT_PREFERENCE_TABS,
} from './preferencesInfoArchitecture';

describe('preferences information architecture', () => {
  it('keeps backend policy editors out of desktop preferences', () => {
    expect(CHAT_PREFERENCE_TABS.map(tab => tab.key)).toEqual([
      'general', 'interface', 'characterChat', 'petInteraction', 'advanced',
    ]);
  });

  it('keeps existing settings reachable from their new categories', () => {
    expect(CHAT_PREFERENCE_SECTION_IDS.general).toContain('connection');
    expect(CHAT_PREFERENCE_SECTION_IDS.characterChat).toContain('currentCharacterStatus');
    expect(CHAT_PREFERENCE_SECTION_IDS.interface).toContain('activityAppearance');
    expect(Object.values(CHAT_PREFERENCE_SECTION_IDS).flat()).not.toEqual(expect.arrayContaining(['thinking', 'toolLoop']));
    expect(CHAT_PREFERENCE_SECTION_IDS.petInteraction).toEqual(expect.arrayContaining(['call', 'coplay']));
    expect(CHAT_PREFERENCE_SECTION_IDS.petInteraction).toContain('presencePopup');
  });

  it('keeps activity scoped to appearance and debug without changing its preference keys', () => {
    expect(ACTIVITY_PREFERENCE_KEYS).toEqual([
      'activity.reading.fontSize', 'activity.reading.maxWidth', 'activity.board.theme', 'activity.chess.pieceStyle', 'activity.debug',
    ]);
  });

});
