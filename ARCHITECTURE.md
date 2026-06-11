# ARCHITECTURE.md — Emerald-client 架构总览

Emerald-client 是 `qq-st-bot` 的新桌面客户端。它不拥有角色记忆、调度、工具、情绪判断等核心数据；这些都属于 `D:\ai\qq-st-bot\`。客户端负责把后端的陪伴系统可视化：聊天窗口、桌宠形象、用户交互、桌面动作执行和未来的感知 UI。

---

## 系统边界

```text
┌──────────────────────────┐
│ qq-st-bot                │
│ 记忆 / prompt / LLM       │
│ 调度 / 工具 / 情绪状态     │
│ HTTP + WebSocket          │
└────────────┬─────────────┘
             │
             │ HTTP / WS on 127.0.0.1:8080
             ▼
┌──────────────────────────┐
│ Emerald-client            │
│ Tauri shell               │
│ React chat window         │
│ shared StateEngine mirror │
│ future pet window         │
└────────────┬─────────────┘
             │
             │ HTTP POST /sensor/realtime (本机或内网穿透)
             ▼
┌──────────────────────────┐
│ Emerald-client (Tauri)    │
│ src-tauri/src/sensor/     │
│ Rust 嵌入式键鼠/焦点采集    │
│ 规划中,尚未实施            │
└──────────────────────────┘
```

原则：后端是 single source of truth，客户端只显示和执行。客户端可以有本地 UI 状态，但不能把 mood、activity、presence 变成第二套业务真值。

---

## 当前实现快照

入口是 `src/main.tsx`：

- 初始化头像 / Dream 背景 store：`avatarStore.init()`。
- 挂载全局样式：`src/shared/theme/globals.css`。
- 渲染唯一主 view：`<ChatWindow />`。

主窗口是 `src/windows/chat/ChatWindow.tsx`：

- 创建单个 `StateEngine` 实例。
- 管理主题、Sidebar、偏好面板、帮助面板、桌宠开关等 UI 状态。
- 使用 `src/shared/chatAppearance.ts` 保存 Chat 聊天字号、主题字号和字体包；Sidebar 宽度仅通过界面分隔条拖拽调整。
- 偏好面板的「世界」页通过 `getPromptAssets()` / `patchPromptAssets()` 管理 Reality Prompt Assets：角色卡单选、世界书多选和破限多选。可用选项来自后端，客户端不展示文件路径。
- 把 engine 传给 `ChatPanel`。
- 管理正式 Dream overlay 的本地开关；DreamWindow 自己接入 Dream API 和窗口状态机。
- 将当前 Reality 激活角色卡头像传给 DreamWindow；Dream 内控制栏、动向侧栏和消息区优先显示该头像，无角色头像时回退到本地 HER 头像。
- 当前没有实际 `PetWindow` 渲染。

Dream 窗口是 `src/windows/dream/DreamWindow.tsx`：

- 管理 Dream overlay、左侧 Ribbon、信息 Sidebar 和对话区域。
- 动向 / 状态 / 潜意识使用 Dream 左侧 Sidebar；偏好 / 帮助使用独立居中 modal，避免设置项挤在窄侧栏中。
- 动向 Sidebar 的「梦境流动」优先读取 `/dream/state` 可选 flow/event 摘要，旧后端缺失时从当前 dream state 派生短文案；不展示 chat transcript。
- 状态 Sidebar 展示 `/dream/state` 的 Dream HUD v1.1 字段；文本以状态 pill 展示，数值缺失时显示空值，Dream 未激活时显示空态。`physiological_arousal` 仅在 `/dream/settings` 的 `display.physiological_arousal === true` 时展示。
- 偏好窗口通过 `src/shared/api/dream.ts` 读写 `/dream/settings`，顶部横栏分为当前状态、梦境上下文、系统设置、世界和其他。世界页保存 `world_layer` 世界卡和 Dream 独立 `jailbreak_preset`；系统设置额外使用 `src/shared/dreamAppearance.ts` 持久化本地字体、配色和模糊度，并通过 `avatarStore` 分别保存日间 / 夜间聊天背景；底部开发者模式开关写入 `display.physiological_arousal`。帮助窗口只展示本地说明。
- `DreamGlowPanel` / `DreamGlowBubble` 复用 `features/dream/DreamTokens.css` 的玻璃发光 token，分别承载 Sidebar 状态卡和 Dream 对话气泡；Dream 潜意识页挂载只读 hidden state 面板。

聊天区是 `src/windows/chat/components/ChatPanel.tsx`：

- 启动时通过 Tauri command 加载短期历史。
- 用户发送消息时调用 `sendChat()`，走 Tauri Rust command 再打后端 HTTP。
- 订阅 `wsClient` 的 `channel_message`，接收后端主动推送消息。
- 用本地 engine 的 mood/activity/presence 渲染 header 标签和头像呼吸。

花园面板是 `src/windows/chat/components/SubGarden.tsx`：

- 由 `Sidebar.tsx` 在 `garden` tab 下挂载。
- 通过 `loadGardenState()` 调 Tauri command `load_garden_state`。
- Rust 侧 GET `http://127.0.0.1:8080/garden/state`，使用 Bearer token 和 `reqwest.no_proxy()`。
- 当前只读展示五个花槽、阶段进度、收获数和花瓶数。

