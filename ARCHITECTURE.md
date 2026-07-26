# ARCHITECTURE.md — PresenceKit-desktop 架构总览

PresenceKit-desktop（仓库目录名可为 Emerald-client 等）是 `Emerald-presence` 的新桌面客户端。它不拥有角色记忆、调度、工具、情绪判断等核心数据；这些都属于 `Emerald-presence` 仓库（通常与本仓库同级）。客户端负责把后端的陪伴系统可视化：聊天窗口、桌宠形象、用户交互、桌面动作执行和未来的感知 UI。

---

## 系统边界

```text
┌──────────────────────────┐
│ Emerald-presence                │
│ 记忆 / prompt / LLM       │
│ 调度 / 工具 / 情绪状态     │
│ HTTP + WebSocket          │
└────────────┬─────────────┘
             │
             │ HTTP / WS on 127.0.0.1:8080
             ▼
┌──────────────────────────┐
│ PresenceKit-desktop       │
│ Tauri shell               │
│ React chat + pet windows  │
│ shared StateEngine mirror │
└────────────┬─────────────┘
             │
             │ HTTP POST /sensor/realtime (本机或内网穿透)
             ▼
┌──────────────────────────┐
│ PresenceKit-desktop       │
│ src-tauri/src/sensor/     │
│ Rust 嵌入式键鼠/焦点采集    │
│ 已实施并随 Tauri 运行       │
└──────────────────────────┘
```

原则：后端是 single source of truth，客户端只显示和执行。客户端可以有本地 UI 状态，但不能把 mood、activity、presence 变成第二套业务真值。

### 鉴权：三类 token

后端（Emerald-presence）鉴权已升级为多 token + scope 分层（SEC-AUTH-2），default-deny，legacy
admin secret 永远等价于 `admin` scope（零破坏迁移）。本仓触达的三类持有者：

- **桌面 Tauri 客户端**（本仓 `src-tauri/`）：`desktop` profile token（`emt_…`），字段仍叫
  `admin_token` / env `EMERALD_ADMIN_TOKEN`，不改名。
- **历史 sensor 客户端**：旧 Python 独立进程方案已从本仓删除；其历史 `sensor` profile token 仅有`r`n  `sensor.write` 权限，不得复用桌面/admin token。当前感知运行于 `src-tauri/src/sensor/`。
- **设备侧**（仓外，ESP32 固件等）：各自最小 scope token。

Token 由后端 `POST /auth/tokens` 签发；scope 表、profile 表、管理操作见后端仓
`docs/security.md`。

---

## 当前实现快照

入口是 `src/main.tsx`：

- 初始化头像 / Dream 背景 store：`avatarStore.init()`。
- 挂载全局样式：`src/shared/theme/globals.css`。
- 默认渲染 `<ChatWindow />`；`?window=pet`、`?window=presence-nag` 和 `?window=diary-detail`
  分别进入独立 Webview view。
- 聊天与桌宠的 TTS 音频可并行合成；主 Webview 通过 Tauri window event 持有播放租约队列，保证任一窗口播放结束后才授权下一条音频输出。
- 在默认主 view 中由 `activeWindow` 在保持 `<ChatWindow />` 挂载的前提下覆盖
  `<ActivityWindow />`、`<ToyWindow />` 或 `<RoomWindow />`，避免卸载 ChatPanel 和 WS 订阅。

主窗口是 `src/windows/chat/ChatWindow.tsx`：

