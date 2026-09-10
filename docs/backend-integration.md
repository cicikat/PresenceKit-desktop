# docs/backend-integration.md — 后端接口与接入现状


## Brief 242：统一偏好与后端设置职责（2026-09-10，current）

此条目替代下文历史七分类/Activity 独立偏好的描述。Chat 偏好现为常规、界面、角色与
对话、桌宠与互动、高级。模型方案、角色模型/资源绑定、对话风格、思考、工具循环、
段落兜底和后端权限编辑迁往管理面板。Reality 世界书/提示词启用组合与角色头像由管理面
创作页提供；本地外观头像与截图同意、语音播放、陪玩现场控制仍保留。

`CurrentCharacterStatus` 使用现有 `get_prompt_assets`/`patch_prompt_assets`；只读展示
`model_routing/effective_profile/resolved_chat_preset/resolved_chat_model/global_profile/
binding_source/chat_configured`，缺字段显示未知。切换角色、聚焦或手动刷新重新读取；
缓存按代次作废，旧响应不会覆盖切换后的角色。模型重置在管理面使用原有 null 语义。

`ActivityAppearanceSettings` 合并活动外观，保留 reading.fontSize/maxWidth、board.theme、
chess.pieceStyle 与 activity.debug 五个原 key。Activity 的 `open-activity-preferences`
事件打开 Chat 偏好；Activity/Reading 继续挂载，不关闭会话或另开 WebView。
移除无引用的旧模型/能力设置组件和独立 Activity 偏好，保留其他消费者需要的 API/IPC。
本次未改 Rust、WS、scope、ack、TTL、手机或 relay；后端能力真值仍由后端维护。

验收：相关 Vitest 40 项、TypeScript、生产构建通过；浏览器夹具实际挂载 React 页面，
覆盖角色切换、缺字段、失败重试、聚焦刷新、活动中打开偏好和阅读第 2 页保持。
`observe`：真实 Tauri 原生窗口与真实后端/手机设备联调未完成；夹具 IPC 不代表实机。


## API 思考存档（2026-09-09）

后端已默认独立保存 API 返回的思考，提供 admin-only
`GET /observability/llm-reasoning`（limit/before/model 元数据分页）与
`GET /observability/llm-reasoning/{call_id}`（parts 正文）。desktop token 无权访问，
本客户端尚无 IPC/展开 UI。call_id 表示一次模型请求，尚不关联聊天 turn_id；后续展示
需要受限读取契约和明确关联，不能按时间猜测。现有聊天 HTTP/WS 和 ack 不变。

本文档记录本仓当前和 `Emerald-presence` 的连接方式。三仓接口总账见
`Emerald-presence/docs/three-repo-interface-catalog.md`；桌面消息细节统一见
`docs/protocol-v0.md`。

群梦 `POST /group/{id}/dream/enter` 的预期 409 返回 `detail.code`、`detail.message` 与 `detail.retryable`。客户端按 code 分支，任一 409 后刷新一次 state；`GROUP_DREAM_ALREADY_ACTIVE` 刷新到 active 时接续既有群梦。此 HTTP 契约不新增 WebSocket 帧，5xx 正文不透传到 WebView。

---

## 后端来源

后端项目：`Emerald-presence` 仓库（通常与本仓库同级）

关键后端文件：

| 功能 | 后端文件 |
|---|---|
| FastAPI 管理服务和 WS 路由 | `admin/admin_server.py` |
| 桌宠 WS 连接管理 | `channels/desktop_ws.py` |
| 桌宠 channel fallback | `channels/desktop.py` |
| HTTP 对话入口 | `admin/routers/chat.py` |
| 短期历史接口 | `admin/routers/memory.py` |
| 花园状态接口 | `admin/routers/garden.py` |
| 情绪状态接口 | `admin/routers/mood.py` |
| 活动状态接口 | `admin/routers/activity.py` |
| 日记只读接口 | `admin/routers/diary.py` |
| 聊天日志只读接口 | `admin/routers/chat_log.py` |
| 感知接口 | `admin/routers/sensor.py` |

默认服务地址：`http://127.0.0.1:8080`

## 客户端本地配置

P-02 之后，本仓 的后端连接配置从本地配置文件读取。仓库提供模板：

```text
config/client.example.json
```

本机覆盖文件为：

```text
config/client.local.json
```

`config/client.local.json` 已加入 `.gitignore`，不要提交真实 admin token。也可跳过手改 JSON：客户端内
偏好 → 系统设置 页提供了可视化编辑（backendBase / websocketBase / token 三字段 + 测试连接 + 保存），
详见下方「HTTP：连接设置页」一节。文件不存在或字段缺失时，客户端使用当前兼容默认值：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `backendBase` | `http://127.0.0.1:8080` | Rust Tauri command 访问后端 HTTP 的 base URL，不包含末尾 `/` |
| `websocketBase` | `ws://127.0.0.1:8080/ws/desktop` | Rust 原生 WebSocket bridge 连接地址；配置中的 legacy `token` query 会被移除 |
| `adminToken` | 当前本地开发默认 token | 仅 Rust 侧读取，用于 HTTP / WebSocket Bearer header，不透传给前端日志 |
| `sensorConfig.enabled` | `true` | 是否启动 Tauri 内嵌 sensor runner |
| `sensorConfig.windowSeconds` | `30` | sensor 聚合窗口长度 |
| `sensorConfig.tickSeconds` | `5` | sensor 采样/推送 tick |
| `sensorConfig.sensorVersion` | `emerald-client-rust-1.0` | sensor 版本标识 |

兼容说明：旧的 AppData `sensor_config.json` 仍可作为 sensor 兼容配置来源；新的 `config/client.local.json` 优先级更高，并同时覆盖 HTTP base、WS base、admin token 和 sensor 配置。

Rust/Tauri HTTP client 统一显式禁用代理并设置超时：普通请求 15 秒，chat / wake / Dream 等 LLM 路径 120 秒。使用共享安全错误处理（`safe_http_error`）的受保护路径按后端 SEC-AUTH-2 语义区分错误：401（token 无效）返回 `HTTP 401: 认证失败，请检查本地 token 配置`；403（token 有效但 scope 不足）返回 `HTTP 403: token 权限不足（缺少 scope，检查该 token 的 profile 是否为 desktop）：<detail>`，detail 为后端透传的所需 scope；429（认证失败限速）返回 `HTTP 429: 认证失败次数过多，来源 IP 已被临时限制，稍后重试`。以上文案均不包含 token 值。

---

## 当前客户端调用点

| 客户端文件 | 调用 |
|---|---|
| `src/shared/api/backend.ts` | `sendChat()`、`loadGardenState()`、`loadDiaryList()`、`loadDiaryEntry()`、`loadSensorRealtime()`、`getPromptAssets()`、`patchPromptAssets()` |
| `src/shared/api/chat-settings.ts` | `getChatSettings()`、`setChatMode()`、`setChatStyle()`、`setChatMultiMessage()`，由偏好面板「其他」tab 的 `ChatSettingsSection` 调用 |
| `src/shared/api/ws.ts` | `wsClient.connect()`、通过 Tauri commands / events 完成 legacy WS 收发 |
| `src/shared/state/toolStatusOverlay.ts` | 内存态 `tool_status` 队列；仅覆盖动向 NOW，不写 StateEngine、timeline 或本地偏好 |
| `src/shared/design-mod/presenters/` | 统一 Sidebar Status/Flow/Garden/Diary presenter；复用 Tauri API、共享 mood/activity poller，不新增后端接口 |
| `src-tauri/src/ws_bridge.rs` | 原生 WS 连接、Bearer header、URL 清洗与前端事件桥接 |
| `src-tauri/src/lib.rs` | `send_chat`、`load_garden_state`、`load_diary_list`、`load_diary_entry`、`get_prompt_assets`、`patch_prompt_assets`、头像 / Dream 背景文件 commands、Dream 字体目录扫描、主题 / 布局 Mod manifest 与 CSS 扫描 |
| `src/windows/chat/components/ChatPanel.tsx` | 启动历史、发送消息、订阅 WS 主动消息 |
| `src/windows/chat/components/Ribbon.tsx` | 读取 WS 连接状态 |
| `src/windows/chat/components/SubGarden.tsx` | 消费 `GardenPresenter` 展示花园状态 |
| `src/windows/chat/components/SubDiary.tsx` | 消费 `DiaryPresenter` 展示日记列表并调用独立详情窗口 |
| `src/windows/chat/components/SubStatus.tsx` / `SubFlow.tsx` | 消费 `StatusPresenter` / `FlowPresenter`；不自行建立 HTTP、WS 或 sensor 轮询 |
| `src/windows/chat/ChatWindow.tsx` | Chat 偏好「世界」页读取并保存 Reality Prompt Assets |
| `src/shared/api/connectionSettings.ts` | `getTokenStatus()`、`testBackendAuth()`、`saveClientConfig()`，由偏好面板「系统设置」tab 的 `ConnectionSettingsPage` 调用 |
| `src-tauri/src/client_config.rs` | `get_token_status`、`test_backend_auth`、`save_client_config` |

