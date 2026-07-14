# docs/frontend-structure.md — 前端结构指南

本文档描述 `src/` 内当前 React/Tauri 前端实现。它记录的是实际代码状态，不是目标方案。

---

## 入口

`src/main.tsx` 做四件事：

1. 引入全局样式 `src/shared/theme/globals.css`。
2. `await initUIPrefs()`——渲染前必须等待，见下方「uiPreferences」。
3. 调用 `initTheme()`（不等待）应用当前主题，随后调用 `avatarStore.init()` 读取本地头像配置。
4. 默认渲染 `<ChatWindow />`；主 view 内按本地状态叠加 Activity / Toy / Room，独立 Webview
   则按 query 参数渲染 Pet / PresenceNag / DiaryDetail。

入口按 query 参数选择 view：默认渲染聊天窗口，`?window=pet` 渲染独立 `PetWindow`，
`?window=presence-nag` 渲染独立、默认隐藏的 `PresenceNagWindow`，`?window=diary-detail` 渲染
独立的 `DiaryDetailWindow`。四种 view 共用同一个 bundle/入口，不是各自独立的 HTML 页面。

### uiPreferences（`src/shared/uiPreferences.ts`）

所有 `emerald.ui.*` 前缀的偏好统一走这里的 `getUIPref`/`setUIPref`，不直接摸 localStorage：

- 真正的持久化落在 Rust 侧 `app_config_dir()/ui-preferences.json` 文件（IPC：`load_ui_prefs`/
  `save_ui_prefs`，原子写），不再依赖 localStorage——localStorage 的 user-data 目录按 Tauri
  `identifier` 派生，`identifier` 一改（例如改包名）localStorage 就会换到全新空 profile，
  历史偏好全部归零（曾经出过一次事故，见 `docs/known-issues.md`）。
- `initUIPrefs()` 在渲染前 `invoke('load_ui_prefs')`，解析进内存 `Map`，并镜像写回
  localStorage（保留给依赖原生 `storage` 事件做跨窗同步的旧代码路径，如 `theme/registry.ts`）。
  非 Tauri 环境（纯浏览器 `npm run dev`）invoke 会失败，直接 fallback 为纯 localStorage。
- `getUIPref` 读内存 Map（同步）；`setUIPref` 写内存 + localStorage 镜像 + 300ms debounce
  invoke `save_ui_prefs`（整份 Map 序列化写文件）。
- 跨窗口：另一个窗口写偏好会触发本窗口的原生 `storage` 事件，uiPreferences 内部监听并把
  变更折叠进本窗口的内存 Map，再重新派发同一个 in-process 事件（`onUIPrefChange` 订阅者），
  调用方不需要区分本地修改和跨窗修改。
- 迁移：`petVisualStyle.ts`、`pet/mouseSettings.ts`、`petRoamSettings.ts`、
  `petRippleSettings.ts`、`SubFlow.tsx` 的 timeline 各自原来直接读写 localStorage 裸 key，
  现改走 `getUIPref`/`setUIPref`；首次读不到新 key 时从旧裸 key 迁移一次并删除旧 key。

### activeCharacter（`src/shared/activeCharacter.ts`）

「当前激活角色是谁」的跨窗口缓存（cc-tasks/15 §G）。每个 client 窗口（chat / room /
activity / toy / presence-nag）是独立 webview，没有共享的 JS 单例，所以这个缓存直接建在
`uiPreferences` 之上（key `character.active`，存 `{id, name}`），复用其文件+localStorage
跨窗同步机制，而不是塞进 `StateEngine`（`shared/state/store.ts` 的 `StateEngine` 只在
`ChatWindow` 自己的组件树里存活，不跨窗口）。

- `ChatWindow.tsx` 是唯一的 writer：每次 `getPromptAssets()` 解析出 `active.active_character`
  后调用 `updateActiveCharacterFromAssets(assets)`，从 `characters` 列表里查到对应 `label`
  写入缓存；`PromptAssetsSettings` 的 `save()` 切换角色成功后同步刷新。
- 其余窗口/组件只读：`getActiveCharacterName(fallback?)` 同步取「显示名 → 原始 char_id →
  fallback（默认 'TA'）」；需要随角色切换实时刷新的常驻 UI 另订阅 `subscribeActiveCharacter`。
- 用于替换所有原先硬编码「叶瑄」的展示位置（通知标题、视频通话姓名标签、活动陪聊面板、
  presence-nag 弹窗等）；`npm run check:naming`（`scripts/check-naming.mjs`）扫描 `src/` 断言
  不出现字面量「叶瑄」/「yexuan」（白名单仅保留 `char_tension`/`yexuan_tension` 双发过渡期的
  兼容读取），防止硬编码回流。

---

## ChatWindow

文件：`src/windows/chat/ChatWindow.tsx`

职责：

- 创建并持有单个 `StateEngine`。
- 管理 UI 状态：主题、侧栏开关、侧栏 tab、侧栏宽度、帮助面板、偏好面板、桌宠开关。
- 管理 Dream UI v2 preview 的本地状态：Ribbon 入口打开 overlay，Esc / WAKE 关闭并显示 afterglow。
- 订阅 WS `dream_invite` UI 事件；收到角色邀请时清除 afterglow 并打开 Dream overlay。
- 布局三列：Ribbon、Sidebar、ChatPanel。
- ActivityWindow 由 `src/main.tsx` 作为 overlay 覆盖；Activity 打开期间 ChatWindow / ChatPanel 保持挂载，WS 订阅不中断。
- 负责偏好面板内的头像上传/裁剪入口。
- 世界页角色卡头像同样复用 `AvatarCropper`，选择 PNG / JPEG / WebP 后先裁剪为 256 × 256 PNG，再通过角色头像后端接口上传。
- Chat 偏好浮层使用顶部横栏分类：外观、世界、其他。外观提供主题、信息栏、聊天字号、主题字号、动态字体包和头像设置；Sidebar 宽度只保留界面拖拽，不再在偏好里重复提供控制项。世界页通过 `PromptAssetsSettings` 读取和保存 Reality Prompt Assets，提供角色卡单选、Reality 世界书多选和 Reality 破限多选；其他暂留导入占位。