- 创建单个 `StateEngine` 实例。
- 管理主题、Sidebar、偏好面板、帮助面板、桌宠开关等 UI 状态。
- 通过 `src/shared/layout/registry.ts` 的声明式 LayoutHost 排布 Ribbon、Sidebar 和主内容区；偏好「外观」中的布局预览器可立即切换已发现的布局。布局 mod 还能用受控 `mainLayout` 模板重排 ChatPanel 内的标题、消息流、输入框；它不能替换或执行区域组件。
- 使用 `src/shared/chatAppearance.ts` 保存 Chat 聊天字号、主题字号和字体包；Sidebar 宽度仅通过界面分隔条拖拽调整。
- 偏好面板的「世界」页通过 `getPromptAssets()` / `patchPromptAssets()` 管理 Reality Prompt Assets：角色卡单选、世界书多选和破限多选。可用选项来自后端，客户端不展示文件路径。
- 把 engine 传给 `ChatPanel`。
- Activity 打开时保持 ChatWindow / ChatPanel 挂载，ActivityWindow 只作为覆盖层显示。ToyWindow（玩耍模式）与 ActivityWindow 同级，由 `main.tsx` 的 `activeWindow` 切换挂载，ChatWindow 传入 `onToyOpen`。
- 管理正式 Dream overlay 的本地开关；Ribbon 月亮按钮和 WS `dream_invite` UI 事件共用该入口，DreamWindow 自己接入 Dream API 和窗口状态机。
- `GroupChatPanel` 的「入梦」入口将 `mode=group`、`group_id` 与 roster 交给同一个 DreamWindow；群梦不另建窗口组件族。现实群聊常驻并每 8 秒读取群梦 state，在 `blocks_chat` 的 dreaming / cooldown 阶段锁定输入。群梦轮次在 WS `group_round_end` 漏失或连接恢复时由 state 的 `round_status` 校准；现实轮次采用同一 120 秒可见超时兜底。
- 玩耍模式：偏好「其他」页开关（`shared/playMode.ts`，localStorage `playMode.enabled`，默认关闭）；开启后 WS `toy_invite` 自动开窗、Ribbon 显示手动入口。ToyWindow 侧栏经 `hardware_get_devices` 轮询设备/连接状态，聊天经 `sendChat` 走 `/desktop/chat`。
- 将当前 Reality 激活角色卡头像传给 DreamWindow；Dream 内控制栏、动向侧栏和消息区优先显示该头像，无角色头像时回退到本地 HER 头像。
- Ribbon 桌宠开关通过 `src/shared/pet/bridge.ts` 显隐独立透明置顶 `PetWindow`，并将
  StateEngine 的 mood / presence / activity 快照广播给桌宠。
- 成长、视觉、支出、群聊仲裁和记忆五类运维观测已迁入 PresenceKit 后端管理面；桌面客户端不再
  代理这些请求、不在 Chat Ribbon 暴露运维入口，也不把观测数据写入 StateEngine。

桌宠窗口是 `src/windows/pet/PetWindow.tsx`：

- `ParticleCanvas` 按 mood / presence / thinking 渲染持续粒子呼吸和交互脉冲。
- `usePetMouse` 使用 Tauri 全局光标、窗口位置和显示器 work area API 驱动鼠标交互。
- 当前 `惊讶` mood 作为害羞状态：光标接近时窗口缓动躲避；随机间隔会朝光标轻移并触发
  蹭的粒子反应。
- 按住 Ctrl 或拖拽期间暂停自动移动；所有目标位置夹在当前显示器可视工作区内。
- 鼠标交互开关和随机蹭间隔是本地 UI 偏好，不写入 StateEngine 或后端。
- 「粒子风格」偏好新增 `live2d`：`Live2DStage` 复用 `src/shared/live2d/useLive2DStage.ts` 驱动层，
  `transparent` 强制开启（无视 Live2DSettings.bgKind），缩放走独立 `pet.live2d.zoom` UI 偏好；
  害羞 / 蹭反应触发一次性衰减姿态脉冲（`useLive2DStage` 返回的 `pulse()`）。

视频通话窗口是 `src/windows/room/RoomWindow.tsx`：

- 顶栏 / VN 气泡（`VnBubble` + `useVnPresenter`）/ 输入栏 / 麦克风 / 挂断在两种渲染模式间共用；
  `setupAvatarDirectiveListener` 在 RoomWindow 层挂载，`avatarDirective.ts` 的 TTL 指令
  （表情 / 注视 / 手势 / 说话）两种渲染模式语义一致。
- `roomSettings.renderMode`（`model3d` | `live2d`，Chat 偏好「6 视频通话」页切换）决定挂载
  `ThreeCallStage`（现有 Three.js GLB 角色 + `useRoomScene`，含摆放模式 / 自由视角 / 保存视角）
  还是 `Live2DCallStage`（`src/shared/live2d/useLive2DStage.ts`，pixi.js + pixi-live2d-display）。
  两者互斥挂载，不能同时启用 hook，切换即时黑一帧无过渡。