---

## HTTP：连接设置页（偏好 → 系统设置）

桌面端不再要求手改 `config/client.local.json` 才能配置后端连接：偏好面板新增「系统设置」tab（编号 0，
`ConnectionSettingsPage`），提供 backendBase / websocketBase / token 三个字段与「测试连接」「保存」两个按钮。

- **Token 不回显明文**：`load_public_client_config` 一直不返回 token；这里新增的 `get_token_status`
  只返回 `{configured, prefix}`（prefix 为已保存 token 的前 8 位），页面上 token 输入框永远从空白开始，
  只用于填写新值，留空保存即保留原值不变。
- **测试连接** 用输入框里的候选值（而非已保存值）调 `test_backend_auth(backendBase, adminToken)` →
  Rust reqwest GET `{backendBase}/auth/whoami`（该端点零 scope 依赖，任意有效 token 可调，见后端仓
  `docs/security.md`）。成功显示 `{label, scopes}`；401 显示「token 无效」，其余走通用 HTTP 状态码文案。
- **保存** 调 `save_client_config(backendBase, websocketBase, adminToken?)`，写回
  `local_config_candidates()` 中第一个已存在的文件（都不存在则用 `app_config_dir()`，自动建目录），
  读→JSON 层面 merge→原子写（先写 `.tmp` 再 `rename`），只覆盖这三个字段，文件内其他自定义键保持不变。
  Token 字段为空则不写入 `adminToken` 键，即不改动磁盘上已有的值。
- **即时生效范围**：HTTP 请求每次都经 Rust `load_client_config()` 重新读文件，保存后无需重启即可生效；
  WebSocket 连接不会自动重连，保存成功后页面出现「立即重连」按钮，调用 `wsClient.reconnect(url)`
  （断开当前连接后用新地址重新连接一次）。
- 前端页面在改动 token 前会弹一次确认对话框（仅当输入框非空、确实要覆盖已保存 token 时触发）。

---

## HTTP：生成后段落兜底开关（偏好 → 系统设置）

`OutputSegmentEnforceSettingsPage` 只展示普通运行时开关与后端返回的有效长度阈值，不承载 Prompt
检视信息。请求集中在 `src/shared/api/outputSegmentEnforce.ts`，并通过 Tauri command 访问后端：

```text
页面挂载 → invoke("get_output_segment_enforce_settings")
  → Rust GET /output-segment-enforce

用户切换 → invoke("update_output_segment_enforce_settings", { enabled })
  → Rust PUT /output-segment-enforce { "enabled": bool }
```

两条 Rust 请求均复用本地 Bearer token、`http_client().no_proxy()` 与统一 HTTP 错误处理。PUT 不提交
`min_len`，因此桌面开关不会覆盖管理面板或配置文件中设置的阈值；响应直接回写 `{enabled, min_len}`。

---

## HTTP：Reality Prompt Assets 设置

Chat 偏好「世界」页只管理 Reality Prompt Assets，不复用 Dream 设置接口。

读取路径：

```text
PromptAssetsSettings mount
  → getPromptAssets()
  → invoke("get_prompt_assets")
  → Rust reqwest GET http://127.0.0.1:8080/settings/prompt-assets
```

保存路径：

```text
PromptAssetsSettings 用户修改
  → patchPromptAssets(patch)
  → invoke("patch_prompt_assets", patch)
  → Rust reqwest PATCH http://127.0.0.1:8080/settings/prompt-assets
  → 使用响应 active 回写局部状态
```

GET 响应：

```json
{
  "characters": [{"id": "yexuan", "label": "叶瑄"}],
  "lorebooks": [{"id": "base", "label": "base", "kind": "reality_lorebook"}],
  "jailbreaks": [{"id": "base", "label": "base", "kind": "reality_jailbreak"}],
  "active": {
    "active_character": "yexuan",
    "enabled_lorebooks": ["base"],
    "enabled_jailbreaks": ["base"]
  }
}
```

客户端兼容旧版字符串数组与新版 `{ id, label, kind }` 数组；UI 展示 `label`，保存时仅提交 GET 返回列表中存在的角色卡 `id`、世界书 `id` 和破限 `id`，不展示后端文件路径。GET / PATCH 均由 Rust 读取 admin token，并使用 `reqwest.no_proxy()`。

角色卡头像上传在 Chat 世界页先复用客户端 `AvatarCropper` 裁剪为 256 × 256 PNG，再由 Tauri `upload_character_avatar` POST `/settings/characters/{char_id}/avatar`。客户端只依赖该 endpoint 的请求/响应语义；后端物理落盘位置以 backend 的 data-taxonomy 与 DataPaths 为准，客户端不得依赖。

---

## HTTP：用户发送消息

当前真实路径：

```text
ChatPanel.send()
  → sendChat(message, replyTo?)
  → invoke("send_chat", { message, replyTo? })
  → Rust reqwest POST http://127.0.0.1:8080/desktop/chat
```

请求：

```json
{
  "message": "今天好累"
}
```

右键引用回复（cc-tasks/36，对齐 Emerald-presence Brief 98 §2）时额外携带 `reply_to`：

```json
{
  "message": "今天好累",
  "reply_to": {
    "text": "被引用的角色气泡原文，客户端截断至 200 字",
    "ts": 1752900000.0
  }
}
```

`reply_to` 可选；`ts` 为该气泡消息的 epoch 秒时间戳（v0.1 未做逐段时间戳，取整条消息时间戳）。旧后端忽略该字段，退化为普通消息，不报错。

后端实际返回：

```json
{
  "reply": "……",
  "emotion": "gentle",
  "turn_id": "assistant-correlation-id",
  "msg_id": "assistant-correlation-id"
}
```

客户端声明并消费：

```ts
interface ChatResponse {
  reply: string;
  emotion: string;
  turn_id?: string;
  msg_id?: string;
}
```

assistant correlation ID 已对齐：`HTTP turn_id = HTTP msg_id = WS channel_message.msg_id = WS message_segments.msg_id`。ChatPanel 优先按 `msg_id` 对账 HTTP/WS 回复；content hash 仅作为旧后端未返回 `msg_id` 或异常路径的 fallback。

`channel_message` 可额外带 `sticker?: { kind: 'sticker'; emotion: string; data_url: string }`。这是后端表情包副作用的 live payload：`content` 可以为空，客户端以 `data_url` 渲染图片气泡，`emotion` 用作无障碍文本；短期历史暂不持久化该字段。

`POST /desktop/wake` 有 assistant reply 时同样返回 `turn_id` / `msg_id`，并遵循相同 correlation ID 约束。

