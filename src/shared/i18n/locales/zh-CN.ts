export const zhCN = {
  'common.language': '语言',
  'common.chinese': '简体中文',
  'common.english': 'English',
  'settings.language.hint': '切换桌面客户端的界面语言，选择会自动保存',
  'common.refresh': '刷新',
  'common.loading': '加载中',
  'common.loadFailed': '加载失败',
  'common.notEnabled': '暂无数据或功能未启用',
  'chat.history.waiting.network': '正在等待后端连接…（网络错误）',
  'chat.history.waiting.unauthorized': '正在等待后端连接…（未授权）',
  'chat.history.waiting.invalid': '正在等待后端连接…（格式异常）',
} as const;

export type MessageKey = keyof typeof zhCN;