关键状态：

| state | 说明 |
|---|---|
| `theme` | 当前主题 id；通过主题注册中心注入 token 并持久化到 `chat.theme` |
| `petVisible` | 控制独立 Tauri pet 窗口显隐，并同步 engine mode |
| `sidebarOpen` / `sidebarTab` | 控制左侧副栏 |
| `sidebarWidth` | 可拖拽调整，范围 250-540 |
| `chatHeaderVisible` | 控制 ChatPanel 顶部状态栏 |
| `appearance` | Chat 本地外观设置：聊天字号、主题字号、字体包 |
| `PromptAssetsSettings.assets` | Chat 世界页局部状态：`characters` / `lorebooks` / `jailbreaks` / `active`；由后端读取，API 层兼容旧字符串数组与新版 `{ id, label, kind }` 选项数组，PATCH 成功后使用后端返回的 `active` 回写 |
| `PromptAssetsSettings.loading` / `saving` / `error` | Chat 世界页局部请求状态 |
| `PromptAssetsSettings.avatarCropSrc` / `avatarCropCharId` | 世界页角色卡头像裁剪源与上传目标角色；确认裁剪后才调用后端上传 |
| `specOpen` / `prefsOpen` | 帮助/偏好浮层 |
| `dreamWindowOpen` / `dreamAfterglow` | 控制 DreamWindow 显示和醒后余韵横幅 |

## DreamWindow（正式 Dream 入口）

文件：`src/windows/dream/`

```
src/windows/dream/
├── DreamWindow.tsx          状态机编排（loading → ready → entering → active → ended）
├── components/
│   ├── DreamChatPanel.tsx   消息区 + 输入框（append-only，无历史分页）
│   ├── DreamSidebar.tsx     status / emotional_tension / scene_state / symbolic_anchors / dream flow 摘要
│   ├── DreamStatusSidebar.tsx Dream HUD v1.1 状态页 + /dream/settings 隐藏项开关
│   ├── DreamGlowPanel.tsx   发光状态卡，支持 title / status / tags / children
│   ├── DreamGlowBubble.tsx  发光聊天气泡，支持 left / right 与可选消息元信息
│   ├── DreamPrefsPane.tsx   窗口式梦境偏好设置，读取并保存 /dream/settings
│   ├── DreamHelpPanel.tsx   窗口式梦境帮助说明
│   └── DreamControlBar.tsx  WAKE 按钮 + 场景状态标题
└── hooks/
    ├── useDreamState.ts     轮询 GET /dream/state（8s 间隔）
    └── useDreamChat.ts      POST /dream/chat + 管理本地 buffer
```

职责：

- `DreamWindow` 是唯一接入后端 Dream API 的正式入口，由 `ChatWindow` 在 Ribbon 月亮按钮触发后以 fixed overlay 形式渲染。
- Dream 头像由 `ChatWindow` 将当前 Reality 激活角色卡头像传入 `DreamWindow`，再统一下发给控制栏、动向侧栏和消息区；角色卡没有头像时回退到外观设置中的 HER 头像，最后才显示 Dream 默认占位头像。
- 状态机：初始获取 `/dream/state` → 若已在 DREAM_ACTIVE 直接进入 active；否则展示「进入梦境」按钮 → POST `/dream/enter` → active 模式。
- 消息 buffer 为 append-only，不读历史 log，不接 WebSocket。
- `/dream/chat` 返回 `exit_accepted` 或 `force_exited` 时，禁用输入框，刷新状态，进入 ended 阶段。
- 409 / 503 做可见错误提示，不 crash。
- WAKE 按钮 / ESC：调用 `/dream/exit`，然后关闭窗口并触发 `DreamAfterglowBanner`（位于 `components/DreamAfterglowBanner.tsx`）。
- Dream Ribbon 顶部聊天图标是固定选中的装饰入口，以短分隔线与功能区隔开；动向 / 状态 / 潜意识打开左侧副栏，其中潜意识挂载只读 hidden state 面板；偏好 / 帮助打开居中 modal，交互层级与 Chat 的偏好 / 帮助窗口一致。
- Dream 动向 Sidebar 的「梦境流动」区域读取 `/dream/state` 的 `flow_entries: {ts, kind, summary}[]`（后端规则驱动生成，零额外 LLM 调用，见 backend Brief 25 §2）；最多展示 5 条、最新在上，带 `formatAgo` 风格相对时间。旧后端未提供或本轮梦境刚开始（`flow_entries` 为空）时从当前 dream state 派生 3 条短文案兜底，不读取或展示 chat transcript。
- Dream 状态 Sidebar 读取 `/dream/state` 的 Dream HUD v1.1 字段，以状态 pill 和 0-100 进度条展示；情绪 pill 按边界 / 亲密 / 执念方向做轻量视觉区分，未知标签保持原样显示。缺失数字显示 `—` 且条宽为 0。Dream 未激活时显示空态。`physiological_arousal` 默认隐藏，仅当 `/dream/settings` 返回 `display.physiological_arousal === true` 时展示。
- Dream 偏好窗口使用顶部横栏分类：当前状态、梦境上下文、系统设置、世界、其他。当前状态只读汇总可信快照；梦境上下文承接记忆读取、感知边界、清明模式和独立 lorebook 开关；系统设置提供聊天字号、主题字号、动态字体包、RGB 自定义配色、日间 / 夜间 Dream 聊天背景分别导入裁切、背景模糊度，以及控制 `display.physiological_arousal` 的开发者模式开关；世界页提供六个 `world_layer` 世界卡和 Dream 独立 `jailbreak_preset` 选择；其他暂留导入占位。Dream 后端偏好通过 `/dream/settings` 读取和保存，请求 5 秒超时；读取失败时显示默认值和重试入口，避免设置页永久停在载入态。梦境进行中修改时明确提示下次入梦生效；外观设置本地即时生效。
- Sidebar 状态卡与消息气泡分别通过 `DreamGlowPanel` / `DreamGlowBubble` 统一玻璃底、冷色亮边、内外辉光和可选顶部扫光；视觉参数集中在 `features/dream/DreamTokens.css`。
- 仅复用 `features/dream/DreamTokens.css` 的视觉 token。