旧 v1 方案的 WS `user_message` 设想已降级为 post-v0.1 roadmap，见 [protocol-v0.md](protocol-v0.md)；当前 HTTP 路径为正式契约。

---

## HTTP：历史记录

ChatPanel 启动和按日懒加载只通过 Tauri `load_chat_log_dates` / `load_chat_log_day`
读取后端 `/chat-log/*`。Brief 72 已删除无调用者的 `/memory/{user_id}/short-term`
兼容 bridge 和 `bot_user_id` 配置；桌面客户端不会从该路径读取历史或将用户 ID 放入请求。
前端不传 admin token，Rust 从本地配置读取 `ADMIN_TOKEN` 并作为 Bearer header 调用当前
保留的 Tauri HTTP commands。

---

## HTTP：加载花园状态

当前真实路径：

```text
Sidebar garden tab
  → SubGarden mount
  → loadGardenState()
  → invoke("load_garden_state")
  → Rust reqwest GET http://127.0.0.1:8080/garden/state
```

后端要求 Bearer token：

```http
Authorization: Bearer <admin_token>
```

当前 token 由 Rust 侧 `src-tauri/src/client_config.rs` 从本地配置读取；前端 `src/shared/api/backend.ts` 不再保存或传递 `ADMIN_TOKEN`。后端协议未变，仍要求 Bearer token。

后端文件：

- `Emerald-presence` 仓库（通常与本仓库同级）的 `admin\routers\garden.py`
- 同仓库的 `core\garden\manager.py`
- 同仓库的 `docs\garden.md`

返回结构：

```json
{
  "slots": [
    {
      "slot_key": "calm",
      "flower_id": "daisy",
      "name": "雏菊",
      "en_name": "Daisy",
      "stage": "seed",
      "growth": 0,
      "stage_min": 0,
      "stage_max": 100,
      "stage_progress": 0,
      "mood_keys": ["neutral", "gentle"],
      "last_watered": null
    }
  ],
  "harvest_count": 0,
  "vase_count": 0
}
```

客户端目前每 30 秒轮询一次，只读展示：

- 五个花槽。
- 当前阶段和阶段进度条。
- bloom 标签。
- `harvest_count` / `vase_count` 暂未在 UI 中展开为详情。

---

## HTTP：五类观测面板

成长、视觉、支出、群聊仲裁和记忆摘要已迁入 PresenceKit 管理面板的“观测”分类。桌面客户端不再代理
这些管理端 GET 请求，也不再在聊天 Ribbon 暴露运维入口。

---

## HTTP：加载日记列表

当前真实路径：

```text
Sidebar diary tab
  → SubDiary mount
  → loadDiaryList()
  → invoke("load_diary_list")
  → Rust reqwest GET http://127.0.0.1:8080/diary/list
```

后端要求 Bearer token。后端 endpoint 是客户端的数据来源 authority；日记的物理路径以 backend 的 data-taxonomy 与 DataPaths 为准，客户端不得依赖。

返回结构：

```json
{
  "entries": [
    { "date": "2026-05-15", "title": "今天的光不对", "emotion": null }
  ],
  "count": 8
}
```

`emotion` 字段当前统一返回 `null`，客户端已预留 UI，等待后端扩展（见 `docs/known-issues.md`）。

---

## HTTP：加载单篇日记

当前真实路径：

```text
SubDiary 点击 entry
  → loadDiaryEntry(date)
  → invoke("load_diary_entry", { date })
  → Rust reqwest GET http://127.0.0.1:8080/diary/{date}
```

`date` 格式 `YYYY-MM-DD`；文件不存在返回 404；格式错误返回 422。

返回结构：

```json
{
  "date": "2026-05-15",
  "title": "今天的光不对",
  "emotion": null,
  "body": "今天的光不对。\n\n阳台那边……"
}
```

`body` 是 strip 掉首行 `# ` heading 后的剩余正文，保留 `##` 子标题和段落结构，原样 markdown 文本。

后端文件：`Emerald-presence` 仓库（通常与本仓库同级）的 `admin\routers\diary.py`

---

## HTTP：加载聊天日志日期列表

当前真实路径：

```text
ChatPanel mount
  → loadChatLogDates()
  → invoke("load_chat_log_dates")
  → Rust reqwest GET http://127.0.0.1:8080/chat-log/dates
  ← { dates: ["2026-05-16", "2026-05-15", ...], count: N }
```

后端要求 Bearer token。后端 endpoint 是客户端的数据来源 authority；聊天日志的物理路径、兼容读取和归档策略以 backend 的 data-taxonomy 与 DataPaths 为准，客户端不得依赖。接口路径不含 QQ 号；客户端不持有或推导该内部标识。

**重要**：接口路径不含 QQ 号。`owner_qq` 由后端从 `config.yaml` 的 `scheduler.owner_id` 字段读取，客户端零 QQ 知识。

返回结构：

```json
{
  "dates": ["2026-05-16", "2026-05-15", "2026-05-14"],
  "count": 3
}
```

---

## HTTP：加载单日聊天日志

当前真实路径：

```text
ChatPanel 启动或滚顶触发
  → loadChatLogDay(date)
  → invoke("load_chat_log_day", { date })
  → Rust reqwest GET http://127.0.0.1:8080/chat-log/{date}
  ← { date, entries: [...], raw_fallback: bool }
```

`date` 格式 `YYYY-MM-DD`；文件不存在返回 404；格式错误返回 422；文件无法解析任何条目时 `raw_fallback: true`，entries 为空。

返回结构：

```json
{
  "date": "2026-05-16",
  "entries": [
    {
      "time": "20:19",
      "user": "叶瑄！",
      "assistant": "他听到你那声……",
      "ts": 1778933947.0,
      "turn_id": "assistant-correlation-id"
    },
    {
      "time": "20:21",
      "user": "",
      "assistant": "该休息一下了。",
      "ts": 1778934062.0,
      "turn_id": "trigger-correlation-id"
    }
  ],
  "raw_fallback": false
}
```

`ts` 是秒级 Unix 时间戳，`turn_id` 是该轮 canonical correlation ID。客户端用
`ts` 推进 `/desktop/wake` 的 `last_seen` 游标，并优先用 `turn_id` 对账历史回放和
WebSocket 消息；`time` 仅用于旧响应兼容和显示。assistant-only trigger turn 的
`user` 为空字符串，客户端仍渲染 assistant 消息。

后端文件：`Emerald-presence` 仓库（通常与本仓库同级）的 `admin\routers\chat_log.py`

---

## HTTP：获取情绪状态

当前真实路径：

```text
loadMoodState()
  → invoke("load_mood_state")
  → Rust reqwest GET http://127.0.0.1:8080/mood/state
```

后端要求 Bearer token。数据源：`core/memory/mood_state.py load()`，返回持久化的情绪状态（两轮漂移才切换，非即时检测值）。

后端文件：`Emerald-presence` 仓库（通常与本仓库同级）的 `admin\routers\mood.py`、`core\memory\mood_state.py`

返回结构：

```json
{
  "current": "neutral",
  "intensity": 0.42,
  "previous": "gentle",
  "updated_at": 1748000000.0,
  "pending": null
}
```

前端映射：`src/shared/state/mood-mapping.ts` `backendMoodToFrontend(current)` 将后端 token 转成 7 个中文 Mood 之一。

---

## HTTP：获取活动状态

当前真实路径：

```text
loadActivityState()
  → invoke("load_activity_state")
  → Rust reqwest GET http://127.0.0.1:8080/activity/current
```

后端要求 Bearer token。调用 `core.activity_manager.get_current()`，必要时自动切换到新活动（15-45 分钟随机间隔）。

后端文件：`Emerald-presence` 仓库（通常与本仓库同级）的 `admin\routers\activity.py`、`core\activity_manager.py`

返回结构：

```json
{
  "id": null,
  "text": "在读书",
  "arc": "evening",
  "started_at": 1748000000.0,
  "next_switch_at": 1748002700.0,
  "thinking_about_eligible": false
}
```

