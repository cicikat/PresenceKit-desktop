# docs/backend-integration.md — 后端接口与接入现状

本文档记录本仓当前和 `Emerald-presence` 的连接方式。桌面协议统一见 `docs/protocol-v0.md`。

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
| `src/shared/api/backend.ts` | `sendChat()`、`loadHistory()`、`loadGardenState()`、`loadDiaryList()`、`loadDiaryEntry()`、`loadSensorRealtime()`、`getPromptAssets()`、`patchPromptAssets()` |
| `src/shared/api/chat-settings.ts` | `getChatSettings()`、`setChatMode()`、`setChatStyle()`、`setChatMultiMessage()`，由偏好面板「其他」tab 的 `ChatSettingsSection` 调用 |
| `src/shared/api/ws.ts` | `wsClient.connect()`、通过 Tauri commands / events 完成 legacy WS 收发 |
| `src-tauri/src/ws_bridge.rs` | 原生 WS 连接、Bearer header、URL 清洗与前端事件桥接 |
| `src-tauri/src/lib.rs` | `send_chat`、`load_history`、`load_garden_state`、`load_diary_list`、`load_diary_entry`、`get_prompt_assets`、`patch_prompt_assets`、头像 / Dream 背景文件 commands、Dream 字体目录扫描、主题 Mod manifest 扫描 |
| `src/windows/chat/components/ChatPanel.tsx` | 启动历史、发送消息、订阅 WS 主动消息 |
| `src/windows/chat/components/Ribbon.tsx` | 读取 WS 连接状态 |
| `src/windows/chat/components/SubGarden.tsx` | 读取并展示花园状态 |
| `src/windows/chat/components/SubDiary.tsx` | 读取并展示日记列表和详情 |
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

角色卡头像上传在 Chat 世界页先复用客户端 `AvatarCropper` 裁剪为 256 × 256 PNG，再由 Tauri `upload_character_avatar` POST `/settings/characters/{char_id}/avatar`。裁剪只改变上传图片内容，不改变后端接口或最终 `data/runtime/characters/{char_id}/avatar.png` 存储位置。

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
  "affection": 0,
  "level": "",
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

## HTTP：加载短期历史

当前真实路径：

```text
ChatPanel mount
  → loadHistory()
  → invoke("load_history", { userId })
  → Rust reqwest GET http://127.0.0.1:8080/memory/{user_id}/short-term
```

后端要求 Bearer token：

```http
Authorization: Bearer <admin_token>
```

前端不再传 admin token。当前客户端仍保留备用 `loadHistory()` 的 `BOT_USER_ID` 默认值；`ADMIN_TOKEN` 已迁移到 Rust 侧本地配置读取，再由 Rust/Tauri command 作为 Bearer token 调后端。配置说明见“客户端本地配置”。

后端返回：

```json
{
  "user_id": "<owner_user_id>",
  "history": [
    {"role": "user", "content": "...", "timestamp": 1748000000}
  ],
  "count": 1
}
```

客户端映射成 bubble：

```ts
{
  role: entry.role,
  text: entry.content,
  time: entry.timestamp * 1000
}
```

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