共享 API 层：

- `src/shared/api/dream.ts`：`dreamGetState / dreamEnter / dreamChat / dreamExit / dreamUpdateSettings`
  等均使用 Tauri `invoke()`；Rust 侧 HTTP bridge 负责 Bearer 鉴权与 `reqwest.no_proxy()`。
- `src/shared/api/dream-types.ts`：`DreamStatus / DreamState / DreamMessage / DreamChatResponse` 等

---

## features/dream（视觉 token 库，已停止扩展）

文件：`src/features/dream/`

当前状态：**只保留视觉 token 和 Ribbon 入口按钮，不再接受新组件**。

- `DreamTokens.css`：梦境 CSS 变量（`--dt-*`）和动画关键帧，由 `DreamWindow.tsx` import。
- `DreamEntryButton`：Ribbon 里的月亮入口按钮，仍在使用。
- `README.md`：标注此目录已 deprecated，禁止在此添加新状态逻辑。

已清理：
- `DreamTheme`（原 mock preview overlay）和 `DreamMessage`（原 mock 消息组件）已删除。
- `DreamAfterglowBanner` 已迁移至 `src/windows/dream/components/DreamAfterglowBanner.tsx`。

**不要** 把新的 Dream 功能加在 `features/dream/` 里，改 `windows/dream/` 和 `shared/api/dream*`。

---

## ToyWindow（玩耍模式）

文件：`src/windows/toy/`

```
src/windows/toy/
├── ToyWindow.tsx            Ribbon + 侧栏 + 聊天页布局；fixed overlay，z-index 110
├── index.ts
└── components/
    ├── ToyRibbon.tsx        返回对话 / 玩耍标识 / 日夜主题切换
    ├── ToySidebar.tsx       两块只读状态卡：系统状态（Intiface/蓝牙连接 + 连接按钮）+ toy 状态（设备列表），6s 轮询 GET /hardware/devices
    └── ToyChatPanel.tsx     自包含 append-only 聊天，经 sendChat() 走 /desktop/chat
```

职责：

- 与 ActivityWindow 同级，由 `main.tsx` 的 `activeWindow` 状态切换挂载，不在 ChatWindow 组件树内；不读写 Chat messages / state / session。
- 入口受「玩耍模式」开关（`src/shared/playMode.ts`，localStorage `playMode.enabled`，默认关闭）门控：开启后 ChatWindow 订阅的 WS `toy_invite` 才自动开窗，Ribbon 才显示手动入口按钮。
- 硬件状态经 `src/shared/api/hardware.ts`（`getHardwareDevices` / `connectHardware`）调 Tauri `hardware_get_devices` / `hardware_connect` 代理后端 `/hardware/*`。`connected` 即 Intiface 蓝牙连接状态，`devices` 即 toy 列表。
- 设备控制（振动等）仍由后端 owner 门控工具在对话里触发，ToyWindow 只做状态显示与聊天。

---

## ActivityWindow（活动空间）

文件：`src/windows/activity/`

- `ActivityWindow.tsx` 是固定全屏 overlay（`z-index: 110`），由 `main.tsx` 的 `activeWindow`
  在 ChatWindow 仍挂载时切换显示；关闭后回到聊天，不拥有或改写聊天 session / StateEngine。
- `ActivityRibbon` 负责首页、阅读、五子棋、国际象棋、梦种和偏好入口；`ReadingPage`、`GomokuPage`、
  `ChessPage`、`DreamSeedPanel` 分别持有各自页面会话，`ActivityCompanionPanel` 承接活动内陪聊。
- 所有活动请求集中在 `src/shared/api/activity-api.ts`，通过 Tauri `invoke` 转给 Rust；Rust 侧以
  Bearer token + `no_proxy()` 调后端 `/activity/reading/*`、`/activity/gomoku/*`、
  `/activity/chess/*`、`/activity/dream_seed/*`。阅读书库和上传同属该 bridge。
- 活动陪聊返回值由页面局部消费；若后端主动推送，页面通过 `activity-companion-push` 事件更新，
  不借用 ChatPanel 的消息数组。

## RoomWindow（视频通话房间）

文件：`src/windows/room/`，共享配置与资源接口在 `src/shared/room/`。

- `RoomWindow.tsx` 与 Activity/Toy 同级，是主 view 内的全屏 overlay；顶栏、输入栏、VN 气泡、
  语音输入和挂断控制由窗口层统一编排。