注：`id` 字段后端 state 文件中未存储，当前返回 `null`；`text` 是中文活动描述。

---

## HTTP：上传 sensor 实时快照

调用方:**本仓 内嵌 sensor 模块**(Tauri Rust 侧
`src-tauri/src/sensor/`,Phase 2f 实施)。

```text
本仓 (Tauri Rust sensor 模块)
  → POST http://127.0.0.1:8080/sensor/realtime
```

后端要求 Bearer token：

```http
Authorization: Bearer <admin_token>
```

请求体（嵌套 input / focus 结构，**不要展平**）：

```json
{
  "window_seconds": 30,
  "ts": 1748000000.0,
  "sensor_version": "1.0.0",
  "input": {
    "keystrokes": 142,
    "mouse_clicks": 8,
    "mouse_distance_px": 3420,
    "idle_seconds": 0
  },
  "focus": {
    "app": "Code.exe",
    "title_hint": "ChatPanel.tsx",
    "switch_count": 3
  }
}
```

响应：

```json
{
  "ok": true,
  "received_at": 1748000001.23
}
```

字段说明：

| 字段 | 类型 | 含义 |
|---|---|---|
| `window_seconds` | int (1-300) | 客户端聚合窗口长度，固定推 30，字段保留是为未来调整不破协议 |
| `ts` | float | 客户端推送时的 unix 秒 |
| `sensor_version` | str | sensor 模块版本号(Tauri Rust 侧),用于事后排查清洗规则/聚合算法 bug |
| `input.keystrokes` | int ≥ 0 | 窗口内累计键击数 |
| `input.mouse_clicks` | int ≥ 0 | 窗口内累计点击数 |
| `input.mouse_distance_px` | int ≥ 0 | 窗口内累计鼠标移动像素 |
| `input.idle_seconds` | int ≥ 0 | 窗口末尾连续 idle 秒数，驱动 presence |
| `focus.app` | str | 进程名，允许空字符串 |
| `focus.title_hint` | str | 已清洗的窗口标题，允许空字符串，server-side 兜底截断 >80 字符 |
| `focus.switch_count` | int ≥ 0 | 窗口内焦点切换次数 |

`title_hint` 清洗规则在 Tauri Rust sensor 模块的 `title_sanitizer` 内实现,后端信任客户端清洗结果。约定:

- 浏览器：只保留域名（`github.com`，不保留完整 URL）
- 编辑器：只保留文件名（`ChatPanel.tsx`，不保留完整路径）
- 聊天软件、Other、未知应用、Explorer / Office / PDF / 压缩工具：直接置空字符串
- 黑名单关键词（密码、银行、医疗等）整条置空

后端文件：`Emerald-presence` 仓库（通常与本仓库同级）的 `admin\routers\sensor.py`、`core\memory\realtime_state.py`

---

## HTTP：读取 sensor 实时快照

调用方：**本仓 主进程**（SubStatus 轮询消费）。

```text
本仓 SubStatus
  → loadSensorRealtime()
  → Rust load_sensor_realtime
  → GET http://127.0.0.1:8080/sensor/realtime
```

后端要求 Bearer token。无快照时当前后端直接返回 `{ "_no_data": true }`。客户端 Rust command 使用 `reqwest.no_proxy()`；为兼容旧后端，404、JSON `null`、空对象 `{}`，以及 `input` / `focus` / `window_seconds` 缺失或为 `null` 的旧式响应也统一映射为 `{ "_no_data": true }`。TypeScript 消费侧仍会校验完整结构，校验不通过时静默降级为 mood 派生信号，不能让 HTTP 200 的残缺响应进入渲染。

无数据时(sensor 模块未启动或刚重启,例如 本仓 还在启动中)响应:

```json
{
  "_no_data": true
}
```

有数据时响应：

```json
{
  "ts": 1748000000.0,
  "stale_seconds": 12,
  "presence": "active",
  "continuous_at_desk_seconds": 5400,
  "sensor_version": "1.0.0",
  "window_seconds": 30,
  "input": {
    "keystrokes": 142,
    "mouse_clicks": 8,
    "mouse_distance_px": 3420,
    "idle_seconds": 0
  },
  "focus": {
    "app": "Code.exe",
    "title_hint": "ChatPanel.tsx",
    "switch_count": 3
  }
}
```

`presence` 派生规则：

| `idle_seconds` 区间 | `presence` |
|---|---|
| < 60 | `active` |
| 60 ≤ idle < 300 | `idle` |
| ≥ 300 | `away` |

无数据时不覆盖 StateEngine；其默认 `presence` 仍为 `active`。

`continuous_at_desk_seconds` 累积规则：

- 由后端 `realtime_state` 在每次 POST 接收时维护，重启清零
- 当 `idle_seconds < 300` 时累加本次 `window_seconds`
- 当 `idle_seconds ≥ 300` 时清零（视为用户离开）
- 当后端发现两次 POST 间隔 > 120s 时保守重置(视为 sensor 模块中断过,例如 本仓 被关闭)
- 本仓 重启或后端重启均清零,无持久化

`stale_seconds` 是后端算的"距上次 POST 多少秒",SubStatus 用这个判断 sensor 模块是否还在采集（>90 秒视为掉线，UI 静默降级）。

后端文件：`Emerald-presence` 仓库（通常与本仓库同级）的 `admin\routers\sensor.py`、`core\memory\realtime_state.py`

> `sensor_aware` 触发器默认关闭，后端 `config.yaml` 设置
> `scheduler.sensor_aware.enabled: true` 才生效，重启服务后 scheduler 启动日志会打出 `ENABLED` 确认。

---

## HTTP：视觉观察生产者（Windows）

调用方：`src-tauri/src/sensor/visual.rs`。本地默认关闭；Chat 偏好「系统设置」的
`VisualPerceptionSettingsPage` 通过 Tauri command 保存本机开关与 1–60 分钟采样间隔。

```text
采样 tick
  → GET /perception/visual/config（Bearer desktop token + sensor.write）
  → 本地 opt-in 检查 → 锁屏/无桌面会话检查
  → 主屏截取（仅内存）→ dHash 比对
  → 仅显著变化：内存 JPEG（长边 <= 1280）
  → POST /perception/visual multipart { image, source=screen }
```

- 预检失败或 `enabled=false` 按关闭处理，**不截图**；服务端不会向客户端返回视觉模型地址或密钥。
- 截屏、缩放、哈希和 JPEG 编码都不落盘；稳定画面只被内存比对，不会周期性上传。
- 上传响应为 `{ accepted, processing }`；`processing=false`、锁屏跳过和失败均只更新本地设置页状态/计数，避免把图片或错误细节写入日志。
- 后端同一 `screen` source 有 5 分钟冷却，客户端不将此冷却当作上传定时器。

## /sensor/realtime（GET）

读取最新一份 sensor 快照。后端 `Emerald-presence` 仓库（通常与本仓库同级）的 `admin\routers\sensor.py:213`。

### 响应 schema

200 OK，返回最新一份合并后的快照：
- `ts`: float（采集端时间戳）
- `stale_seconds`: int（服务端附加，`now - received_at`）
- `presence`: `"active" | "idle" | "away"`
- `continuous_at_desk_seconds`: int
- `sensor_version`: string
- `window_seconds`: int
- `input`: { keystrokes, mouse_clicks, mouse_distance_px, idle_seconds }
- `focus`: { app, title_hint, switch_count }
- `screen`: null 或 { package_name, app_label, window_title, visible_text[], clickable_text[] }

无数据时后端可能返回 200 + null body 或 404，客户端 Rust command 统一映射为 `{ _no_data: true }`。

### sensor_version 已知取值

- PC 端（src-tauri/src/sensor/）：`emerald-client-rust-1.0`
- 安卓端（accessibility service）：`android_accessibility_1.0`

### 存储语义

