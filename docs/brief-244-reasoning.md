# Brief 244：桌面消息模型返回思考

日期：2026-09-11。状态：本仓实现及自动/浏览器验收完成，整体 **partial**，真实后端与
Tauri/release 验收 **open**。来源：`../Emerald-presence/cc-tasks/244-frontend-reasoning-handoff.md`。
本单只修改本仓；手机实现、后端工单及总账没有跨仓写入。

## 当前实现

- Reality 主聊天 assistant 气泡保存 canonical `turnId`。HTTP `msg_id` 只匹配 WS，
  成功响应中的 `turn_id` 才用于思考查询；覆盖 WS 先到、HTTP 先到、流式替换、HTTP fallback
  和尚未播放完的分段。历史仅使用已有显式 `entry.turn_id`，不按时间或内容猜测。
- 默认收起“模型返回思考”；点击才调用 `load_turn_reasoning({ turnId })`。
  展示每次调用的模型、seq、completed/interrupted、全部 parts 的 source 和文本。
  completed 文案明确仅协议消费完成，仍可能触及长度上限。
- Rust 复用 `http_client()`、`authorized_request()`，使用标准 desktop Bearer、
  `no_proxy()`、15 秒超时和 URL path segment 编码。不新增凭据，不调用 admin 全局归档。
  HTTP 失败只传状态码，不将后端错误正文泄露给 UI。
- API 仍经 `invokeGated`；401 进入既有连接门禁，403 权限不足，404 版本不支持，
  503 稍后重试；其他失败通用提示。空记录显示“本回合没有可用的模型思考记录”，允许重读。
- 每个 ChatPanel 持有按 turn_id 索引的内存缓存，最多 50 个非空结果；在途查询合并，
  空结果/失败不负缓存，手动重读绕过已缓存记录。卸载清空缓存并拒绝旧代响应。
  组件卸载/收起忽略迟到结果；角色 ID 通知重建 ChatPanel，头像 revision 不触发重建。
- 仅 React 文本节点渲染思考，没有 HTML 注入、工具调用、聊天回灌或 TTS 播放。
  中文和英文文案均为语义 i18n key；无新偏好、落盘或自动轮询。

## 三面闭环检查

| 检查面 | 证据与结论 |
|---|---|
| 后端管理与观测 | 只读核对 `admin/routers/observability.py`：回合端点要求 memory.read，已有 available/entries 与 503；全局归档仍 admin-only。`settings_thinking.py` 与管理面 feature-center 的生成设置独立，本单不新增配置/effective state/审计/trace/队列。 |
| 桌面设置与手机 | 桌面只读展开，无生成开关；手机 `lib/models/app_models.dart` 已分别解析 msgId/turnId，但 lib 无 reasoning 读取/展示实现。本单不改 Flutter/Android、后台服务、relay 或 poll/ack。手机 UI 留 roadmap。 |
| 原链路与相邻路径 | 只读核对 owner `admin/routers/chat.py` 返回 `msg_id = _stream_msg_id or turn_id`；本仓 sendChat → HTTP → correlation → WS/fallback 原正文、分段、去重、ack 不变。仅补 canonical 字段和单独 GET；memory.read 权限由后端裁决，无客户端权限真值副本。 |

## 已完成验收

- `npm.cmd test`：57 个文件、238 项通过（含本单 12 项）。
- `npm.cmd run build`：通过（包含 TypeScript）；已有大 chunk 提示仍在。
- `cargo check`：通过。
- `node scripts/turn-reasoning-browser.mjs`：Edge headless 实际加载 React 页面，Tauri IPC
  与模型响应为夹具，不连接真实后端。四种路径 fallback、WS 先到、流式完成、HTTP 先到均通过；
  确认 transport ID 与 canonical ID 不同仍查询正确，同回合多气泡只读取一次，正文不重复。
- 浏览器覆盖默认收起/懒加载、多次调用、中断状态、403/404/503/500、空记录重读、401 原门禁、
  HTML 样式的原文安全显示、旧消息无入口、真实 activeCharacter 通知及迟到结果隔离。
- 浏览器在 1280×900 与收起侧栏的 480×800 下截图目检，通过面板换行与宽度检查。
  本地重现截图位于 `.tmp/turn-reasoning-wide.png`、`.tmp/turn-reasoning-narrow.png`，不提交产物。

## 未完成与交接

- **open**：真实 Tauri WebView + 实际 desktop profile token + 后端模型归档的全链路验证，
  包括实际流式、多步工具/中断归档、后端重启及 release 包。浏览器 IPC 夹具不替代这些验收。
- **roadmap**：WS-only 另一端目前没有 canonical turn_id，不能将 transport msg_id 当作回合；
  保留无入口，待后端明确关联契约。无关联旧归档、QQ、主动消息、Dream、Stage 不回填。
- **roadmap**：手机同类 UI 和真机验证由手机仓独立实施。
- **open**：480px 保留默认宽侧栏会挤压整个聊天区，是已有全局布局问题；本单窄屏验收收起侧栏。
- **open**：`../Emerald-presence/docs/three-repo-interface-catalog.md` 当前仍写客户端 roadmap，
  本单遵守“在本仓库”范围未修改。建议后端仓同步：桌面关联/IPC/UI **current**，
  浏览器夹具验证完成，真实 Tauri/后端验收 **open**，手机及 WS-only 关联 **roadmap**。

本单不对外发布，不新增或改变 HTTP/WS 正文、mobile poll/ack、TTL、relay、通知行为，
不修改 `thinking.enabled`，不要求管理员凭据。