- `roomSettings.renderMode` 选择互斥的 `ThreeCallStage`（GLB、场景、摆放和自由视角）或
  `Live2DCallStage`；`useVnPresenter` / `turnIngest.ts` 订阅既有 `wsClient` 的流式和最终消息，
  `avatarDirective.ts` 将角色动作指令分发给两种舞台。
- 用户输入仍调用共享 `sendChat()` → Tauri `send_chat` → `POST /desktop/chat`；房间不另建会话协议。
  mood 从主窗口广播的 `pet://snapshot` 读取，当前角色名/房间设置经共享偏好跨窗口同步。
- 资源浏览请求由 `roomAssets.ts` 调 Tauri `list_room_assets` / `list_room_props`，读取打包或开发期
  `public/room/` 资源；它们不是后端 HTTP 接口。

## DiaryDetailWindow（日记详情）

文件：`src/windows/diary-detail/DiaryDetailWindow.tsx`，内容组件复用
`src/windows/chat/components/SubDiary.tsx` 的 `DiaryDetailPane`。

- 聊天侧栏的日记列表先以 `loadDiaryList(charId)` 读取轻量条目；点击后用唯一的
  `diary-detail-<char>-<date>` label 创建或聚焦独立 `WebviewWindow`，携带
  `?window=diary-detail&date=…&char=…`。详情窗口只显示这一篇内容并自行初始化主题。
- `DiaryDetailPane` 通过 `loadDiaryEntry(date, charId)` 懒加载正文；两个函数均在
  `src/shared/api/backend.ts`，经 Tauri `load_diary_list` / `load_diary_entry` 调后端
  `GET /diary/list` 与 `GET /diary/{date}`，使用 Bearer token 和 `reqwest.no_proxy()`。
- 日记为只读展示：窗口不写入日记、不轮询，也不把内容放进 StateEngine。

---

## ChatPanel

文件：`src/windows/chat/components/ChatPanel.tsx`

职责：

- 按日文件懒加载历史对话（Phase 2c+），启动拉今日，不足 10 条兜底一次昨日。
- `/chat-log` entry 的 `ts` 用作秒级时间和 wake `last_seen` 游标，`turn_id` 用于历史回放与 WS 去重；旧响应缺字段时兼容 `time: HH:MM`。
- assistant-only trigger entry 的 `user` 为空字符串，仍正常渲染 assistant 气泡。
- 滚到顶时懒加载更早一天，保持滚动位置不跳。
- 用户发送时调用 `sendChat()`。
- 订阅 WS `channel_message` / `message_segments`，优先按 assistant `msg_id` 与 HTTP 回复对账；content hash 只作为旧后端或异常路径 fallback。
- `message_segments` 只更新同 `msg_id` 的既有气泡，不单独追加消息；提前到达时暂存，使用 5 分钟 TTL 和 50 条上限。
- WS `msg_id` 到本地消息 id 的映射只保留最近 200 条，避免长会话无限增长。
- 根据 engine mood/activity/presence 渲染 header 标签、头像呼吸和 typing 指示。

当前消息来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 启动历史 | `loadChatLogDates()` + `loadChatLogDay(date)` → Tauri `load_chat_log_dates` / `load_chat_log_day` | 按日文件从后端 `/chat-log/*` 读取 |
| 用户发送 | `sendChat()` → Tauri `send_chat` | 当前走 HTTP `/desktop/chat` |

**与 `/memory/{uid}/short-term` 的关系**：`loadHistory()` 客户端函数仍保留，`/memory/{uid}/short-term` 后端接口也未删除，但 ChatPanel 启动逻辑不再调用它。后续 mood 推断等模块如有需要仍可使用。

**日期处理**：所有日期加减使用 `date-fns`（`format` / `subDays` / `parseISO`），不手算 month/day。

**按日懒加载状态**（均用 ref 避免闭包陷阱）：

| ref | 说明 |
|---|---|
| `availableDatesRef` | 后端返回的全部可用日期（倒序） |
| `loadedDatesRef` | 已加载到前端的日期列表（从早到晚） |
| `isLoadingMoreRef` | 防重复触发 |
| `noMoreHistoryRef` | 到头后停止触发 |
| 主动推送 | `wsClient.on("channel_message")` | legacy WS 消息 |

注意：

- `send()` 顶部注释仍写着“TODO WebSocket”，但实际已经接了 HTTP 后端。
- v1 目标协议要求用户消息走 WS `user_message`，当前未实现。

## PetWindow

文件：`src/windows/pet/`

- `PetWindow.tsx`：独立透明置顶窗口入口，订阅 Chat 广播的 `PetSnapshot`（mood/presence/thinking，
  不含文案），保留左键拖拽；底部自带输入框，回车 `sendChat()`（Tauri command，任意窗口可用）。
- `components/ParticleCanvas.tsx`：三种粒子视觉风格（流体光球 fluid / 散点粒子 scatter / 神经网络 network），
  均响应情绪配色 lerp 与 shy/nuzzle 视觉脉冲；通过 `styleRef` 订阅 `petVisualStyle` 设置实时切换。
- `components/Model3DStage.tsx` / `components/Live2DStage.tsx`：3D/Live2D 桌宠渲染，缩放时保持模型头顶
  在视口中的投影位置不变（不会放大后头出框）；开口动画由 `pet://turn` 驱动，不再读快照文案字段。
- `usePetMouse.ts`：轮询 Tauri `cursorPosition()`，读取窗口位置、尺寸和显示器 work area，
  实现边界内的缓动躲避/靠近；Ctrl 钉住与拖拽期间停止自动移动。
- `src/shared/pet/mouseSettings.ts`：持久化全局鼠标交互开关与随机靠近间隔。
- `src/shared/pet/petVisualStyle.ts`：持久化粒子风格（`'fluid' | 'scatter' | 'network'`，默认 `network`），localStorage + CustomEvent 双通道。

