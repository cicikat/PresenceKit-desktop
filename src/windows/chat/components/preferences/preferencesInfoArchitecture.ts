import type { MessageKey } from '../../../../shared/i18n/locales/zh-CN';

export type ChatPreferenceTab =
  | 'general'
  | 'models'
  | 'capabilities'
  | 'interface'
  | 'characterChat'
  | 'petInteraction'
  | 'advanced';

export const CHAT_PREFERENCE_TABS: ReadonlyArray<{
  key: ChatPreferenceTab;
  labelKey: MessageKey;
}> = [
  { key: 'general', labelKey: 'settings.category.general' },
  { key: 'models', labelKey: 'settings.category.models' },
  { key: 'capabilities', labelKey: 'settings.category.capabilities' },
  { key: 'interface', labelKey: 'settings.category.interface' },
  { key: 'characterChat', labelKey: 'settings.category.characterChat' },
  { key: 'petInteraction', labelKey: 'settings.category.petInteraction' },
  { key: 'advanced', labelKey: 'settings.category.advanced' },
];

// This documents placement only. Rendering stays explicit in PreferencesPanel.
export const CHAT_PREFERENCE_SECTION_IDS: Readonly<Record<ChatPreferenceTab, readonly string[]>> = {
  general: ['language', 'connection'],
  models: ['modelRouting', 'characterModelRouting', 'thinking', 'outputSegmentEnforce'],
  capabilities: ['desktopTts', 'toolLoop', 'visualPerception', 'computerOperationSafety'],
  interface: ['themes', 'chatHeader', 'layout', 'font', 'background', 'moodReactive', 'avatars', 'color'],
  characterChat: ['periodDate', 'promptAssets', 'chatSettings', 'presenceNag', 'proactiveGap'],
  petInteraction: ['petVisualStyle', 'petMouse', 'petRoam', 'petRipple', 'playMode', 'call', 'coplay'],
  advanced: ['yandereVisual'],
};

export type ActivityPreferenceTab = 'appearance' | 'debug';

export const ACTIVITY_PREFERENCE_TABS: ReadonlyArray<{
  key: ActivityPreferenceTab;
  labelKey: MessageKey;
}> = [
  { key: 'appearance', labelKey: 'activity.preferences.appearance' },
  { key: 'debug', labelKey: 'activity.preferences.debug' },
];

export const ACTIVITY_PREFERENCE_KEYS = [
  'activity.reading.fontSize',
  'activity.reading.maxWidth',
  'activity.board.theme',
  'activity.chess.pieceStyle',
  'activity.debug',
] as const;

export const COMPUTER_OPERATION_TAURI_COMMANDS = ['get_meta_mode', 'patch_meta_mode'] as const;