- `src/shared/live2d/` 是 3D 侧 `useCharacterRig` 的平行驱动层：模型加载（Cubism Core 动态注入 +
  `Live2DModel.from`）、mood → 表情/参数映射（`live2dExpressions.ts`，表情命名匹配优先，
  核心参数直写兜底）、眨眼 / 口型 / 注视 / 手势通过 monkey-patch `motionManager.update` 逐帧叠加。
  Live2D 模型资产（Cubism 4/5，`.model3.json`）放 `public/live2d/models/<名>/`，一模型一目录；
  Cubism Core 运行时（`live2dcubismcore.min.js`）放 `public/live2d/core/`，Live2D 专有许可不入
  git，需手动下载，见 `docs/live2d-model-import-guide.md`。

存在感弹窗是 `src/windows/presence-nag/PresenceNagWindow.tsx`：

- 独立透明置顶 `presence-nag` Tauri 窗口，默认隐藏且单实例；重复 action 只更新内容，不叠加刷屏。
- Chat 偏好「其他」中的「允许存在感弹窗」默认关闭；关闭时 WS action 静默跳过，并立即隐藏已显示窗口。
- `Esc`、标题栏关闭、「别理我了」、「确定」和「全部关闭」均调用 `presence_nag_close_all`，保证可彻底关闭。
- 内容只消费后端 `presence_nag` action 的 LLM 台词；头像使用本地 HER 头像，角色标识用于显示角色名。

Dream 窗口是 `src/windows/dream/DreamWindow.tsx`：

- 管理 Dream overlay、左侧 Ribbon、信息 Sidebar 和对话区域。
- 动向 / 状态 / 潜意识使用 Dream 左侧 Sidebar；偏好 / 帮助使用独立居中 modal，避免设置项挤在窄侧栏中。
- 动向 Sidebar 的「梦境流动」优先读取 `/dream/state` 可选 flow/event 摘要，旧后端缺失时从当前 dream state 派生短文案；不展示 chat transcript。
- 状态 Sidebar 展示 `/dream/state` 的 Dream HUD v1.1 字段；文本以状态 pill 展示，数值缺失时显示空值，Dream 未激活时显示空态。`physiological_arousal` 仅在 `/dream/settings` 的 `display.physiological_arousal === true` 时展示。
- 偏好窗口通过 `src/shared/api/dream.ts` 读写 `/dream/settings`，顶部横栏分为当前状态、梦境上下文、系统设置、世界和其他。世界页保存 `world_layer` 世界卡和 Dream 独立 `jailbreak_preset`；系统设置额外使用 `src/shared/dreamAppearance.ts` 持久化本地字体、配色和模糊度，并通过 `avatarStore` 分别保存日间 / 夜间聊天背景；底部开发者模式开关写入 `display.physiological_arousal`。帮助窗口只展示本地说明。
- `DreamGlowPanel` / `DreamGlowBubble` 复用 `features/dream/DreamTokens.css` 的玻璃发光 token，分别承载 Sidebar 状态卡和 Dream 对话气泡；Dream 潜意识页挂载只读 hidden state 面板。
- `mode=group` 时状态、发送、退出与设置分别切到 `/group/{id}/dream/*`；群梦回复由 dream-domain WS round / stream / channel 帧驱动，气泡按 `char_id` 署名、头像和稳定角色色渲染。WAKE 与 Esc 直接硬退出，不经过单人软挽留。

聊天区是 `src/windows/chat/components/ChatPanel.tsx`：

- 启动时通过 Tauri command 加载短期历史。
- 用户发送消息时调用 `sendChat()`，走 Tauri Rust command 再打后端 HTTP。
- 订阅 `wsClient` 的 `channel_message` / `message_segments`，接收后端主动推送并按 assistant `msg_id` 关联；content hash 只用于旧后端或异常响应 fallback。
- `pending message_segments` 使用 5 分钟 TTL 和 50 条上限，`msg_id` 到本地消息的映射只保留最近 200 条。
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