当前只读状态映射：`惊讶` mood 触发害羞躲避。该映射不修改 StateEngine，也不新增另一份
mood 真值。Chat 偏好 “3 · 桌宠” 页可切换粒子风格、关闭全部鼠标自动交互并调整随机靠近间隔。

### 主窗口 ↔ 桌宠窗口的 Tauri 事件（`src/shared/pet/bridge.ts`）

后端 WS 是单连接（新连接顶替旧连接），桌宠窗**不能**自己连 WS，否则会把主窗口踢下线；
所有跨窗通道都走「主窗口转发」，桌宠窗只 `listen`，不直接碰 `wsClient`：

| 事件 | 方向 | 载荷 | 说明 |
|---|---|---|---|
| `pet://snapshot` | Chat → Pet | `PetSnapshot`（mood/presence/thinking/updatedAt） | 状态快照，不含话语文案 |
| `pet://ready` | Pet → Chat | 无 | 桌宠窗挂载后请求一次当前快照 |
| `pet://prefs` | Chat → Pet | `{ model3dZoom?, live2dZoom? }` | Chat 侧缩放滑杆变化时广播，`Model3DStage`/`Live2DStage` 实时应用；跨窗 storage 事件在 WebView2 下不可靠，不能只靠 localStorage + `storage` 事件 |
| `pet://turn` | Chat → Pet | `PetTurnEvent`（`channel_message` \| `message_segments` \| `message_stream_start\|delta\|end` 判别联合） | `ChatWindow.tsx` 顶层原样转发 `wsClient` 对应事件的全文，不摘要、不经过 `ChatPanel` 的去重/梦境门控；桌宠气泡与开口动画消费它，第一版只处理 `channel_message` |

边界：主窗口关闭则桌宠也收不到转发（pet 由主窗口 spawn，可接受）。

## PresenceNagWindow

文件：`src/windows/presence-nag/`

- 单实例透明置顶窗口，通过 Tauri event `presence-nag` 接收 `{ text, avatar }` 并更新内容。
- Chat 偏好 “3 · 桌宠” 页的「允许存在感弹窗」使用本地 UI 偏好，默认关闭；`ws.ts` 每次 action 到达时读取该值。
- 启用时 `case 'presence_nag'` 调同名 Tauri command `presence_nag`；重复 action 不创建新窗口。
- `Esc` 和所有关闭入口统一调用 `presence_nag_close_all`。关闭设置时也立即全关。
- 视觉明确使用角色头像和梦核配色，不仿冒原生系统对话框。

---

## SubFlow

文件：`src/windows/chat/components/SubFlow.tsx`

职责：

- 在 Sidebar 的 `flow` tab 中展示叶瑄此刻的动向（Live Feed）。
- 不直接请求后端；读取并订阅 StateEngine。Sidebar 挂载的共享 `useBackendStatePolling()` 在 flow tab 使用 mood 60s / activity 90s 周期。
- 从 engine `activity / focus / presence` 派生叙事文本（`buildNarrative`），不发起新网络请求。
- 维护组件内 ring buffer（最多 10 条），追踪 activity/focus 变化历史。

`buildNarrative(activity, focus, presence)` 模板（优先级从高到低）：

| 条件 | 输出 |
|---|---|
| `presence === 'away'` | `他不在。` |
| `activity.id === 'watching_you'` | `他坐在那儿，看着你。` |
| 通用 | `{activityPhrase}{focusPhrase}{idleTrailing}` |

- `activityPhrase`：`他{activity.text}`（`{book}` 占位符替换为 `读着书`）；activity 为 null 时用 `他坐在那儿`
- `focusPhrase`：7 个固定映射，均以 `，` 开头、`。` 结尾；无匹配时降级为 `。`
- `idleTrailing`：`presence === 'idle'` 时追加 `（他安静了一会儿。）`

Timeline：`localStorage`（key `subflow_timeline`）持久化，8 小时窗口内的条目全部保留；去重按持久化首条 `timeline[0].text` 比对（不含 mood——同文案不同心情不再刷新条目），而非 render-scoped 的 ref，天然抗组件重挂（切 Sidebar tab 等）触发的误插入；显示文本 = `activity.text`，activity 为 null 时用 `state.focus` 中文名兜底；30s 定时器驱动时间标签重渲染。

数据源：

| 来源 | 路径 | 轮询 |
|---|---|---|
| mood | `useBackendStatePolling()` → `engine.applyBackendState('mood-poll', {mood})` | 60s |
| activity | `useBackendStatePolling()` → `engine.applyBackendState('activity-poll', {activity})` | 90s |
| focus / presence | engine 现有值（由 ChatPanel 交互驱动） | — |

---

## SubStatus

文件：`src/windows/chat/components/SubStatus.tsx`

职责：

- 在 Sidebar 的 `status` tab 展示叶瑄持续状态信号。
- 读取并订阅 StateEngine；Sidebar 共享 poller 负责 mood/activity 请求、写入和错误重试。
- 从 engine state 派生 4 个可感知信号（前端 derived，不进 engine state）。
- 维护 60 格 ring buffer，2 秒采样一次，呈现近 2 分钟 mood 轨迹。

数据源：