- POST /sensor/realtime 是**单字典内存覆盖**，无 source 分桶，最后写入者赢
- 多个 source 同时写入：GET 拿到的是最后完成写入的那一份
- 重启后端清零，无持久化

### stale 阈值

- 后端 sensor_aware 触发器（`core/scheduler/sensor_events.py:190`）硬编码 **90 秒**，超过则返回空事件列表
- 客户端 SubStatus 跟齐：stale_seconds > 90 时切回 mood 派生算法

---

**meta 行格式**：`> emotion:xxx intensity:N turn_id:xxx [trigger:xxx]`（`>` 开头，parser 跳过整行）。`trigger:xxx` 字段仅在 scheduler 触发的回复中存在，语义为触发源名（如 `morning_greeting`、`diary_check`），客户端目前不消费该字段。

---

## WebSocket 与桌面协议

当前正式协议为 v0.1（legacy 冻结版）。WS 消息全集、连接语义、9 类 desktop action allowlist、HTTP `/desktop/chat` 与 WS 回复的对账契约，以及未排期的 v1 roadmap，统一以 [protocol-v0.md](protocol-v0.md) 为权威。

本文件只记录 HTTP/Tauri 接入细节，不再复制协议定义，避免双份文档漂移。ChatPanel 的回复去重、fallback、早到 segments 与 TTL 规则见 [chat-correlation.md](chat-correlation.md)。

---
  ## Diary presentation contract

  `/diary/list` and `/diary/{date}` are presentation-only views. The backend
  keeps the `## 今日事件` section for prompt and search consumers, but does
  not return it to the desktop client. `title`, `feeling`, and the legacy
  `body` compatibility field are derived from `## 今日感受`; unheaded legacy
  files are treated as one feeling block. Empty feelings are rendered through
  the localized `diary.noFeeling` empty state.

  ## Tauri IPC Commands

文件：`src-tauri/src/lib.rs`

| Command | 方向 | 说明 |
|---|---|---|
| `native_ws_connect()` | 前端 → Rust → 后端 | 使用本地 admin token 建立带 Bearer header 的原生 WebSocket |
| `native_ws_send(connection_id, message)` | 前端 → Rust → 后端 | 发送既有 legacy WS payload，不改变消息协议 |
| `native_ws_disconnect()` | 前端 → Rust → 后端 | 关闭当前原生 WebSocket |
| `send_chat(message, reply_to?)` | 前端 → Rust → 后端 | POST `/desktop/chat`；`reply_to` 可选，右键引用回复时携带 `{text, ts}`（cc-tasks/36） |
| `load_garden_state()` | 前端 → Rust → 后端 | GET `/garden/state`；Rust 侧读取 admin token |
| `load_diary_list()` | 前端 → Rust → 后端 | GET `/diary/list`；Rust 侧读取 admin token |
| `load_diary_entry(date)` | 前端 → Rust → 后端 | GET `/diary/{date}`；Rust 侧读取 admin token |
| `load_chat_log_dates()` | 前端 → Rust → 后端 | GET `/chat-log/dates`，路径不含 QQ；Rust 侧读取 admin token |
| `load_chat_log_day(date)` | 前端 → Rust → 后端 | GET `/chat-log/{date}`，路径不含 QQ；Rust 侧读取 admin token |
| `load_mood_state()` | 前端 → Rust → 后端 | GET `/mood/state`；Rust 侧读取 admin token |
| `load_activity_state()` | 前端 → Rust → 后端 | GET `/activity/current`；Rust 侧读取 admin token |
| `load_sensor_realtime()` | 前端 → Rust → 后端 | GET `/sensor/realtime`；Rust 侧读取 admin token，无数据统一返回 `_no_data` |
| `get_prompt_assets()` | 前端 → Rust → 后端 | GET `/settings/prompt-assets`；读取 Reality 角色卡、世界书、破限可用项和当前启用项 |
| `patch_prompt_assets(active_character, enabled_lorebooks, enabled_jailbreaks)` | 前端 → Rust → 后端 | PATCH `/settings/prompt-assets`；保存 Reality Prompt Assets 启用项并返回最新 `active` |
| `load_hidden_state_debug()` | 前端 → Rust → 后端 | GET `/debug/user-hidden-state`；只读返回 Phase 4.5 潜意识状态，并只读参考 `/dream/settings.display.physiological_arousal` 控制开发者字段显隐 |
| `action_minimize_window()` | 前端 → Rust | 执行 `minimize_window`，最小化当前 Tauri 窗口 |
| `action_open_url(url)` | 前端 → Rust | 执行 `open_url`，使用 `tauri-plugin-opener` 打开 URL |
| `action_show_notify(title, text)` | 前端 → Rust | 执行 `show_notify`，当前用 dialog fallback 展示 |
| `action_media_play_pause()` | 前端 → Rust | 执行 `media_play_pause`，Windows 发送媒体键，非 Windows stub log |
| `presence_nag(text, avatar)` | 前端 → Rust | 更新并显示单实例 `presence-nag` 置顶窗口；action type、`ws.ts` case 与 command 名保持一致 |
| `presence_nag_close_all()` | 前端 → Rust | 强制隐藏存在感弹窗；由 Esc、全部关闭入口和关闭设置调用 |
| `save_avatar(role, image_b64)` | 前端 → Rust | 保存 PNG 到 `app_data_dir()/avatars/`；头像和 Dream 日间 / 夜间背景共用 |
| `load_avatar(path)` | 前端 → Rust | 读取头像或 Dream 背景并返回 data URL |
| `read_avatars_json()` | 前端 → Rust | 读取头像和 Dream 日间 / 夜间背景配置；旧 `dream_background` 字段由前端兼容为夜间背景 |
| `write_avatars_json(json)` | 前端 → Rust | 写头像和 Dream 日间 / 夜间背景配置 |
| `list_dream_fonts()` | 前端 → Rust | packaged 优先扫描 `resource_dir/fonts`，debug/dev 回退源码 `public/fonts/`；目录不可用时报明确错误 |
| `list_themes()` | 前端 → Rust | debug / `npm run tauri dev` 只扫描 `public/themes/*/theme.json`；release / 安装包只扫描 `resource_dir/themes/*/theme.json`；原样返回 manifest，由前端校验 token 契约；缺失当前模式目录时报错，不跨模式 fallback |
| `read_theme_css(id, file)` | 前端 → Rust | 与 `list_themes()` 共用同一主题根；读取 `themes/<id>/<file>` 的磁盘 mod CSS；仅允许单级 id、同目录 `.css` 文件，并经 canonical 路径校验拒绝绝对路径、穿越和 symlink 逃逸；CSS 文本仍由前端 `inspectThemeCss()` 安检 |
| `list_layouts()` | 前端 → Rust | debug / `npm run tauri dev` 只扫描 `public/layouts/*/layout.json`；release / 安装包只扫描 `resource_dir/layouts/*/layout.json`；原样返回 manifest；缺失当前模式目录时报错，不跨模式 fallback |
| `read_layout_css(id, file)` | 前端 → Rust | 与 `list_layouts()` 共用同一布局根；读取 `layouts/<id>/<file>` 的磁盘 mod CSS；仅允许单级 id、同目录 `.css` 文件，并经 canonical 路径校验拒绝绝对路径、穿越和 symlink 逃逸；CSS 文本仍由前端 `inspectThemeCss()` 安检 |
| `list_design_mods()` | 前端 → Rust | debug 只扫描 `public/design-mods/*/mod.json`；release 只扫描 `resource_dir/design-mods/*/mod.json`；与文本和资源读取共用同一 design-mod 根，缺失当前模式目录时报错，不跨模式 fallback |
| `read_design_mod_file(id, file)` | 前端 → Rust | 读取当前 design-mod 包内的 UTF-8 manifest/entry/style/theme/layout 文本；只允许安全相对路径，canonical 校验拒绝绝对路径、穿越和 symlink 逃逸，单文件上限 10MB |
| `read_design_mod_asset(id, file)` | 前端 → Rust | 读取当前 design-mod `assets/` 下的图片、字体、纹理、shader 或二进制资源，返回 MIME + base64 供前端生成 Blob URL；与 `read_design_mod_file()` 共用根和路径校验，单文件上限 10MB |
| `ensure_design_satellites(mod_id, generation, surface_specs)` | 主 WebView → Rust | 异步 command；按 v2 manifest 校验并幂等创建当前 Mod 的透明 Halo/紧凑 Island，避免 Windows WebView2 在同步 command 中创建 WebView 的 deadlock；窗口 URL 固定为 `window=design-satellite`，使用主窗口 owner，物理屏幕 px 布局，不访问后端 |
| `update_design_satellite_bounds(generation, bounds)` | 主 WebView → Rust | 更新已注册 surface 的物理屏幕 bounds；旧 generation 或未注册 id 拒绝，主窗口 move/resize/scale 事件仍由 Rust 重新计算为权威布局 |
| `set_design_satellites_visible(generation, visible)` | 主 WebView → Rust | 按 generation 成组 show/hide；主窗口隐藏、覆盖、最小化、Mod 切换和退出时不留下任务栏残留 |
| `destroy_design_satellites(generation)` | 主 WebView → Rust | 幂等销毁当前 generation 的全部 surface；旧 generation 请求不影响新 Mod |
| `design_satellite_ready(generation, surface_id, label)` | satellite WebView → Rust → 主 WebView | 校验安全 label 与当前注册表后通知主窗口回放最新 snapshot |
| `design_satellite_command(generation, surface_id, command, params, correlation_id, label)` | satellite WebView → Rust → 主 WebView | 只转发已注册 surface 的白名单桥接消息；主窗口 dispatch 后以 correlation ack 回传，surface 不直接触达业务 API |
| `get_design_satellite_capabilities()` | 前端 → Rust | 返回当前平台的 native satellite 能力集合与 `supported` / `experimental` / `unavailable` 状态；选择器和宿主 diagnostics 共用，不触达后端 |
| `dream_get_settings()` | 前端 → Rust → 后端 | GET `/dream/settings`；读取 Dream 上下文、`display.physiological_arousal` 与后端管理的 Scenario injection mode |
| `dream_update_settings(..., jailbreak_preset, display)` | 前端 → Rust → 后端 | PATCH `/dream/settings`；桌面命令透传现有 Dream 字段；`scenario_injection_mode` 由后端管理面保存，当前不在客户端设置命令中暴露 |
| `dream_group_enter/chat/exit(group_id, ...)` | 前端 → Rust → 后端 | POST `/group/{id}/dream/enter|send|exit`；群梦 send 返回 `{round_id,status}`，角色回复走 WS |
| `dream_group_get_state/get_settings(group_id)` | 前端 → Rust → 后端 | GET `/group/{id}/dream/state|settings`；state 含 roster、逐角色 char_tension、blocks_chat，以及用于 WS 漏帧/重连恢复的 `round_status`（`idle|running|failed|timed_out`）和 `last_round_error` |
| `dream_group_update_settings(group_id, ...)` | 前端 → Rust → 后端 | PATCH `/group/{id}/dream/settings`；透传世界、世界书、边界、群默认与 per-char 破限 |
| `dream_list_worlds/presets()` | 前端 → Rust → 后端 | GET `/dream/worlds|presets`；为单/群 Dream 设置提供可选项，不暴露文件路径 |
| `dream_list_scenarios()` | 前端 → Rust → 后端 | GET `/dream/scenarios`；剧本模式用返回的标题、ID 和 user/legacy 来源渲染下拉框，不再手填文件名 |
| `get_chat_settings()` | 前端 → Rust → 后端 | 顺序 GET `/chat-mode` + `/chat-style` + `/chat-multi-message`，合并为 `{ mode, style, multi_message }` 返回 |
| `set_chat_mode(mode)` | 前端 → Rust → 后端 | PUT `/chat-mode`，`mode` 取值 `"chat"` \| `"roleplay"` |
| `set_chat_style(style)` | 前端 → Rust → 后端 | PUT `/chat-style`，`style` 取值 `"chat"` \| `"roleplay"` |
| `set_chat_multi_message(enabled)` | 前端 → Rust → 后端 | PUT `/chat-multi-message`，`enabled` 布尔 |
| `load_ui_prefs()` | 前端 → Rust | 读 `app_config_dir()/ui-preferences.json` 全文，不存在返回 `"{}"`；无后端参与，纯本地文件 |
| `save_ui_prefs(contents)` | 前端 → Rust | 原子写（临时文件 + rename）`app_config_dir()/ui-preferences.json`；`contents` 是前端整份 uiPreferences Map 的 JSON 序列化 |
| `greet(name)` | 前端 → Rust | Tauri 模板遗留，当前未使用 |

