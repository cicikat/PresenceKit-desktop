export const zhCN = {
  'common.language': '语言',
  'common.chinese': '简体中文',
  'common.english': 'English',
  'settings.language.hint': '切换桌面客户端的界面语言，选择会自动保存',
} as const;

export type MessageKey = keyof typeof zhCN;