日记面板是 `src/windows/chat/components/SubDiary.tsx`：

- 由 `Sidebar.tsx` 在 `diary` tab 下挂载。
- 挂载时通过 `loadDiaryList()` 调 Tauri command `load_diary_list`，拉轻量列表。
- 点击 entry 时通过 `loadDiaryEntry(date)` 调 `load_diary_entry`，懒加载正文。
- Rust 侧分别 GET `http://127.0.0.1:8080/diary/list` 和 `/diary/{date}`，Bearer token + `reqwest.no_proxy()`。
- 只读展示，不轮询，不写文件。

潜意识面板是 `src/windows/dream/components/SubHiddenStatePanel.tsx`：

- 由 `DreamWindow.tsx` 在 Dream `subconscious` tab 下挂载，Ribbon 正式入口显示为「潜意识」，不再使用 `DEV: Hidden State`，也不挂在 Chat 侧栏。
- 挂载时只调用 `loadHiddenStateDebug()`，经 Tauri command `load_hidden_state_debug` 读取后端 `GET /debug/user-hidden-state`。
- 常态展示 `embodied_ease`（身体放松度）、`body_memory`（身体记忆线索）、`dream_snapshot`（梦境读取到的状态）和最近来源 badge；空 `body_memory` 显示「暂无身体记忆线索」。
- `sensitivity` 和 `touch_need` 等较细 raw 数值只在 Dream 系统设置的开发者模式打开时展示；该模式复用 `/dream/settings` 的 `display.physiological_arousal` 开关，由 Rust command 只读合并到返回值。
- Phase 4.5 UI 已从 debug-only 入口提升为单用户状态面板；仍然只读，没有新增写接口，也不把 hidden state 注入现实 prompt 或 memory。

WebSocket 在 `src/shared/api/ws.ts`：

- 前端通过 Tauri commands / events 调用 `src-tauri/src/ws_bridge.rs` 的原生 WebSocket client。
- Rust 从本地 client config 读取 admin token，并在握手请求中设置 `Authorization: Bearer ...`；token 不进入 URL 或 WebView。
- 支持 legacy `hello_ack`、`channel_message`、`action`、`ping`。
- `action` 保持 legacy envelope，不改协议；收到后异步 dispatch 到 Tauri action commands，并按执行结果回 `ack`。
- 自动重连，指数退避最大 30 秒。
- 当前没有实现 v1 envelope，也没有发送 `user_message` / `client_event`。

Tauri Rust 在 `src-tauri/src/lib.rs`：

- `send_chat`：POST `/desktop/chat`，使用 `reqwest.no_proxy()`。
- `ws_bridge.rs`：原生 WebSocket Bearer 鉴权、收发桥接和 URL query token 清洗。
- `load_history`：GET `/memory/{user_id}/short-term`，使用 Bearer token。
- `load_garden_state`：GET `/garden/state`，使用 Bearer token。
- `load_sensor_realtime`：GET `/sensor/realtime`，使用 Bearer token；无数据响应归一为 `_no_data`。
- `get_prompt_assets` / `patch_prompt_assets`：GET / PATCH `/settings/prompt-assets`，使用 Bearer token 和 `reqwest.no_proxy()`；仅服务 Chat 的 Reality Prompt Assets 设置。
- `load_hidden_state_debug`：GET `/debug/user-hidden-state`，并只读参考 `/dream/settings.display.physiological_arousal` 作为潜意识面板开发者字段显隐；不写 hidden state。
- `src-tauri/src/actions.rs`：执行 `minimize_window` / `open_url` / `show_notify` / `media_play_pause` 四类 desktop action。
- `save_avatar` / `load_avatar` / `read_avatars_json` / `write_avatars_json`：本地头像和 Dream 背景持久化。
- `list_dream_fonts`：扫描 `public/fonts/`，返回可供 Chat / Dream 使用的字体包。

---

## 状态模型

`src/shared/state/store.ts` 定义客户端状态镜像：