成长、视觉、支出、群聊仲裁和记忆摘要的观测面已迁入 PresenceKit 后端管理面。桌面端原
`ObservabilityPanel`、`observability-api` 与 Tauri `observability_get` command 已移除；接口、
鉴权和当前入口以 `docs/backend-integration.md` 的「五类观测面板」为准。

潜意识面板是 `src/windows/dream/components/SubHiddenStatePanel.tsx`：

- 由 `DreamWindow.tsx` 在 Dream `subconscious` tab 下挂载，Ribbon 正式入口显示为「潜意识」，不再使用 `DEV: Hidden State`，也不挂在 Chat 侧栏。
- 挂载时只调用 `loadHiddenStateDebug()`，经 Tauri command `load_hidden_state_debug` 读取后端 `GET /debug/user-hidden-state`。
- 常态展示 `embodied_ease`（身体放松度）、`body_memory`（身体记忆线索）、`dream_snapshot`（梦境读取到的状态）和最近来源 badge；空 `body_memory` 显示「暂无身体记忆线索」。
- `sensitivity` 和 `touch_need` 等较细 raw 数值只在 Dream 系统设置的开发者模式打开时展示；该模式复用 `/dream/settings` 的 `display.physiological_arousal` 开关，由 Rust command 只读合并到返回值。
- Phase 4.5 UI 已从 debug-only 入口提升为单用户状态面板；仍然只读，没有新增写接口，也不把 hidden state 注入现实 prompt 或 memory。

WebSocket 在 `src/shared/api/ws.ts`：

- 前端通过 Tauri commands / events 调用 `src-tauri/src/ws_bridge.rs` 的原生 WebSocket client。
- Rust 从本地 client config 读取 admin token，并在握手请求中设置 `Authorization: Bearer ...`；token 不进入 URL 或 WebView。
- 支持 legacy `hello_ack`、`channel_message`、`message_segments`、`action`、`ping`。
- `action` 保持 legacy envelope，不改协议；收到后异步 dispatch 到 Tauri action commands，并按执行结果回 `ack`。
- 自动重连，指数退避最大 30 秒。
- 当前没有实现 v1 envelope，也没有发送 `user_message` / `client_event`。

Tauri Rust 在 `src-tauri/src/lib.rs`：

- `send_chat`：POST `/desktop/chat`，使用 `reqwest.no_proxy()`；响应保留 assistant `turn_id` / `msg_id`。
- HTTP client 普通请求超时为 15 秒，chat / wake / Dream 等 LLM 请求超时为 120 秒；401（token 无效）与 403（scope 不足，detail 含所需 scope）分开报错，文案均不含 token 值，见 `safe_http_error`。
- `ws_bridge.rs`：原生 WebSocket Bearer 鉴权、收发桥接和 URL query token 清洗。
- `load_history`：GET `/memory/{user_id}/short-term`，使用 Bearer token。
- `load_garden_state`：GET `/garden/state`，使用 Bearer token。
- `load_sensor_realtime`：GET `/sensor/realtime`，使用 Bearer token；无数据响应归一为 `_no_data`。
- `sensor/visual.rs`：仅 Windows 启动的视觉观察采样器。每次内存截屏前先 GET `/perception/visual/config`，再检查本地 opt-in 与锁屏；主屏 dHash 显著变化时才将内存 JPEG（长边 ≤1280）POST `/perception/visual`，图片不落盘。
- `get_prompt_assets` / `patch_prompt_assets`：GET / PATCH `/settings/prompt-assets`，使用 Bearer token 和 `reqwest.no_proxy()`；仅服务 Chat 的 Reality Prompt Assets 设置。
- `load_hidden_state_debug`：GET `/debug/user-hidden-state`，并只读参考 `/dream/settings.display.physiological_arousal` 作为潜意识面板开发者字段显隐；不写 hidden state。
- `src-tauri/src/actions.rs`：执行基础 desktop action，并负责单实例 `presence_nag` 窗口显示与 `presence_nag_close_all` 强制全关。
- `save_avatar` / `load_avatar` / `read_avatars_json` / `write_avatars_json`：本地头像和 Dream 背景持久化。
- `list_dream_fonts`：打包后优先扫描 `resource_dir/fonts`，debug/dev 模式回退源码 `public/fonts/`；目录不可用时返回明确错误。
- `list_themes`：扫描 `resource_dir/themes/*/theme.json`，debug/dev 模式回退源码 `public/themes/`；前端注册中心负责契约校验和内置主题合并。
- sensor `title_sanitizer` 采用保守默认：Browser 仅返回域名，Editor 仅返回安全 basename，Chat / Other / 未知及文件查看类应用不返回 `title_hint`。
- 视觉观察的默认 5 分钟是本地采样/比对周期，不是上传周期；预检失败、后端关闭、锁屏/无桌面会话或画面不变时均不上传。