HTTP command 必须使用：

```rust
reqwest::Client::builder()
    .no_proxy()
```

### 经期日期

桌面端通过 Tauri command `load_period_date`、`set_period_date(lastPeriodDate)`、`clear_period_date`
调用后端 `GET`、`PUT`、`DELETE /period`。接口不接收 uid；后端从可信 scheduler owner 配置解析。

普通 HTTP client 设置 15 秒超时；chat / wake / Dream 等 LLM 请求使用 120 秒超时。

当前 `send_chat`、`load_garden_state`、`load_diary_list`、`load_diary_entry`、`load_chat_log_dates`、`load_chat_log_day`、`get_prompt_assets`、`patch_prompt_assets` 和 `load_hidden_state_debug` 已符合这条规则。

Client Auth Sync（R9 / SEC-AUTH-1）已同步的受保护调用点：

- `POST /desktop/wake`、启动时 `POST /desktop/activate`
- `POST /upload/ingest`
- `POST /dream/enter`、`POST /dream/chat`、`POST /dream/exit`
- `GET /dream/state`、`GET /dream/settings`、`PATCH /dream/settings`
- `POST /group/{id}/dream/enter|send|exit`、`GET /group/{id}/dream/state|settings`、`PATCH /group/{id}/dream/settings`、`GET /dream/worlds|presets`

当前未发现客户端调用点：`POST /desktop/deactivate`、`POST /agent/think`。未为它们新增业务调用。

已实施:`load_sensor_realtime`,SubStatus 通过 Tauri command 消费 GET `/sensor/realtime`,Rust 侧 reqwest client 使用 `.no_proxy()`。即使 sensor 采集(POST)与消费(GET)同在 Tauri Rust 进程内,数据仍绕后端,保持后端作为 single source of truth。

---

## Tauri 权限

文件：`src-tauri/capabilities/default.json`

当前允许：

```json
[
  {"url": "http://127.0.0.1:8080/*"},
  {"url": "ws://127.0.0.1:8080/*"}
]
```

虽然 HTTP 实际走 Rust reqwest，不走 plugin-http fetch，但权限文件仍保留了本机后端范围。

---

## 后端 fallback

WS 不可用时，后端可能启用自己的兼容投递 fallback；客户端不读取后端内部队列或落盘文件。
客户端只依赖已记录的 HTTP/WS endpoint、correlation 字段、错误码和降级语义。fallback 的物理实现
以 backend channels 实现、data-taxonomy 与 DataPaths 为准，客户端不得依赖。

---

## 接口变更时要同步

修改以下内容时必须同步本文档：

- `src/shared/api/types.ts`
- `src/shared/api/ws.ts`
- `src/shared/api/backend.ts`
- `src-tauri/src/lib.rs`
- `Emerald-presence/channels/desktop_ws.py`
- `Emerald-presence/admin/routers/chat.py`
- `Emerald-presence/admin/routers/memory.py`
- `Emerald-presence/admin/routers/garden.py`
- `Emerald-presence/admin/routers/diary.py`
- `Emerald-presence/admin/routers/chat_log.py`
- `Emerald-presence/admin/routers/sensor.py`
- `Emerald-presence/core/memory/realtime_state.py`