后端要求 Bearer token。数据源目录：`Emerald-presence` 仓库（通常与本仓库同级）的 `data\yexuan_inner\diary\`，文件名严格匹配 `^\d{4}-\d{2}-\d{2}\.md$`。

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

后端要求 Bearer token。数据源目录：`Emerald-presence/data/event_log/{owner_qq}/`，文件名严格匹配 `^\d{4}-\d{2}-\d{2}\.md$`，`full_log.md` 忽略。

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
## Tauri IPC Commands

文件：`src-tauri/src/lib.rs`

| Command | 方向 | 说明 |
|---|---|---|
| `native_ws_connect()` | 前端 → Rust → 后端 | 使用本地 admin token 建立带 Bearer header 的原生 WebSocket |
| `native_ws_send(connection_id, message)` | 前端 → Rust → 后端 | 发送既有 legacy WS payload，不改变消息协议 |
| `native_ws_disconnect()` | 前端 → Rust → 后端 | 关闭当前原生 WebSocket |
| `send_chat(message, reply_to?)` | 前端 → Rust → 后端 | POST `/desktop/chat`；`reply_to` 可选，右键引用回复时携带 `{text, ts}`（cc-tasks/36） |
| `load_history(user_id)` | 前端 → Rust → 后端 | GET `/memory/{user_id}/short-term`；Rust 侧读取 admin token |
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
| `list_themes()` | 前端 → Rust | packaged 优先扫描 `resource_dir/themes/*/theme.json`，debug/dev 回退源码 `public/themes/`；原样返回 manifest，由前端校验 token 契约 |
| `read_theme_css(id, file)` | 前端 → Rust | 读取 `themes/<id>/<file>` 的磁盘 mod CSS；仅允许单级 id、同目录 `.css` 文件，并经 canonical 路径校验拒绝绝对路径、穿越和 symlink 逃逸；CSS 文本仍由前端 `inspectThemeCss()` 安检 |
| `dream_get_settings()` | 前端 → Rust → 后端 | GET `/dream/settings`；读取 Dream 上下文与 `display.physiological_arousal` |
| `dream_update_settings(..., jailbreak_preset, display)` | 前端 → Rust → 后端 | PATCH `/dream/settings`；透传 Dream 独立 `jailbreak_preset`，`display` 可透传 `{ "physiological_arousal": boolean }` |
| `dream_group_enter/chat/exit(group_id, ...)` | 前端 → Rust → 后端 | POST `/group/{id}/dream/enter|send|exit`；群梦 send 返回 `{round_id,status}`，角色回复走 WS |
| `dream_group_get_state/get_settings(group_id)` | 前端 → Rust → 后端 | GET `/group/{id}/dream/state|settings`；state 含 roster、逐角色 char_tension 与 blocks_chat |
| `dream_group_update_settings(group_id, ...)` | 前端 → Rust → 后端 | PATCH `/group/{id}/dream/settings`；透传世界、世界书、边界、群默认与 per-char 破限 |
| `dream_list_worlds/presets()` | 前端 → Rust → 后端 | GET `/dream/worlds|presets`；为单/群 Dream 设置提供可选项，不暴露文件路径 |
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

普通 HTTP client 设置 15 秒超时；chat / wake / Dream 等 LLM 请求使用 120 秒超时。

当前 `send_chat`、`load_history`、`load_garden_state`、`load_diary_list`、`load_diary_entry`、`load_chat_log_dates`、`load_chat_log_day`、`get_prompt_assets`、`patch_prompt_assets` 和 `load_hidden_state_debug` 已符合这条规则。

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

`Emerald-presence/channels/desktop.py` 在 WS 不可用时会写文件队列：

```text
data/channel_queue.json
```

当前 本仓 不读取这个文件队列。这个 fallback 主要服务旧桌宠。

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

### 角色名去硬编码（backend Brief 25 §1/§3 P0，client cc-tasks/15 §G）

客户端不再有任何硬编码的「叶瑄」字面量（`npm run check:naming` 守门）。展示名统一走
`shared/activeCharacter.ts` 的 `getActiveCharacterName()`，数据源是 `GET /get_prompt_assets`
（Tauri IPC `get_prompt_assets` → 后端 prompt-assets）里 `characters[].label` 按
`active.active_character` 查到的角色标签，详见 `docs/frontend-structure.md` 的
「activeCharacter」小节。


## P0–P2 设置接口（2026-07-13）

新增 persona 接口：GET/PUT /settings/model-routing、GET/POST /settings/tts-desktop、POST /tts/synthesize；均经 Tauri command 调用。管理端另有 /model-presets/bootstrap 和 /settings/feature-flags。完整权限与降级边界见 settings-control-audit.md。