---

## 状态模型

`src/shared/state/store.ts` 定义客户端状态镜像：

- `mood`：`平静` / `开心` / `低落` / `病娇` / `分心`
- `focus`：`看你` / `发呆` / `想事情` / `看屏幕` / `看你打字` / `偷看` / `注意到了什么`
- `activity`：后端 activity manager 返回的身体动作
- `presence`：`active` / `idle` / `away`
- `mode`：`companion` / `chat-only`
- `wantToSpeak`、`behaviorId`、`bodyTiltOverride` 等视觉信号

当前 engine 是前端本地对象。`STATE_FIELD_OWNERSHIP` 明确字段当前 owner；`useBackendStatePolling()` 是 mood/activity 后端轮询的唯一入口，ChatWindow 常驻低频轮询（120s/180s），Sidebar flow/status tab 叠加原有高频轮询，并统一通过 `applyBackendState(source, patch)` 写入；本地 focus 推断走 `setLocalFocus()`。WS `state_update` 尚未接入，`state-update` source 仅作为未来入口保留。sensor 快照当前不写入 engine，只在 `SubStatus` 内派生信号。

旧原型 `Emerald-desktopUI` 仓库（通常与本仓库同级）的 `state-engine.js` 里有完整 behavior loop；当前 TypeScript 版删掉了 mock 行为循环，等待后端状态推送。

---

## 通信路径

### 用户发消息

```text
ChatPanel.send()
  → src/shared/api/backend.ts sendChat()
  → Tauri invoke("send_chat")
  → src-tauri/src/lib.rs reqwest POST /desktop/chat
  → Emerald-presence pipeline
  ← HTTP JSON { reply, emotion, affection, level, turn_id, msg_id }
  → ChatPanel 优先按 msg_id 与 WS channel_message / message_segments 对账
```

这条路径是当前真实路径，但不是 v1 目标协议的最终路径。v1 目标是用户输入走 WS `user_message`，回复走 WS `assistant_message`。
后端当前 assistant correlation ID 对齐为 `HTTP turn_id = HTTP msg_id = WS channel_message.msg_id = WS message_segments.msg_id`。

### 后端主动消息

```text
Emerald-presence DesktopChannel
  → channels/desktop_ws.py push_message()
  → WS { type: "channel_message", content, msg_id }
  → src/shared/api/ws.ts
  → ChatPanel 追加 assistant bubble
```

### 桌面动作

```text
Emerald-presence push_action_and_wait()
  → WS { type: "action", action, msg_id }
  → src/shared/api/ws.ts
  → 根据 action_type/type 调 Tauri command
  → src-tauri/src/actions.rs 执行动作
  → 成功/失败后回 ack
```

当前接入四类基础 desktop action：`minimize_window`、`open_url`、`show_notify`、`media_play_pause`，以及只打开 Dream overlay 的 UI action `dream_invite`。未知 action 不执行，并回 `ok:false`。

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

数据源：`Emerald-presence/data/event_log/{owner_qq}/*.md`（owner_qq 由后端从 config 读，接口路径不暴露）。

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