---

## HTTP：读取 Dream 模式状态

当前真实路径：

```text
DreamWindow
  → useDreamState()
  → dreamGetState()
  → Tauri invoke("dream_get_state")
  → Rust reqwest GET http://127.0.0.1:8080/dream/state
```

Scenario / Mirror 状态 UI 只消费 `/dream/state`，显示位置是 Dream 偏好窗口的“世界”页。
它不新增后端接口、WebSocket 或 progress 写回。Scenario 前端优先读取 `state.scenario`，
并兼容同名平铺字段；Mirror 前端优先读取 `state.mirror_core`，并兼容 `state.mirror`。
单人 Scenario state 还可返回冻结的 `scenario_injection_mode` 和正文无关的
`projection` budget/status metadata；客户端不得把 projection 内容或 authored 剧本文件
当作 Reality prompt 或本地运行时真值。设置变更在 active Dream 中不切换当前模式。

世界页的“入梦模式”复用现有 `POST /dream/enter`：

```json
{
  "dream_mode": "scenario",
  "script_id": "prison_demo"
}
```

Mirror 入梦只提交模式，不提交 `script_id`：

```json
{
  "dream_mode": "mirror"
}
```

客户端提供 `sandbox` / `scenario` / `mirror` 三个同级按钮。选择值保存在本地 UI 偏好中，
并由 `DreamWindow.handleEnter()` 在下一次入梦时提交；梦境进行中不可切换。

- 只有 `state.dream_mode ?? state.mode` 为 `scenario` 时显示 Scenario dev 信息。
- 只有 `state.dream_mode ?? state.mode` 为 `mirror` 时显示 Mirror dev 信息。
- 缺失字段显示 `—`。
- `ending_state === "completed"` 只显示完成状态，不自动关闭 Dream。
- `last_progress_signal`、`satisfied_streak`、`last_matched_exit_signs` 和
  `last_blocked_events` 仅用于只读 dev/debug 展示；stage transition 由后端负责。
- Mirror dev 信息可显示 `version`、`source`、`snapshot_buckets` 和 `symbolic_hints`；客户端
  不读取 hidden_state、不计算 bucket、不写回 Mirror 状态。

### Dream exit handoff（Brief 170）

`DreamWindow` records an observed single-user `dream_id` while the backend is
`DREAM_ACTIVE` or `DREAM_EXIT_REQUESTED`. It closes the window only when that
same observed Dream reaches `DREAM_CLOSING`, `REALITY_AFTERGLOW`, or
`REALITY_CHAT`; opening the window while the backend is already in Reality
therefore remains an entry/replay surface. The HTTP `exit_accepted` callback
and the state poll share a one-shot close guard, and `useDreamChat()` installs
the final canonical reply before invoking it.

Reality WS messages received while Dream is open remain parked in `ChatPanel`.
The existing transition effect flushes them once when `dreamActive` becomes
false; this handoff does not synthesize `desktop_wake` or another proactive
reply. Backend `/dream/exit` and duplicate `/dream/wake` responses expose
`already_closed` and preserve the first close metadata.

### HTTP：只读 Dream archive 回放

DreamWindow 的 Dream Sidebar 回放 tab 使用以下只读链路：

```text
DreamReplaySidebar / DreamWindow
  → dreamListArchive() / dreamGetArchive()
  → Tauri invoke("dream_list_archive" / "dream_get_archive")
  → Rust reqwest Client.no_proxy() + Bearer desktop token
  → GET /dream/archive[/{dream_id}]
```

列表请求带有受限的 `offset`、`limit` 和可选 `char_id`；详情的 `dream_id`、`char_id` 在 Rust 侧先做 ASCII allowlist 校验，避免用户输入成为路径片段。客户端只读取后端已经过滤好的 archive 元数据和 `role/content/ts`；assistant 详情额外带有后端由 canonical narrative parser 派生的 `segments`、`segmented_content`，解析失败时使用原文和固定 fallback 标记。客户端不读取本机 Dream 文件，也不把回放消息写入当前聊天、StateEngine、WS 去重或 TTS。选中详情后由 DreamWindow 将主 Dream transcript 切换为只读视图；详情请求的旧响应会被客户端请求序号丢弃。

`src/shared/api/dream-replay.ts` 对旧字段、空列表、部分损坏响应做 fail-closed 归一化；详情只保留 `user` / `assistant`，过滤 tool 和空内容，并严格校验 segment type/text，非法 projection 回落原文。`src/windows/dream/dreamMessage.ts` 是 live final、group canonical envelope 与 replay 共用的纯映射 helper；回放只把已完成 segments 交给现有 `DreamChatPanel`，不触发增量解析、动画、WS、TTS 或发送。此 UI 属于用户回放，不是 Dream debug/运维面；后者继续由 Presence 后端管理面提供。

### `flow_entries` / `char_tension`（backend Brief 25 §2、§3 P2）

`GET /dream/state` 现在额外返回：

```json
{
  "flow_entries": [{ "ts": "2026-07-06T08:00:00+00:00", "kind": "scene_shift", "summary": "场景转入：..." }],
  "char_tension": 0.42,
  "yexuan_tension": 0.42
}
```

- `flow_entries`：后端规则驱动生成（零额外 LLM 调用），FIFO 上限 10 条，`/dream/enter` 时清空。
  `DreamSidebar.tsx` 的 `getBackendFlowEntries()` 直接消费，展示最近 5 条、最新在上，带相对时间；
  为空（旧后端 / 梦刚开始）时回退到本地派生的 3 条固定文案。
- `char_tension` 是新名字；`yexuan_tension` 是迁移期双发的废弃别名，会在过渡窗口结束后从响应里
  移除。客户端一律读 `char_tension ?? yexuan_tension`（`DreamSidebar.tsx`、`DreamControlBar.tsx`），
  过渡期结束、后端确认停止双发后再删掉 `?? yexuan_tension` 分支和 `dream-types.ts` 里的
  `yexuan_tension` 字段。

### 五子棋/象棋对手枚举更名（backend Brief 25 §3 P2）

`yexuan_ai` → `character_ai`（`GomokuOpponent`/`ChessOpponent`，`shared/api/activity-api.ts`）。
后端在读路径做旧值归一化（旧存档 `yexuan_ai` 就地改写），响应始终返回新值——客户端因此完全不需要
识别旧字符串，只需统一用 `AI_OPPONENT = 'character_ai'` 常量发送/比较（`GomokuPage.tsx`、
`ChessPage.tsx`）。

### Activity 长请求与 Reading UID 归属（Activity P0 hardening）

Activity 的普通 state/page/turn-page/move/legal-moves 和书库请求继续使用默认 HTTP
超时。可能同步触发后端 LLM 或摘要 reflow 的 Reading/Gomoku/Chess `chat`、`comment`
和 `close` 则通过 Rust 的独立长请求 helper（120 秒）发送，并保留相同 Bearer 鉴权、
HTTP 错误处理与 JSON 返回形状。

Reading 的 `page`、`turnPage`、`close` 和 `chat` 参数支持可选 `uid`。未传时后端仍按
默认 owner 处理，现有页面无需增加 UID 控件；传入时该值会随 Tauri 请求转发，使后端按
`uid + char_id + session_id` 精确加载，不跨用户目录扫描。

### Dream Seed 活动

活动空间的“梦境预构”页通过 `shared/api/activity-api.ts::dreamSeedApi` 调用四个 Tauri
command，Rust 侧统一携带 desktop token 转发到后端：

| 前端调用 | Tauri command | 后端接口 |
|---|---|---|
| `start()` | `activity_dream_seed_start` | `POST /activity/dream_seed/start` |
| `state()` | `activity_dream_seed_state` | `GET /activity/dream_seed/state` |
| `chat({session_id,message})` | `activity_dream_seed_chat` | `POST /activity/dream_seed/chat` |
| `close(session_id)` | `activity_dream_seed_close` | `POST /activity/dream_seed/close` |