| 来源 | 路径 | 轮询 |
|---|---|---|
| mood 后端持久值 | `useBackendStatePolling()` → `/mood/state` → `engine.applyBackendState('mood-poll', {mood})` | 30s |
| activity 身体动作 | `useBackendStatePolling()` → `/activity/current` → `engine.applyBackendState('activity-poll', {activity})` | 60s |
| sensor 实时快照 | `loadSensorRealtime()` → `/sensor/realtime` → 真实键鼠/焦点数据 | 10s |
| presence | engine 现有值（默认 active）；sensor 可用时仅参与 4 个信号派生，不写入 engine | — |
| focus | ChatPanel 输入驱动，SubStatus 不动 | — |

持续可感知信号公式（均为前端 derived，0-100）：

| 信号 | 来源 | CSS transition |
|---|---|---|
| 呼吸频率 `breath` | sensor 可用时按键击/秒与 sensor presence 派生；不可用时回退 mood/presence 偏移 | 2s ease |
| 视线锁定度 `gaze_lock` | sensor 可用时按 stale_seconds 与 switch_count 派生；不可用时回退 focus 映射 | 0.1s ease |
| 情绪光晕 `mood_aura` | 按 mood 映射固定值（平静→20…病娇→90） | 3s ease |
| 节奏不规则 `rhythm` | sensor 可用时按键鼠比例偏离 + mood 基线 + spike 派生；不可用时回退原 mood 基准 + spike | 0.5s ease |

Ring buffer：`useState<{mood, aura}[]>` 长度 60；2s 采样；mood 轨迹柱状图，每格高度 = aura %，颜色 = MOOD_HUE。

后端连接失败：顶部显示小型警告条 + 重试按钮，UI 继续显示 engine 当前值，不 crash。

## SubGarden

文件：`src/windows/chat/components/SubGarden.tsx`

职责：

- 在 Sidebar 的 `garden` tab 中展示陪伴花园。
- 调用 `loadGardenState()` 读取后端 `/garden/state`。
- 每 30 秒轮询一次。
- 展示五个情绪花槽、花名、英文名、阶段、阶段进度条和 bloom 标签。

当前数据来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 花园状态 | `loadGardenState()` → Tauri `load_garden_state` | 从后端 `/garden/state` 读取 |

当前边界：

- 只读展示，没有手动浇水、采收、送花、花瓶详情。
- 错误时显示错误文本和重试按钮。
- `harvest_count` / `vase_count` 已在类型里，但 UI 暂未展示详情列表。

---

## SubHiddenStatePanel

文件：`src/windows/dream/components/SubHiddenStatePanel.tsx`

职责：

- 在 Dream Sidebar 的 `subconscious` tab 中展示「潜意识」状态，沉浸化呈现（cc-tasks/15 §F）：不接
  `dreamState` 就只显示占位文案「还未进入梦境」（复用 `.dream-hud__empty`），不请求也不渲染数据；
  `isDreamActive()`（`DreamStatusSidebar.tsx` 导出）判定入梦与否。
- 入梦后挂载时只调用 `loadHiddenStateDebug()`；前端不直接调用 hidden state 写入、integrator、save 或 mutate API。
- 常态展示 `embodied_ease`（身体放松度）、`body_memory`（身体记忆线索）、`dream_snapshot`（梦境读取到的状态）。
  不再显示来源 badge、prev/curr 数值对比行、诊断行、`READ ONLY` 标签——去掉这些系统味文案，只保留
  `HudMeter` 自带的 delta 箭头。
- `body_memory` 为空时显示「暂无身体记忆线索」，不按错误处理。
- `sensitivity.current` / `sensitivity.baseline`、`touch_need.deficit` / `touch_need.baseline` 等开发者
  信息仅在返回的 `display.physiological_arousal === true` 时展示（这个标记由 Tauri
  `load_hidden_state_debug` 只读参考 `/dream/settings` 合并）；`schema_version`/`last_decay_tick` 的
  「开发者信息」卡片已整体移除，开发者模式下只剩「即时敏感」「触碰亏缺」两张数值卡。

当前数据来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 潜意识状态 | `loadHiddenStateDebug()` → Tauri `load_hidden_state_debug` | 从后端 `/debug/user-hidden-state` 读取；只读 |
| 开发者字段显隐 | `load_hidden_state_debug` 内部 GET `/dream/settings` | 只读读取 `display.physiological_arousal`，不新增写接口 |

当前边界：

- Phase 4.5 UI 已从 debug-only 入口提升为单用户状态面板。
- 面板没有编辑按钮、滑块、保存、reset 或 JSON 修改能力。
- hidden state 只显示在 UI，不进入 Reality prompt、Dream prompt、memory 或 afterglow soft hint。

---

## SubDiary

文件：`src/windows/chat/components/SubDiary.tsx`

职责：

- 在 Sidebar 的 `diary` tab 中展示各角色写的日记。
- 挂载时调用 `getPromptAssets()` 拉角色列表，默认选中 active 角色。
- 顶部角色分类栏：以 `getPromptAssets()` 返回的 characters 为 tab，显示名取 `label`（fallback `id`）；切换角色时重新拉该角色的日记列表。
- 列表调用 `loadDiaryList(charId)` 读取轻量列表（date / title / emotion），不预拉正文。
- 时间线滚动，最新在前，每条显示完整日期 + title + em dash 占位；emotion 非 null 时渲染标签。
- 点击 entry 时懒加载正文：调 `loadDiaryEntry(date, charId)` 并通过 `panesApi.openPane()` 打开浮动详情窗，pane id 带 charId 避免串角色。
- 详情窗正文做最简渲染：`\n\n` 切段落 → `<p>`，段内 `\n` → `<br/>`，行首 `## ` → `<h3>`，其他 markdown 原样。
- 顶部有刷新按钮；错误时显示错误文本 + 重试按钮；空状态显示"他还没开始写日记。"
- 不轮询；emotion 字段后端当前恒为 null，遇 null 不渲染标签（标签行为保留以备后端填充）。

