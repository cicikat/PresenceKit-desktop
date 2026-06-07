# docs/backend-integration.md — 后端接口与协议现状

本文档记录 Emerald-client 当前和 `qq-st-bot` 的连接方式。重点区分“当前实际协议”和“v1 目标协议”。

---

## 后端来源

后端项目：`D:\ai\qq-st-bot\`

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

P-02 之后，Emerald-client 的后端连接配置从本地配置文件读取。仓库提供模板：

```text
config/client.example.json
```

本机覆盖文件为：

```text
config/client.local.json
```

`config/client.local.json` 已加入 `.gitignore`，不要提交真实 admin token。文件不存在或字段缺失时，客户端使用当前兼容默认值：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `backendBase` | `http://127.0.0.1:8080` | Rust Tauri command 访问后端 HTTP 的 base URL，不包含末尾 `/` |
| `websocketBase` | `ws://127.0.0.1:8080/ws/desktop` | 前端原生 WebSocket 连接地址 |
| `adminToken` | 当前本地开发默认 token | 仅 Rust 侧读取和使用，不透传给前端日志 |
| `sensorConfig.enabled` | `true` | 是否启动 Tauri 内嵌 sensor runner |
| `sensorConfig.windowSeconds` | `30` | sensor 聚合窗口长度 |
| `sensorConfig.tickSeconds` | `5` | sensor 采样/推送 tick |
| `sensorConfig.sensorVersion` | `emerald-client-rust-1.0` | sensor 版本标识 |

兼容说明：旧的 AppData `sensor_config.json` 仍可作为 sensor 兼容配置来源；新的 `config/client.local.json` 优先级更高，并同时覆盖 HTTP base、WS base、admin token 和 sensor 配置。

---

## 当前客户端调用点

| 客户端文件 | 调用 |
|---|---|
| `src/shared/api/backend.ts` | `sendChat()`、`loadHistory()`、`loadGardenState()`、`loadDiaryList()`、`loadDiaryEntry()`、`loadSensorRealtime()`、`getPromptAssets()`、`patchPromptAssets()` |
| `src/shared/api/ws.ts` | `wsClient.connect()`、legacy WS 收发 |
| `src-tauri/src/lib.rs` | `send_chat`、`load_history`、`load_garden_state`、`load_diary_list`、`load_diary_entry`、`get_prompt_assets`、`patch_prompt_assets`、头像 / Dream 背景文件 commands、Dream 字体目录扫描 |
| `src/windows/chat/components/ChatPanel.tsx` | 启动历史、发送消息、订阅 WS 主动消息 |
| `src/windows/chat/components/Ribbon.tsx` | 读取 WS 连接状态 |
| `src/windows/chat/components/SubGarden.tsx` | 读取并展示花园状态 |
| `src/windows/chat/components/SubDiary.tsx` | 读取并展示日记列表和详情 |
| `src/windows/chat/ChatWindow.tsx` | Chat 偏好「世界」页读取并保存 Reality Prompt Assets |

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
  → sendChat(message)
  → invoke("send_chat", { message })
  → Rust reqwest POST http://127.0.0.1:8080/desktop/chat
```

请求：

```json
{
  "message": "今天好累"
}
```

后端实际返回：

```json
{
  "reply": "……",
  "affection": 0,
  "level": "",
  "emotion": "gentle"
}
```

客户端类型目前只声明：

```ts
interface ChatResponse {
  reply: string;
  emotion: string;
}
```

多余字段会被忽略。

重要差异：旧 v1 方案写明 Tauri 客户端最终不应调用 `/desktop/chat`，而应通过 WS `user_message` 发消息，再用 WS `assistant_message` 收回复。当前尚未做到。

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
  "user_id": "1043484516",
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

- `D:\ai\qq-st-bot\admin\routers\garden.py`
- `D:\ai\qq-st-bot\core\garden\manager.py`
- `D:\ai\qq-st-bot\docs\garden.md`

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

## HTTP：加载日记列表

当前真实路径：

```text
Sidebar diary tab
  → SubDiary mount
  → loadDiaryList()
  → invoke("load_diary_list")
  → Rust reqwest GET http://127.0.0.1:8080/diary/list
```

后端要求 Bearer token。数据源目录：`D:\ai\qq-st-bot\data\yexuan_inner\diary\`，文件名严格匹配 `^\d{4}-\d{2}-\d{2}\.md$`。

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

后端文件：`D:\ai\qq-st-bot\admin\routers\diary.py`

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

后端要求 Bearer token。数据源目录：`qq-st-bot/data/event_log/{owner_qq}/`，文件名严格匹配 `^\d{4}-\d{2}-\d{2}\.md$`，`full_log.md` 忽略。

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
    { "time": "20:19", "user": "叶瑄！", "assistant": "他听到你那声……" }
  ],
  "raw_fallback": false
}
```

后端文件：`D:\ai\qq-st-bot\admin\routers\chat_log.py`

---

## HTTP：获取情绪状态

当前真实路径：

```text
loadMoodState()
  → invoke("load_mood_state")
  → Rust reqwest GET http://127.0.0.1:8080/mood/state
```