- `mood`：`平静` / `开心` / `低落` / `病娇` / `分心`
- `activity`：`看你` / `发呆` / `想事情` / `看屏幕` / `看你打字` / `偷看` / `注意到了什么`
- `presence`：`active` / `idle` / `away`
- `mode`：`companion` / `chat-only`
- `wantToSpeak`、`behaviorId`、`bodyTiltOverride` 等视觉信号

当前 engine 是前端本地对象。它已经提供 `applyStateUpdate()`，但 WS `state_update` 尚未接入，实际状态主要由用户交互和组件调用推动。

旧原型 `D:\ai\Emerald-desktopUI\state-engine.js` 里有完整 behavior loop；当前 TypeScript 版删掉了 mock 行为循环，等待后端状态推送。

---

## 通信路径

### 用户发消息

```text
ChatPanel.send()
  → src/shared/api/backend.ts sendChat()
  → Tauri invoke("send_chat")
  → src-tauri/src/lib.rs reqwest POST /desktop/chat
  → qq-st-bot pipeline
  ← HTTP JSON { reply, emotion, affection, level }
  → ChatPanel 追加 assistant bubble
```

这条路径是当前真实路径，但不是 v1 目标协议的最终路径。v1 目标是用户输入走 WS `user_message`，回复走 WS `assistant_message`。

### 后端主动消息

```text
qq-st-bot DesktopChannel
  → channels/desktop_ws.py push_message()
  → WS { type: "channel_message", content, msg_id }
  → src/shared/api/ws.ts
  → ChatPanel 追加 assistant bubble
```

### 桌面动作

```text
qq-st-bot push_action_and_wait()
  → WS { type: "action", action, msg_id }
  → src/shared/api/ws.ts
  → 根据 action_type/type 调 Tauri command
  → src-tauri/src/actions.rs 执行动作
  → 成功/失败后回 ack
```

当前只接入四类基础 desktop action：`minimize_window`、`open_url`、`show_notify`、`media_play_pause`。未知 action 不执行，并回 `ok:false`。

### 聊天历史按日懒加载（Phase 2c+）

```text
ChatPanel mount
  → loadChatLogDates()
  → invoke("load_chat_log_dates", { token })
  → src-tauri/src/lib.rs reqwest GET /chat-log/dates
  ← { dates: [...], count: N }   // 倒序，最新在前

启动 / 滚顶触发
  → loadChatLogDay(date)
  → invoke("load_chat_log_day", { date, token })
  → src-tauri/src/lib.rs reqwest GET /chat-log/{date}
  ← { date, entries: [...], raw_fallback: bool }
  → ChatPanel prepend / append 消息列表
```

数据源：`qq-st-bot/data/event_log/{owner_qq}/*.md`（owner_qq 由后端从 config 读，接口路径不暴露）。

### 日记列表和详情

```text
Sidebar diary tab → SubDiary mount
  → loadDiaryList()
  → invoke("load_diary_list", { token })
  → src-tauri/src/lib.rs reqwest GET /diary/list
  ← { entries: [...], count: N }
  → SubDiary 渲染列表

点击 entry
  → loadDiaryEntry(date)
  → invoke("load_diary_entry", { date, token })
  → src-tauri/src/lib.rs reqwest GET /diary/{date}
  ← { date, title, emotion, body }
  → panesApi.openPane() 打开浮动详情窗
```

数据源：`qq-st-bot/data/yexuan_inner/diary/*.md`（只读，严格匹配 `YYYY-MM-DD.md`）。

### 头像和 Dream 背景存储

```text
AvatarCropper / DreamBackgroundCropper
  → shared/images/cropImageToBlob.ts
  → avatarStore.setAvatar() / setDreamBackground(tone)
  → Tauri save_avatar()
  → app_data_dir()/avatars/*.png
  → app_data_dir()/avatars.json
```

Dream 背景按 `day` / `night` 分开记录。旧版单字段 `dream_background` 读取时兼容迁移为夜间背景。

---

## 目录职责

