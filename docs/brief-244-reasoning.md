# Brief 244：回复间的内心活动旁白

2026-09-17 状态复核（原自动化证据为 2026-09-11）。本仓实现完成，整体 **partial**；真实历史恢复和真实 Tauri/后端联调 **open**。
用户明确限定本仓，历史接口修复留后端工单。后端交接见
`../cc-tasks/244-history-turn-id-backend-handoff.md`，未修改其他仓库。

## 当前体验与实现

- 设置 → 角色与对话 → **显示思考入口**。默认开启，只控制本地 UI；关闭隐藏所有思考旁白，
  停止新增读取，重启后保持选择。复用 uiPreferences 的 `chat.reasoningVisible`，不修改生成/归档。
- 每次完整回复只有一个居中的浅底“展开思考”按钮，位于首个 assistant 分段前。
  `reasoningAnchors` 依据 canonical turnId 分组，后续分段、连续的不同回复不会混淆。
  未完成流式回复与缺少 ID 的消息不猜测关联。
- 展开是柔和旁白，无头像/气泡边框；仅显示“{角色名}的内心活动：”和正文。
  名称订阅 activeCharacter，不硬编码。所有返回文本依调用顺序保留，
  模型、调用号、来源、协议、完成/中断字段均不展示；原文只以 React 文本节点渲染。
- `TurnReasoningCache` 按 canonical turn_id 缓存、合并在途请求，最多 50 个非空回合。
  重新收起/展开使用缓存；手动重新读取可刷新。失败/空结果不负缓存，空记录不代表没有思考。
  卸载忽略迟到响应，切换角色清空缓存。关闭显示不取消底层已经发出的只读请求，但结果不回填 UI。
- HTTP fallback、WS 先到、HTTP 先到、流式完成仍使用原有正文/分段/对账路径，
  canonical turn_id 仅来自 HTTP 明确字段；transport msg_id 不能作为思考查询 ID。
- Tauri `load_turn_reasoning({ turnId })` / memory.read GET 不变；使用 desktop Bearer、
  no_proxy、15 秒超时，不申请 admin 凭据。401 原连接门禁、403/404/503/一般错误和空记录可重试。
  UI 错误也不显示 scope 名或后端原始错误正文。

## 历史恢复的真实边界

2026-09-17 只读复核：`admin/routers/chat_log.py::_parse_day` 已解析可信 assistant
尾部元数据并返回可选 turn_id，且有 `tests/test_chat_log_turn_id.py` 测试源码。
本次未运行后端测试或确认运行中服务版本；此前“后端未实现”的结论已过时。
前端一直支持 `ChatLogEntry.turn_id`；本次已验证带显式 ID 的历史回复只产生一个入口，
刷新页面后可以重新展开读取。该验证使用 IPC 夹具，**不代表真实部署与联调通过**。
不在前端解析后端文件、不按时间/正文推测、不另存一份聊天/思考正文做补丁。
后端具体修复和回归要求见交接单，用户已指定后端另单实施。

## 三面闭环

| 检查面 | 当前结论 |
|---|---|
| 管理与观测 | 回合 GET 已由 memory.read 授权；生成配置由 settings_thinking 与管理面维护。只读 UI 不新增后端配置/effective state/trace/队列；全局归档仍 admin-only。 |
| 桌面设置与手机 | 新本地显示偏好位于角色与对话，默认 true，复用既有 load/save_ui_prefs。手机模型已分开解析 msgId/turnId，思考 UI 仍 roadmap；无 Flutter/Android/relay/poll/ack 改动。 |
| 原链路与相邻路径 | HTTP msg_id 与 canonical turn_id 分离；分段对账、正文、ack、TTL、TTS 和通知保持原行为。历史字段解析已有源码，scope/角色桶与真实恢复仍需后端联调。 |

## 验证

- `npm.cmd test`：58 文件、242 项通过；新增每回合唯一入口、不同回合边界、历史 ID、
  流式/缺 ID 跳过、全部文本保留与技术字段移除回归。
- `npm.cmd run build`：通过，包含 TypeScript；已有大 chunk 提示仍在。本次未改 Rust。
- `node scripts/turn-reasoning-browser.mjs`：实际 Edge headless 加载 React 页面，IPC/数据为夹具；
  覆盖四种收包顺序、WS ACK/流式替换断言、分段不重复入口、全正文保留、文本安全、错误/空记录重试、
  角色切换迟到结果、动态角色名、带 canonical ID 的历史加载、设置入口与刷新后的偏好保持。
- 旁白截图在 `.tmp/turn-reasoning-wide.png`、`.tmp/turn-reasoning-narrow.png`、
  `.tmp/turn-reasoning-history.png`；本地产物不提交。

## Open / roadmap

- **open**：确认部署版本并验证真实历史 turn_id 与思考恢复；详见后端交接单。
- **open**：真实 Tauri/后端归档/release 联调，不能以 IPC 夹具代替。
- **roadmap**：WS-only 另一端无 canonical ID；无关联旧日志、QQ、主动消息、Dream、Stage、手机 UI。
- **open**：480px 默认宽侧栏挤压聊天流为已有全局布局问题；窄屏面板验证先收起侧栏。
- **open**：后端三仓总账仍待其仓同步，本单不越过用户明确的仓库范围。