后端要求 Bearer token。数据源：`core/memory/mood_state.py load()`，返回持久化的情绪状态（两轮漂移才切换，非即时检测值）。

后端文件：`D:\ai\qq-st-bot\admin\routers\mood.py`、`D:\ai\qq-st-bot\core\memory\mood_state.py`

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

后端文件：`D:\ai\qq-st-bot\admin\routers\activity.py`、`D:\ai\qq-st-bot\core\activity_manager.py`

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

调用方:**Emerald-client 内嵌 sensor 模块**(Tauri Rust 侧
`src-tauri/src/sensor/`,Phase 2f 实施)。

```text
Emerald-client (Tauri Rust sensor 模块)
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
- 聊天软件：直接置空字符串
- 黑名单关键词（密码、银行、医疗等）整条置空

后端文件：`D:\ai\qq-st-bot\admin\routers\sensor.py`、`D:\ai\qq-st-bot\core\memory\realtime_state.py`

---

## HTTP：读取 sensor 实时快照

调用方：**Emerald-client 主进程**（SubStatus 轮询消费）。

```text
Emerald-client SubStatus
  → loadSensorRealtime()
  → Rust load_sensor_realtime
  → GET http://127.0.0.1:8080/sensor/realtime
```

后端要求 Bearer token。客户端 Rust command 使用 `reqwest.no_proxy()`；404、JSON `null`、空对象 `{}` 统一映射为 `{ "_no_data": true }`，前端静默降级为 mood 派生信号。

无数据时(sensor 模块未启动或刚重启,例如 Emerald-client 还在启动中)响应:

```json
{
  "ts": null,
  "stale_seconds": null,
  "presence": "active",
  "continuous_at_desk_seconds": null,
  "sensor_version": null,
  "window_seconds": null,
  "input": null,
  "focus": null
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

无数据时默认 `active`，与 StateEngine 默认值一致。

`continuous_at_desk_seconds` 累积规则：

- 由后端 `realtime_state` 在每次 POST 接收时维护，重启清零
- 当 `idle_seconds < 300` 时累加本次 `window_seconds`
- 当 `idle_seconds ≥ 300` 时清零（视为用户离开）
- 当后端发现两次 POST 间隔 > 120s 时保守重置(视为 sensor 模块中断过,例如 Emerald-client 被关闭)
- Emerald-client 重启或后端重启均清零,无持久化

`stale_seconds` 是后端算的"距上次 POST 多少秒",SubStatus 用这个判断 sensor 模块是否还在采集(比如 >120 视为掉线,UI 显示降级)。

后端文件：`D:\ai\qq-st-bot\admin\routers\sensor.py`、`D:\ai\qq-st-bot\core\memory\realtime_state.py`

> `sensor_aware` 触发器默认关闭，后端 `config.yaml` 设置
> `scheduler.sensor_aware.enabled: true` 才生效，重启服务后 scheduler 启动日志会打出 `ENABLED` 确认。

---

## /sensor/realtime（GET）

读取最新一份 sensor 快照。后端 `D:\ai\qq-st-bot\admin\routers\sensor.py:213`。

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

## WebSocket：当前 legacy 协议

端点：

```text
ws://127.0.0.1:8080/ws/desktop
```

后端实现：`D:\ai\qq-st-bot\channels\desktop_ws.py`

当前客户端实现：`src/shared/api/ws.ts`

### 连接语义

- 后端只保留一个当前 WS 连接。
- 新连接进来时，后端关闭旧连接。
- 后端每 30 秒发 `ping`。
- 后端 70 秒未收到 `pong` 会关闭连接。
- 客户端 60 秒未收到任何消息会主动断开并重连。
- 客户端指数退避：1s → 2s → 4s，最大 30s。

### Client → Server

握手：

```json
{
  "type": "hello",
  "client": "emerald-client",
  "version": "0.1"
}
```

心跳：

```json
{"type": "pong"}
```

动作回执：

```json
{
  "type": "ack",
  "msg_id": "1748000000000",
  "ok": true
}
```

### Server → Client

握手确认：

```json
{
  "type": "hello_ack",
  "server_version": "1.0"
}
```

主动消息：

```json
{
  "type": "channel_message",
  "content": "……",
  "msg_id": "1748000000000"
}
```

桌面动作：

```json
{
  "type": "action",
  "action": {
    "action_type": "open_url",
    "params": {"url": "https://example.com"}
  },
  "msg_id": "1748000000000"
}
```

Emerald-client 当前保持该 legacy action envelope，不引入 v1 协议字段。前端同时兼容 `action.action_type` 和 `action.type` 作为动作名，参数仍优先从 `action.params` 读取。

P-01 已接入的最小执行动作：

| `action_type` / `type` | `params` | 客户端执行 |
|---|---|---|
| `minimize_window` | `{}` | Tauri 当前窗口 `minimize()` |
| `open_url` | `{"url": "https://example.com"}` | `tauri-plugin-opener` 打开 http/https/mailto/tel URL |
| `show_notify` | `{"text": "...", "title": "..."}` | `tauri-plugin-dialog` 信息对话框 fallback，并记录 log |
| `media_play_pause` | `{}` | Windows 发送媒体播放/暂停键；非 Windows 记录 stub log |

`sensor_aware` trigger 产出的 action 类型：

| `action_type` | 触发条件 | `params` |
|---|---|---|
| `pet_emote` | score ≥ 50，soft_hint 级 | `{"behavior_id": "<语义标签>"}` |
| `notify` | score ≥ 65，attention_grab 级 | `{"text": "<发言内容>", "bring_to_front": true}` |
| `execute` | score ≥ 80，direct_act 级 | `{"behavior_id": "<语义标签>"}` |

`behavior_id` 示例：`late_night_lock_hint`、`sit_long_force`、`long_focus_remind`。客户端按 `behavior_id` 决定执行什么，当前全部 console.log + ack（无执行器）。

心跳：

```json
{"type": "ping"}
```

### 当前客户端处理

| 消息 | 当前处理 |
|---|---|
| `hello_ack` | 设置连接状态为 `connected` |
| `channel_message` | emit 给 ChatPanel，并立即 ack |
| `action` | emit 给订阅者，异步 dispatch 到 Tauri action command，按执行结果 ack |
| `ping` | 回 `pong` |

注意：未知 action 不执行，并回 `ok:false`；这不改变后端协议，也不影响旧桌宠或 file fallback。

---

## v1 目标协议

旧方案文档位置：

```text
D:\ai\Emerald-desktop\docs\desktop-client-protocol.md
D:\ai\Emerald-desktop\docs\desktop-client-plan.md
```

v1 目标新增或替换：

| 类型 | 方向 | 目标用途 | 当前状态 |
|---|---|---|---|
| `assistant_message` | Server → Client | 替代 `channel_message` | 未实现 |
| `state_update` | Server → Client | 推 mood/activity/presence | 未实现 |
| `user_message` | Client → Server | 用户输入走 WS | 未实现 |
| `client_event` | Client → Server | 模式切换、窗口事件 | 未实现 |
| envelope `v/ts/payload` | 双向 | 统一协议格式 | 未实现 |
| `capabilities` | Client hello | 后端按能力降级 | 未实现 |

后端当前代码同样仍是 legacy 协议，不只是客户端没接。

---

## Tauri IPC Commands

文件：`src-tauri/src/lib.rs`

| Command | 方向 | 说明 |
|---|---|---|
| `send_chat(message)` | 前端 → Rust → 后端 | POST `/desktop/chat` |
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
| `save_avatar(role, image_b64)` | 前端 → Rust | 保存 PNG 到 `app_data_dir()/avatars/`；头像和 Dream 日间 / 夜间背景共用 |
| `load_avatar(path)` | 前端 → Rust | 读取头像或 Dream 背景并返回 data URL |
| `read_avatars_json()` | 前端 → Rust | 读取头像和 Dream 日间 / 夜间背景配置；旧 `dream_background` 字段由前端兼容为夜间背景 |
| `write_avatars_json(json)` | 前端 → Rust | 写头像和 Dream 日间 / 夜间背景配置 |
| `list_dream_fonts()` | 前端 → Rust | 扫描 `public/fonts/`，返回 `ttf / otf / woff / woff2` 字体清单 |
| `dream_get_settings()` | 前端 → Rust → 后端 | GET `/dream/settings`；读取 Dream 上下文与 `display.physiological_arousal` |
| `dream_update_settings(..., jailbreak_preset, display)` | 前端 → Rust → 后端 | PATCH `/dream/settings`；透传 Dream 独立 `jailbreak_preset`，`display` 可透传 `{ "physiological_arousal": boolean }` |
| `greet(name)` | 前端 → Rust | Tauri 模板遗留，当前未使用 |

HTTP command 必须使用：

```rust
reqwest::Client::builder()
    .no_proxy()
```

当前 `send_chat`、`load_history`、`load_garden_state`、`load_diary_list`、`load_diary_entry`、`load_chat_log_dates`、`load_chat_log_day`、`get_prompt_assets`、`patch_prompt_assets` 和 `load_hidden_state_debug` 已符合这条规则。

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

`qq-st-bot/channels/desktop.py` 在 WS 不可用时会写文件队列：

```text
data/channel_queue.json
```

当前 Emerald-client 不读取这个文件队列。这个 fallback 主要服务旧桌宠。

---

## 接口变更时要同步

修改以下内容时必须同步本文档：

- `src/shared/api/types.ts`
- `src/shared/api/ws.ts`
- `src/shared/api/backend.ts`
- `src-tauri/src/lib.rs`
- `qq-st-bot/channels/desktop_ws.py`
- `qq-st-bot/admin/routers/chat.py`
- `qq-st-bot/admin/routers/memory.py`
- `qq-st-bot/admin/routers/garden.py`
- `qq-st-bot/admin/routers/diary.py`
- `qq-st-bot/admin/routers/chat_log.py`
- `qq-st-bot/admin/routers/sensor.py`
- `qq-st-bot/core/memory/realtime_state.py`
