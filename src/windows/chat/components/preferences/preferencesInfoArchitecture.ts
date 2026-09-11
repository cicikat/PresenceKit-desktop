import type { MessageKey } from '../../../../shared/i18n/locales/zh-CN';

export type ChatPreferenceTab =
  | 'general'
  | 'interface'
  | 'characterChat'
  | 'petInteraction'
  | 'advanced';

export const CHAT_PREFERENCE_TABS: ReadonlyArray<{
  key: ChatPreferenceTab;
  labelKey: MessageKey;
}> = [
  { key: 'general', labelKey: 'settings.category.general' },
  { key: 'interface', labelKey: 'settings.category.interface' },
  { key: 'characterChat', labelKey: 'settings.category.characterChat' },
  { key: 'petInteraction', labelKey: 'settings.category.petInteraction' },
  { key: 'advanced', labelKey: 'settings.category.advanced' },
];

// This documents placement only. Rendering stays explicit in PreferencesPanel.
export const CHAT_PREFERENCE_SECTION_IDS: Readonly<Record<ChatPreferenceTab, readonly string[]>> = {
  general: ['language', 'connection', 'adminPanelBridge', 'diarySync', 'visualPerception'],
  interface: ['themes', 'chatHeader', 'layout', 'font', 'background', 'moodReactive', 'avatars', 'color', 'activityAppearance'],
  characterChat: ['currentCharacterStatus', 'reasoningDisplay', 'periodDate'],
  petInteraction: ['presencePopup', 'petVisualStyle', 'petMouse', 'petRoam', 'petRipple', 'playMode', 'desktopTts', 'call', 'coplay'],
  advanced: ['yandereVisual'],
};

export const ACTIVITY_PREFERENCE_KEYS = [
  'activity.reading.fontSize',
  'activity.reading.maxWidth',
  'activity.board.theme',
  'activity.chess.pieceStyle',
  'activity.debug',
] as const;