当前数据来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 角色列表 | `getPromptAssets()` → Tauri `get_prompt_assets` | 从后端 `/settings/prompt-assets` 读取 |
| 日记列表 | `loadDiaryList(charId?)` → Tauri `load_diary_list` | 从后端 `/diary/list?char_id=<v>` 读取 |
| 日记正文 | `loadDiaryEntry(date, charId?)` → Tauri `load_diary_entry` | 从后端 `/diary/{date}?char_id=<v>` 懒加载 |

---

## Ribbon

文件：`src/windows/chat/components/Ribbon.tsx`

职责：

- 左侧固定 52px 功能条。
- 切换 Sidebar tab：动向、日记、状态、花园。
- 切换本地 `petVisible`。
- 通过与其他 Ribbon 图标同色的空心圆入口打开 Dream overlay。
- 打开偏好和帮助面板。
- 显示 WS 连接状态角标。

WS 连接状态来自 `wsClient.getState()` 和 `wsClient.on("state")`。

---

## Sidebar

文件：`src/windows/chat/components/Sidebar.tsx`

所有五个 tab 已接入真实数据：

- `flow`：动向，挂 `SubFlow`，从 engine 读 mood/activity/focus/presence
- `diary`：他的日记，读取后端日记列表和正文
- `status`：状态，挂 `SubStatus`，读取 engine 并显示共享 poller 的 mood/activity 错误与重试
- `garden`：陪伴花园，读取后端花园状态

成长、视觉、支出、群聊仲裁和记忆摘要五类运行观测已迁入 PresenceKit 后端自带管理面板的“观测”分类；
桌面聊天侧栏不再承载运维诊断入口。


---

## Panes

文件：`src/windows/chat/components/Panes.tsx`

提供模块级单例 `panesApi` 和 `PaneHost`：

- `openPane()`
- `closePane()`
- `bringToFront()`
- `updatePane()`
- `subscribe()`

当前主界面挂了 `PaneHost`，但运行中的功能入口很少。未来可用于日记详情、花园详情、调试面板等浮动窗口。

---

## UIKit

文件：`src/windows/chat/components/UIKit.tsx`

包含共享视觉小组件和图标：

- `Tag`
- `Card`
- `MicroLabel`
- `HRule`
- `Numeric`
- `Icon`
- `Btn`
- `Meter`
- `Body`

它还定义 UI 层的 mood/activity 英文标签和 mood hue 映射。注意这些映射是视觉层数据，后端情绪名不一定一一对应。

---

## StateEngine

文件：`src/shared/state/store.ts`

当前 engine 是轻量前端状态机：

- 保存 mood / focus / presence / mode / activity。
- 提供 subscribe/emit/get，以及按 ownership 区分的写入入口。
- `src/shared/state/useBackendStatePolling.ts` 是 mood/activity 后端轮询的单一入口；ChatWindow 常驻低频轮询（120s/180s），Sidebar 按 flow/status tab 叠加原有高频周期。
- 后端轮询统一走 `applyBackendState(source, patch)`；`state-update` source 已保留，但尚未接入 WS `state_update`。
- 本地 focus 推断统一走 `setLocalFocus()`；mode 与交互时间分别走 `setMode()` / `markInteraction()`。
- focus 有 duration 时会自动回到默认 focus。

字段说明：

| 字段 | ownership | 说明 |
|---|---|---|
| `mood` | backend-polled | 情绪，对应 MOOD_TABLE 视觉参数 |
| `activity` | backend-polled | 后端身体动作（来自 activity_manager） |
| `focus` | local-derived | ChatPanel 输入、发送与临时 focus 回落 |
| `presence` | local-derived | 当前由本地交互恢复 active；sensor 快照尚不写入 engine |
| `mode` / `lastInteraction` | local-derived | 本地窗口模式与交互时间 |
| `wantToSpeak` / `behaviorId` / `behaviorEndsAt` / `bodyTiltOverride` | backend-pushed | 为未来后端推送保留；当前没有 WS `state_update` 写入 |

`MOODS` 已扩展为 7 个：`['平静', '开心', '低落', '病娇', '分心', '生气', '惊讶']`。

`FOCUS_TABLE`（原 `ACTIVITY_TABLE`）仍保持 7 条注意力指向配置，与后端 16 条身体动作无关。

旧原型的 behavior loop 已删除。不要在组件里重新造一套行为状态；未来接后端 `state_update` 时应调用 `engine.applyBackendState('state-update', patch)`。

情绪映射：`src/shared/state/mood-mapping.ts` 提供 `backendMoodToFrontend(token)` 将后端英文 token 转换为前端 7 个中文 Mood 之一。

---

## AvatarStore

文件：`src/shared/avatars/store.ts`

职责：

- 保存 HER/YOU 头像路径和 data URL。
- 分别保存日间 / 夜间 Dream 聊天背景路径和 data URL；背景与头像同样写入 `app_data_dir()/avatars/`，路径记录在同一个 `avatars.json`。旧版单字段 `dream_background` 读取时兼容为夜间背景。
- 控制 YOU 头像是否显示。
- 通过 Tauri command 读写本地文件。

Tauri 命令：

- `read_avatars_json`
- `write_avatars_json`
- `save_avatar`
- `load_avatar`

## DreamAppearance

文件：`src/shared/dreamAppearance.ts`

职责：