`state()` 用于进入页面时恢复未关闭会话，并只返回 seed 的短预览，不返回活动 transcript。
`close()` 可能同步执行 LLM 提炼，因此 Rust 使用 120 秒长请求 client。`success=false` 表示
当前对话不足以提炼，客户端保留 session 并允许继续商量；成功时 `seed_text` 会在下一次
Dream entry 被后端一次性消费。

### 角色名去硬编码（backend Brief 25 §1/§3 P0，client cc-tasks/15 §G）

客户端不再有任何硬编码的「叶瑄」字面量（`npm run check:naming` 守门）。展示名统一走
`shared/activeCharacter.ts` 的 `getActiveCharacterName()`，数据源是 `GET /get_prompt_assets`
（Tauri IPC `get_prompt_assets` → 后端 prompt-assets）里 `characters[].label` 按
`active.active_character` 查到的角色标签，详见 `docs/frontend-structure.md` 的
「activeCharacter」小节。


## P0–P2 设置接口（2026-07-13）

新增 persona 接口：GET/PUT /settings/model-routing、GET/POST /settings/tts-desktop、POST /tts/synthesize；均经 Tauri command 调用。管理端另有 /model-presets/bootstrap 和 /settings/feature-flags。完整权限与降级边界见 settings-control-audit.md。
## Brief 171: local Obsidian diary sync

The desktop client keeps the selected diary directory and its local manifest in
untracked `config/client.local.json`. The Rust Tauri command scans nested
directories for exact `YYYY-MM-DD.md` filenames, skips symlinks and hidden
content, hashes UTF-8 text locally, and sends only bounded changed entries to
`POST /integrations/diary/sync` with the desktop token. It never sends the
selected filesystem path. Deletes become server-side tombstones; local files
are never modified or removed.

`get_diary_sync_status`, `set_diary_directory`, `clear_diary_directory`, and
`sync_diary` are the only client IPC surface for this feature. HTTP uses the
existing Rust `reqwest` no-proxy client. `SubDiary` remains the read-only
character-inner-diary view; sync is exposed separately in Preferences.

## Runtime diagnostics and window ownership (Brief 60)

No backend endpoint, queue or Presence setting is added. Local diagnostics are
disabled by default and retain frame/long-task, Tauri command timing, heap and
satellite sample/send/drop/payload counters only in the desktop process.
Pausing a surface changes transport cadence only and preserves WS/HTTP message
semantics, acknowledgements, TTLs and StateEngine ownership.

## Client-visible regression closure (Brief 61)

No backend contract is changed. `getPetWindowState` reads the existing native
window label and `setPetWindowVisible` continues to use the existing
ensure/show/destroy commands through the coordinator. Token onboarding adds no
IPC command; its timeout and cancellation boundary is local to the React
gate.

## Brief 194: native admin-panel bridge

The General preferences connection page can open the backend admin panel through
`open_admin_panel`. The command creates one temporary `127.0.0.1` listener on
an OS-assigned port and opens a capability-bearing loopback URL in the system
browser. The browser receives no backend token and does not choose the upstream
URL. Rust validates the saved `backendBase`, uses a `reqwest` client with
`no_proxy()`, and forwards only the bounded admin HTTP allowlist.

`admin_bridge_status` and `stop_admin_bridge` expose the local lifecycle to the
settings page. Reopening reuses the single bridge for the same saved backend;
changing connection settings, explicit stop, application exit, or 15 minutes of
listener idleness invalidates the capability and releases the port. This is a
desktop-only transport convenience, not a new backend authentication boundary.

## Design satellite teardown (Brief 62)

`destroy_current_design_satellites()` is a main-WebView-to-Rust command. It
atomically clears the registered Design Mod owner and closes every current
satellite before acknowledging the previous generation and close count. The
desktop host awaits that acknowledgement before restoring the configured
theme/layout and removing React portals. It does not call backend HTTP, WS, or
change a backend/mobile settings contract.

## Design satellite content rect (Brief 64)

Native surface layout is desktop-local Rust geometry. The calculation first
establishes the unexpanded content bounds, expands only the physical `bounds`
with `visualBleed` (or legacy `margin` for compatibility), then applies
`contentInset` inward to produce `content_rect`. Satellite snapshots therefore
expose an outer window rectangle and a content rectangle that never includes
visual bleed. No HTTP, WebSocket, queue, or mobile contract is added.
## RPG Dream 客户端接口

桌面端通过 Tauri bridge 调用 `/dream/capabilities`、`/dream/rpg/state`、`/dream/rpg/transcript`、`/dream/rpg/turn` 与 `/dream/rpg/corrections`。RPG 回合请求携带新的 `request_id`、`lane` 和 `expected_scene_revision`；客户端不会回退到普通 `/dream/chat`。transcript 的 `items/next_before` 与兼容字段会在 `rpg-normalization.ts` 归一化后用于恢复只读分栏，`partial_read` 会保留并展示恢复提示。
## Agent Runtime 浏览器任务退役（Brief 72）

后端总账将旧 `/agent-runtime-browser/*` 和 observability 路由列为 OpenAPI-deprecated
compatibility：它们只在已发布客户端仍有调用时保留。Brief 72 的桌面客户端已删除 Browser
Runtime shared API、Tauri command、`bot_user_id` 配置和所有任务写入/观测入口；不会直接请求
这些路径。后端 `/settings/agent-runtime-browser*` 是当前唯一的 admin policy、worker、
allowlist、提交和 receipt 面；后端仓应在确认已发布客户端完成迁移后自行移除 compatibility
routes。本仓不会由角色切换、刷新或重启后的旧内存恢复、确认或执行浏览器任务，也不会泄露
凭据、cookie、profile、文件路径、完整 URL/query、页面正文或原始参数。Brief 71 的真实
Tauri/Chromium 生命周期验收仍为历史 `partial/open` 记录，不能作为恢复客户端桥接的理由。

## Mobile typography alignment (2026-09-09)

Backend mobile HTTP/poll add optional display_text for hl/big/sm, referencing this client's inlineStyle.tsx behavior. Existing desktop channel_message/message_segments and UI rendering are unchanged. Mobile canonical reply/content remains plain for old clients, notifications, TTS and dedup. The backend catalog records real-device visual verification and plain-history style loss as observe/roadmap respectively.


## 桌面聊天交互修复（2026-09-10，partial）

实现与跨仓边界见 `docs/chat-usability-2026-09-10.md`（本目录中为同名文档）。聊天/上传使用 600 秒总等待与 15 秒连接预算；桌宠创建/销毁采用 async command；子页面懒加载独立 Suspense。
界面新增不透明度、情绪色条/标签开关；附件先暂存后发送，用户与角色均可引用。真实窗口/慢请求验收及历史引用恢复仍 open；跨仓总账同步待后端仓处理。

### 附件草稿 IPC（2026-09-10）

- upload_document 保持 filePath/message 旧参数兼容；新增可选 attachments 数组，每项为 filePath 或 dataB64（二选一）与 filename。不包含本地预览数据。
- preview_chat_attachment(filePath) 仅本地读取图片，返回 data URL；不联网、不落盘。图片 10MB，文档 5MB，类型白名单在 Rust 校验。
- upload_document 一次组装 multipart files/message/channel=desktop，调用现有 POST /upload/ingest，Bearer/chat scope 和 HTTP/WS msg_id 去重保持原样。剪贴板图片仅点击发送后离开客户端。
- 后端当前不接受文档与图片混合、多个文档；桌面草稿提前拦截。最多 10 张图为本地批次限制。
- 上传引用为 message 中的明确附言；文本引用仍使用原 reply_to。历史 API 没有引用字段，历史恢复 open。
