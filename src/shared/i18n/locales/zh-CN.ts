export const zhCN = {
  'common.language': '语言',
  'common.chinese': '简体中文',
  'common.english': 'English',
  'settings.language.hint': '切换桌面客户端的界面语言，选择会自动保存',
  'settings.segmentEnforce.title': '生成后段落兜底（实验）',
  'settings.segmentEnforce.description': '仅处理发送副本，关闭后不额外补空行',
  'settings.segmentEnforce.toggleLabel': '自动补充分段空行',
  'settings.segmentEnforce.toggleHint': '长篇回复挤成一段时，按句末停顿补一个空行',
  'settings.segmentEnforce.threshold': '当前长度阈值',
  'settings.segmentEnforce.loading': '正在读取段落兜底配置…',
  'settings.segmentEnforce.loadFailed': '读取段落兜底配置失败',
  'settings.segmentEnforce.saveFailed': '保存段落兜底配置失败',
  'common.refresh': '刷新',
  'common.loading': '加载中',
  'common.loadFailed': '加载失败',
  'common.notEnabled': '暂无数据或功能未启用',
  'chat.history.waiting.network': '正在等待后端连接…（网络错误）',
  'chat.history.waiting.unauthorized': '正在等待后端连接…（未授权）',
  'chat.history.waiting.invalid': '正在等待后端连接…（格式异常）',
} as const;

export type MessageKey = keyof typeof zhCN;