数据源：`Emerald-presence/data/yexuan_inner/diary/*.md`（只读，严格匹配 `YYYY-MM-DD.md`）。

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
| `src/windows/activity/` | 全屏活动空间（阅读、棋类、梦种） |
| `src/windows/diary-detail/` | 单篇日记独立 Webview 窗口 |
| `src/windows/dream/` | Dream overlay、HUD、潜意识只读面板 |
| `src/windows/pet/` | 独立桌宠窗口、粒子视觉和鼠标交互 |
| `src/windows/presence-nag/` | 单实例存在感提醒透明窗口 |
| `src/windows/room/` | 视频通话 3D/Live2D 场景和 VN 呈现 |
| `src/windows/toy/` | 玩耍模式窗口 |
| `src/shared/pet/` | Chat/Pet 窗口快照桥和桌宠本地设置 |
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
| `src/shared/i18n/` | `zh-CN` / `en-US` 语言包、持久化语言选择与 React 订阅 API |
| `src/shared/theme/globals.css` | 全局主题变量 |
| `src/shared/theme/contract.ts` / `registry.ts` | 主题 Mod token 契约、内置与磁盘主题注册、运行期注入；磁盘 CSS 经 Tauri `read_theme_css` 读取并在前端安检 |
| `src-tauri/src/lib.rs` | Tauri command 和 Rust HTTP 桥 |
| `src-tauri/src/sensor/` | sensor 感知模块，嵌入 Tauri Rust 进程；Windows 视觉观察仅内存采样、比对与变化上传 |

---

## 迁移关系

本仓主要从两个来源迁移：

- `Emerald-desktopUI` 仓库（通常与本仓库同级）：HTML/JSX UI 原型。
- `Emerald-desktop` 仓库（通常与本仓库同级）：旧 PyQt 桌宠和 Python 感知/行为层。

已迁：

- `chat.jsx` → `ChatPanel.tsx`
- `ribbon.jsx` → `Ribbon.tsx`
- `sidebar.jsx` → 当前 `Sidebar.tsx`；legacy 存档已删除，历史由 Git 保留
- `panes.jsx` → `Panes.tsx`
- `ui-kit.jsx` → `UIKit.tsx`
- `state-engine.js` 的状态表 → `shared/state/store.ts`
- 花园只读 panel → `SubGarden.tsx`
- 日记只读 panel → `SubDiary.tsx`
- sensor 感知模块 → `src-tauri/src/sensor/`，已嵌入 Tauri Rust 进程

未迁或未完成：

- `pet.jsx` 的具象角色渲染与更完整行为；当前已落地抽象粒子桌宠、窗口桥和鼠标交互。
- v1 WebSocket 协议。
- Sidebar flow/status tab 的真实数据接入。
- 花园交互能力和 harvest/vase 详情展示。
- 日记 emotion 字段（后端未产出，当前全为 null）。

旧的逐项迁移状态专档已移除；仍未完成的迁移缺口以上表和 `docs/known-issues.md` 为准。

---

## 设计判断

- HTTP 不从浏览器 `fetch` 直连后端，而是走 Tauri command，避免 CORS 和代理问题。
- Rust HTTP client 必须 `no_proxy()`。
- WS 使用 Tauri Rust 原生 bridge，以 Bearer header 连接本机 `127.0.0.1`，前端不持有 token。
- 业务数据以 `Emerald-presence` 为准；客户端状态只是 UI 镜像。
- legacy 协议和 v1 目标协议要在文档里明确区分，不能混写。

---

## 当前主要风险

最高优先级风险集中在后端协议对齐：

- 客户端和后端实际仍在 legacy WS 协议。
- v1 文档目标要求 `assistant_message` / `state_update` / `user_message` / `client_event`，当前未实现。
- action executor 只覆盖四类基础动作，尚未接入桌宠行为或 v1 capabilities。
- P-02 已将 backend base、WebSocket base、admin token 和 sensor config 外化到 client config；`config/client.local.json` 不提交。`bot_user_id` 默认为空，`load_history` 在空 id 时返回空历史；token 默认值仅为不可用占位符 `CHANGE_ME`。

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


## P0–P2 设置控制面

桌面设置、管理面板、权限边界和降级路径的当前事实以 docs/settings-control-audit.md 为准。模型密钥只在后端管理面维护；桌面只切已有 routing profile。