| 路径 | 职责 |
|---|---|
| `src/main.tsx` | React 入口 |
| `src/windows/chat/` | 主聊天窗口 |
| `src/windows/chat/components/` | Ribbon、Sidebar、ChatPanel、浮动 pane、偏好/帮助等 UI |
| `src/features/dream/` | Dream UI v2 纯前端 preview：tokens、overlay、入口按钮、afterglow |
| `src/shared/state/store.ts` | 客户端状态 engine |
| `src/shared/api/` | 后端 HTTP/WS 包装 |
| `src/shared/avatars/store.ts` | 头像配置和 data URL 缓存 |
| `src/shared/chatAppearance.ts` | Chat 本地字号、字体包偏好和动态字体清单 |
| `src/shared/dreamAppearance.ts` | Dream 本地外观偏好、动态字体清单 |
| `src/shared/fontAppearance.ts` | Chat / Dream 共用字体扫描、family 和 URL helper |
| `src/shared/images/cropImageToBlob.ts` | 头像和 Dream 背景共用 canvas 裁剪 helper |
| `src/shared/ui/TypingDots.tsx` / `TypingDots.css` | Chat / Dream 共用输入中视觉组件 |
| `src/shared/theme/globals.css` | 全局主题变量 |
| `src-tauri/src/lib.rs` | Tauri command 和 Rust HTTP 桥 |
| `src-tauri/src/sensor/`(规划中) | sensor 感知模块,嵌入 Tauri Rust 进程 |
| `sensor-service/` | 已废弃,原 Python 独立进程方案 |

---

## 迁移关系

`Emerald-client` 主要从两个来源迁移：

- `D:\ai\Emerald-desktopUI\`：HTML/JSX UI 原型。
- `D:\ai\Emerald-desktop\`：旧 PyQt 桌宠和 Python 感知/行为层。

已迁：

- `chat.jsx` → `ChatPanel.tsx`
- `ribbon.jsx` → `Ribbon.tsx`
- `sidebar.jsx` → `components/archive/Sidebar.legacy.tsx`，当前 `Sidebar.tsx` 改为占位版
- `panes.jsx` → `Panes.tsx`
- `ui-kit.jsx` → `UIKit.tsx`
- `state-engine.js` 的状态表 → `shared/state/store.ts`
- 花园只读 panel → `SubGarden.tsx`
- 日记只读 panel → `SubDiary.tsx`

未迁或未完成：

- `pet.jsx` 的桌宠渲染与行为。
- sensor 感知模块嵌入 Tauri Rust(`src-tauri/src/sensor/`),
  不再走原 PyQt / Python 独立进程方案。
- v1 WebSocket 协议。
- Sidebar flow/status tab 的真实数据接入。
- 花园交互能力和 harvest/vase 详情展示。
- 日记 emotion 字段（后端未产出，当前全为 null）。

详情见 `docs/migration-status.md`。

---

## 设计判断

- HTTP 不从浏览器 `fetch` 直连后端，而是走 Tauri command，避免 CORS 和代理问题。
- Rust HTTP client 必须 `no_proxy()`。
- WS 使用 Tauri Rust 原生 bridge，以 Bearer header 连接本机 `127.0.0.1`，前端不持有 token。
- 业务数据以 `qq-st-bot` 为准；客户端状态只是 UI 镜像。
- legacy 协议和 v1 目标协议要在文档里明确区分，不能混写。

---

## 当前主要风险

最高优先级风险集中在后端协议对齐：

- 客户端和后端实际仍在 legacy WS 协议。
- v1 文档目标要求 `assistant_message` / `state_update` / `user_message` / `client_event`，当前未实现。
- action executor 只覆盖四类基础动作，尚未接入桌宠行为或 v1 capabilities。
- P-02 已将 backend base、WebSocket base、admin token 和 sensor config 外化到 client config；`config/client.local.json` 不提交。`loadHistory()` 仍保留备用 user id 默认值，默认开发 token 仅作为无本地配置时的兼容 fallback，不代表生产鉴权方案。

完整列表见 `docs/known-issues.md`。

---

## Dream 模式状态显示

Dream 模式只在正式 Dream 系统内显示，不进入 Chat 侧边栏。当前实现位于
`src/windows/dream/components/DreamPrefsPane.tsx` 的“偏好 / 世界”页，复用
`DreamWindow` 中 `useDreamState()` 对 `GET /dream/state` 的既有刷新结果。

- “入梦模式”提供沙盒 / 剧本 / 镜像按钮；选择结果保存在本地 UI 偏好中，并在下一次
  `POST /dream/enter` 时作为 `dream_mode` 提交。剧本模式额外提交 `script_id`。梦境进行中不可切换。
- 只有 `dream_mode ?? mode` 等于 `scenario` 时才渲染“剧本模式状态”分组。
- 优先读取 `scenario` 嵌套字段，并兼容同名平铺字段。
- 缺失字段显示 `—`；`ending_state === "completed"` 仅显示“剧本已完成”，不自动关闭 Dream。
- Scenario progress 和 stage transition 完全由后端负责；客户端只读展示 dev/debug 信息。
- 只有 `dream_mode ?? mode` 等于 `mirror` 时才渲染“镜像模式状态”分组；优先读取
  `mirror_core`，并兼容 `mirror`。MirrorCore、hidden state snapshot、afterglow 和 impression
  均由后端负责，客户端只读显示 version/source/buckets/hints。