- 使用 `localStorage` 保存 Dream 聊天字号、主题字号、所选字体包、RGB 自定义配色和背景模糊度。
- 调 Tauri `list_dream_fonts` 动态扫描字体资源：packaged 优先 `resource_dir/fonts`，debug/dev 回退源码 `public/fonts/`；支持 `ttf / otf / woff / woff2`。
- DreamWindow 通过 `FontFace` 加载所选字体，并只在 Dream 根节点覆盖字体变量。
- 日间 / 夜间导入背景按当前 tone 分别渲染在 `.dream-theme__chat` 内；模糊度控制该背景图层，不影响 Ribbon 和 Sidebar。日间使用浅色 overlay，夜间使用深色 overlay。

本地路径在 Tauri `app_data_dir()` 下。

---

## ChatAppearance

文件：`src/shared/chatAppearance.ts`

职责：

- 使用 `localStorage` 保存 Chat 聊天字号、主题字号和所选字体包；旧版 `chat.bubbleFontSize` 会作为首次读取时的字号迁移来源。
- 复用 Tauri `list_dream_fonts` 扫描字体资源：packaged 优先 `resource_dir/fonts`，debug/dev 回退源码 `public/fonts/`；支持 `ttf / otf / woff / woff2`。
- ChatWindow 通过 `FontFace` 加载所选字体，并只在 `.chat-ui` 主布局容器覆盖字体变量，不影响 Dream。
- 主题字号通过 `--chat-theme-font-scale` 应用于当前运行中的 Ribbon、Sidebar tabs 和 ChatPanel；聊天字号单独控制聊天气泡与输入框。

---

## Theme

主题系统位于 `src/shared/theme/`：

- `contract.ts` 是核心、游戏、字体和 Dream token 的单一契约来源。
- `builtinThemes.ts` 保存内置 `paper` / `dark` 数据。
- `loader.ts` 通过 `document.documentElement.style.setProperty()` 运行期注入主题。
- `registry.ts` 合并内置主题与 Tauri `list_themes` 扫描到的 `public/themes/*/theme.json`，校验必需 token、持久化 `chat.theme` 并通知订阅者。
- `ThemePicker.tsx` 由 Chat 和 Activity 偏好页共用。
- `globals.css` 只保留 paper FOUC 兜底和结构性样式。

所有窗口启动时由 `main.tsx` 调用 `initTheme()`；独立 Pet WebView 通过同一初始化和 localStorage `storage` 事件跟随切换。Dream token 可由主题选择性覆盖，`features/dream/DreamTokens.css` 继续提供默认值与 sRGB/OKLCH 渐进增强。

## Shared frontend helpers

- `src/shared/fontAppearance.ts`：Chat / Dream 共用字体扫描、family 和 URL helper；两套 appearance 配置结构保持独立。
- `src/shared/images/cropImageToBlob.ts`：AvatarCropper / DreamBackgroundCropper 共用 canvas 裁剪 helper；输出尺寸由调用方传入。
- `src/shared/ui/TypingDots.tsx` / `TypingDots.css`：Chat / Dream 共用输入中视觉组件；颜色由各自主题变量传入。
- `src/shared/i18n/`：桌面客户端本地化入口。`locales/zh-CN.ts` / `en-US.ts` 保存语义 key 资源，`useI18n()` 驱动 React 文案和语言切换；Chat 偏好「系统设置」第一行持久化语言选择。`legacy.ts` 与 DOM bridge 只兼容迁移前的既有硬编码文案，新增用户可见文案禁止写入兼容表，必须使用语义 key。

切换统一调用 `src/shared/theme/registry.ts` 的 `setTheme()`。

---

## 前端变更规则

- 新增真实后端数据时，协议和请求包装放进 `src/shared/api/`。
- mood/activity/presence 只通过 `StateEngine` 改。
- Sidebar 四个 tab 接数据时以当前 `Sidebar.tsx` 和各 `Sub*` 组件为准；旧视觉存档已删除，历史由 Git 保留。
- 桌宠迁入时不要把宠物状态复制成另一份 store；先设计聊天窗口和宠物窗口共享 engine 的方式。

---

## Dream 模式状态显示

文件：`src/windows/dream/components/DreamPrefsPane.tsx`

- 在 Dream 偏好窗口的“世界”页显示 Dream 模式选择和只读状态，不挂载到 Chat。
- “入梦模式”提供沙盒 / 剧本 / 镜像按钮；剧本模式额外填写 `script_id`。选择只影响下一次
  点击“进入梦境”时提交的参数，梦境进行中按钮和输入框禁用。
- Mirror 模式不显示 `script_id` 输入框；仅显示 v0.1 只读说明。
- 数据来自 `DreamWindow` 传入的 `dreamState`，复用 `useDreamState()` 对
  `GET /dream/state` 的既有刷新；不新增 WebSocket 或轮询体系。
- 仅当 `dreamState.dream_mode ?? dreamState.mode` 为 `scenario` 时显示 Scenario dev 分组；
  兼容后端返回 `scenario` 嵌套对象或平铺字段，字段缺失时显示 `—`。
- 仅当 mode 为 `mirror` 时显示 Mirror dev 分组；兼容 `mirror_core` 或 `mirror`，字段缺失时显示 `—`。
- `ending_state === "completed"` 显示“剧本已完成”，但不触发退出。
- 前端不推进 stage、不模拟 `satisfied_streak`、不写回 scenario progress，也不读取或计算 hidden state / Mirror bucket。


## 设置页运行时控制（2026-07-13）

系统设置沿用现有 PreferencesPanel，加入 ModelRoutingSettingsPage、DesktopTtsSettingsPage，并扩展 ToolLoopSettingsPage / ThinkingSettingsPage。助手非流式消息在桌面 TTS 开启时使用 VoiceMessageBar；语音按点击懒生成，可播放/暂停并展开文字。
