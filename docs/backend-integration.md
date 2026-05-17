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

---

## 当前客户端调用点

| 客户端文件 | 调用 |
|---|---|
| `src/shared/api/backend.ts` | `sendChat()`、`loadHistory()`、`loadGardenState()`、`loadDiaryList()`、`loadDiaryEntry()` |
| `src/shared/api/ws.ts` | `wsClient.connect()`、legacy WS 收发 |
| `src-tauri/src/lib.rs` | `send_chat`、`load_history`、`load_garden_state`、`load_diary_list`、`load_diary_entry`、头像文件 commands |
| `src/windows/chat/components/ChatPanel.tsx` | 启动历史、发送消息、订阅 WS 主动消息 |
| `src/windows/chat/components/Ribbon.tsx` | 读取 WS 连接状态 |
| `src/windows/chat/components/SubGarden.tsx` | 读取并展示花园状态 |
| `src/windows/chat/components/SubDiary.tsx` | 读取并展示日记列表和详情 |

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
  → invoke("load_history", { userId, token })
  → Rust reqwest GET http://127.0.0.1:8080/memory/{user_id}/short-term
```

后端要求 Bearer token：

```http
Authorization: Bearer <admin_token>
```

当前客户端在 `src/shared/api/backend.ts` 硬编码：

```ts
const BOT_USER_ID = "1043484516";
const ADMIN_TOKEN = "Emerald1231";
```

这只是当前实现，不应视为长期设计。风险见 `docs/known-issues.md`。

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
  → invoke("load_garden_state", { token })
  → Rust reqwest GET http://127.0.0.1:8080/garden/state
```

后端要求 Bearer token：

```http
Authorization: Bearer <admin_token>
```

当前复用 `src/shared/api/backend.ts` 里的硬编码 `ADMIN_TOKEN`。

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
  → invoke("load_diary_list", { token })
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
  → invoke("load_diary_entry", { date, token })
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
  → invoke("load_chat_log_dates", { token })
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
  → invoke("load_chat_log_day", { date, token })
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
  → invoke("load_mood_state", { token })
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
  → invoke("load_activity_state", { token })
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

调用方：**sensor-service**（Phase 2e 实施，不是 Emerald-client 主进程）。

```text
sensor-service
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
| `sensor_version` | str | sensor-service 版本号，用于事后排查清洗规则/聚合算法 bug |
| `input.keystrokes` | int ≥ 0 | 窗口内累计键击数 |
| `input.mouse_clicks` | int ≥ 0 | 窗口内累计点击数 |
| `input.mouse_distance_px` | int ≥ 0 | 窗口内累计鼠标移动像素 |
| `input.idle_seconds` | int ≥ 0 | 窗口末尾连续 idle 秒数，驱动 presence |
| `focus.app` | str | 进程名，允许空字符串 |
| `focus.title_hint` | str | 已清洗的窗口标题，允许空字符串，server-side 兜底截断 >80 字符 |
| `focus.switch_count` | int ≥ 0 | 窗口内焦点切换次数 |

`title_hint` 清洗规则在 sensor-service 端实现，后端信任客户端清洗结果。约定：

- 浏览器：只保留域名（`github.com`，不保留完整 URL）
- 编辑器：只保留文件名（`ChatPanel.tsx`，不保留完整路径）
- 聊天软件：直接置空字符串
- 黑名单关键词（密码、银行、医疗等）整条置空

后端文件：`D:\ai\qq-st-bot\admin\routers\sensor.py`、`D:\ai\qq-st-bot\core\memory\realtime_state.py`

---

## HTTP：读取 sensor 实时快照

调用方：**Emerald-client 主进程**（SubStatus 轮询消费，本轮 Phase 2e 未实施）。

```text
Emerald-client SubStatus
  → 未来 Rust load_sensor_realtime
  → GET http://127.0.0.1:8080/sensor/realtime
```

后端要求 Bearer token。

无数据时（sensor-service 未启动或刚重启）响应：

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
- 当后端发现两次 POST 间隔 > 120s 时保守重置（视为 sensor-service 中断过）
- sensor-service 重启或后端重启均清零，无持久化

`stale_seconds` 是后端算的"距上次 POST 多少秒"，客户端用这个判断 sensor-service 是否还活着（比如 >120 视为掉线，UI 显示降级）。

后端文件：`D:\ai\qq-st-bot\admin\routers\sensor.py`、`D:\ai\qq-st-bot\core\memory\realtime_state.py`

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

心跳：

```json
{"type": "ping"}
```

### 当前客户端处理

| 消息 | 当前处理 |
|---|---|
| `hello_ack` | 设置连接状态为 `connected` |
| `channel_message` | emit 给 ChatPanel，并立即 ack |
| `action` | console.log，立即 ack，emit 给订阅者 |
| `ping` | 回 `pong` |

注意：当前没有 action 订阅者和执行器，因此 `action` 会被“确认成功但未执行”。这是高优先级问题。

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
| `load_history(user_id, token)` | 前端 → Rust → 后端 | GET `/memory/{user_id}/short-term` |
| `load_garden_state(token)` | 前端 → Rust → 后端 | GET `/garden/state` |
| `load_diary_list(token)` | 前端 → Rust → 后端 | GET `/diary/list` |
| `load_diary_entry(date, token)` | 前端 → Rust → 后端 | GET `/diary/{date}` |
| `load_chat_log_dates(token)` | 前端 → Rust → 后端 | GET `/chat-log/dates`，路径不含 QQ |
| `load_chat_log_day(date, token)` | 前端 → Rust → 后端 | GET `/chat-log/{date}`，路径不含 QQ |
| `load_mood_state(token)` | 前端 → Rust → 后端 | GET `/mood/state` |
| `load_activity_state(token)` | 前端 → Rust → 后端 | GET `/activity/current` |
| `save_avatar(role, image_b64)` | 前端 → Rust | 保存 PNG 到 app data |
| `load_avatar(path)` | 前端 → Rust | 读取头像并返回 data URL |
| `read_avatars_json()` | 前端 → Rust | 读取头像配置 |
| `write_avatars_json(json)` | 前端 → Rust | 写头像配置 |
| `greet(name)` | 前端 → Rust | Tauri 模板遗留，当前未使用 |

HTTP command 必须使用：

```rust
reqwest::Client::builder()
    .no_proxy()
```

当前 `send_chat`、`load_history`、`load_garden_state`、`load_diary_list`、`load_diary_entry`、`load_chat_log_dates` 和 `load_chat_log_day` 已符合这条规则。

未实施：`load_sensor_realtime`，Phase 2e sensor-service 拆分后由 Emerald-client 主进程轮询 GET `/sensor/realtime`，Rust 侧 reqwest client 必须 `.no_proxy()`。

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
