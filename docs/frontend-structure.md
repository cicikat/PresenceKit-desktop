# docs/frontend-structure.md — 前端结构指南


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
存在感弹窗开关留在桌宠与互动，沿用原同步语义；裁剪层高于统一偏好，避免头像/背景裁剪被遮挡。
本次未改 Rust、WS、scope、ack、TTL、手机或 relay；后端能力真值仍由后端维护。

验收：相关 Vitest 40 项、TypeScript、生产构建通过；浏览器夹具实际挂载 React 页面，
覆盖角色切换、缺字段、失败重试、聚焦刷新、活动中打开偏好和阅读第 2 页保持。
`observe`：真实 Tauri 原生窗口与真实后端/手机设备联调未完成；夹具 IPC 不代表实机。


## 偏好 IA 与 ChatWindow controller（2026-07-30）

Chat 偏好仍是 modal；顶层分类为「常规、模型、能力与权限、界面、角色与对话、桌宠与互动、高级」。`preferencesInfoArchitecture.ts` 是供 tab bar 与纯逻辑测试使用的小型归类契约，不是动态设置 schema。

Activity 偏好只保留「外观」和「调试」。其日间 / 夜间主题继续以 `ThemePicker slot="day"` / `slot="night"` 复用 Chat 的全局 theme registry。`ComputerOperationSafetySettings` 位于 Chat「能力与权限」，保留 `get_meta_mode` / `patch_meta_mode`。`ChatWindow` 将外观、桌宠和导航状态分别委托给 `src/windows/chat/hooks/` 下的三个 controller hook。

本文档描述 `src/` 内当前 React/Tauri 前端实现。它记录的是实际代码状态，不是目标方案。

---

## 入口

`src/main.tsx` 做四件事：

1. 引入全局样式 `src/shared/theme/globals.css`。
2. `await initUIPrefs()`——渲染前必须等待，见下方「uiPreferences」。
3. 调用 `initTheme()`（不等待）应用当前主题，随后调用 `avatarStore.init()` 读取本地头像配置。
4. 默认渲染 `<ChatWindow />`；主 view 内按本地状态叠加 Activity / Toy / Room，独立 Webview
   则按 query 参数渲染 Pet / PresenceNag / DiaryDetail / DesignSatellite。

入口按 query 参数选择 view：默认渲染聊天窗口，`?window=pet` 渲染独立 `PetWindow`，
`?window=presence-nag` 渲染独立、默认隐藏的 `PresenceNagWindow`，`?window=diary-detail` 渲染
独立的 `DiaryDetailWindow`，`?window=design-satellite` 渲染不挂载 Chat 树的 `DesignSatelliteWindow`。
这些 view 共用同一个 bundle/入口，不是各自独立的 HTML 页面。

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

相关组件：

```text
src/windows/chat/
├── ChatWindow.tsx                     # 应用级编排状态与聊天布局壳
└── components/
    ├── ChatShellAtoms.tsx             # Sidebar 分隔条与视频背景壳组件
    └── preferences/                   # 偏好浮层及其内嵌设置组件
        ├── PreferencesPanel.tsx       # 八个偏好 tab 的浮层本体
        ├── PromptAssetsSettings.tsx   # 世界页 Reality Prompt Assets 与条目管理
        ├── ChatSettingsSection.tsx    # 对话模式、风格和分条设置
        └── PrefAtoms.tsx              # 偏好页共用行、开关、滑杆和样式常量
```

职责：

- 创建并持有单个 `StateEngine`。
- 创建并持有 `ToolStatusOverlayController`：订阅 WS `tool_status`，只向 Sidebar NOW 传递内存瞬态覆盖值，不改写 `StateEngine` 或本地偏好。
- 管理 UI 状态：主题、侧栏开关、侧栏 tab、侧栏宽度、可信设计 Mod、帮助面板、偏好面板、桌宠开关。侧栏 tab 使用 `chat.sidebarTab` 全局持久化；开关使用 `chat.sidebarOpen.<layoutId>` 按布局持久化，尚无用户偏好时才回退布局 manifest 的默认显隐；设计 Mod 使用 `chat.designMod`。
- 管理 Dream UI v2 preview 的本地状态：Ribbon 入口打开 overlay，Esc / WAKE 关闭并显示 afterglow。
- 订阅 WS `dream_invite` UI 事件；收到角色邀请时清除 afterglow 并打开 Dream overlay。
- 布局三列：Ribbon、Sidebar、ChatPanel。
- ActivityWindow 由 `src/main.tsx` 作为 overlay 覆盖；Activity 打开期间 ChatWindow / ChatPanel 保持挂载，WS 订阅不中断。
- 负责偏好面板内的头像上传/裁剪入口。
- 世界页角色卡头像同样复用 `AvatarCropper`，选择 PNG / JPEG / WebP 后先裁剪为 256 × 256 PNG，再通过角色头像后端接口上传。
- Chat 偏好浮层使用顶部横栏分类：常规、模型、能力与权限、界面、角色与对话、桌宠与互动、高级。`OutputSegmentEnforceSettingsPage` 位于模型分类，通过 Tauri IPC 热切换生成后段落兜底，只展示开关和有效阈值，不展示 Prompt 检视数据；`VisualPerceptionSettingsPage` 位于能力与权限，是本地 opt-in 与采样间隔控制面，展示最近结果、推送时间和失败计数。界面提供主题、信息栏、布局预览器、聊天字号、主题字号、动态字体包、背景、颜色和头像设置。角色与对话通过 `PromptAssetsSettings` 读取和保存 Reality Prompt Assets，提供角色卡单选、Reality 世界书多选和 Reality 破限多选；桌宠与互动承载视频通话和 Coplay。
- `LayoutHost` 读取 `src/shared/layout/registry.ts` 的当前 manifest，排布 `ribbon`、`sidebar`、`main` 三个既有 slot：方向、顺序、Ribbon/Sidebar 宽度与 Sidebar 默认显隐均由声明式布局决定；slot 内组件仍由 ChatWindow 创建。Host 根、default shell、LayoutHost、slot 和 ChatPanel 子项都保持 `height: 100%`、`min-height: 0`、`min-width: 0`，避免异步历史内容触发 flex/grid auto minimum size 把底部控件推出 viewport。V2 `mainLayout` 只重排 ChatPanel 内稳定的标题、消息流、输入框区域（`stack` / `workbench` / `hud`），窄于 760px 自动回退纵向 `stack`，不会重挂载 ChatPanel。磁盘布局由 Tauri `list_layouts` / `read_layout_css` 提供，debug 只读 `public/layouts/`，release 只读 `resource_dir/layouts/`；列表和 CSS 使用同一资源根。ChatPanel 为主题 CSS 暴露只读装饰锚点 `data-chat-region="header|transcript|composer"` 和 `data-main-layout`；它们不能改变区域组件或 Grid 结构。`DesignModHost` 在同一个 Chat 编排根旁提供可信 ESM 的 underlay/components/overlay viewport；ChatPanel 只把三块渲染出口 portal 到 Mod 容器，消息、输入、WS/history/TTS 状态仍是一份。Ribbon 的非关键功能区可滚动，偏好/帮助/日夜切换保留在固定 footer；宿主 system overlay 另保留偏好和管理面板入口，builtin-default 恢复仍在偏好「界面」的 Design Mod 设置中。Sidebar 的 `SidebarCapability` 可同时挂载 flow/garden/diary/status 四个真实能力，默认无 Mod 时仍由 `SidebarPanel` 按当前 tab 呈现。背景层及 Dream、Pane、帮助、偏好、Yandere 等应用级 overlay 不属于 slot，继续由 ChatWindow 顶层管理。
- v2 Design Mod 可在同一包中声明 native Halo/Island。`DesignSatelliteBridge` 仅由主窗口调用 Rust `DesignSatelliteState` 的 ensure/update/visible/destroy commands；satellite 通过 ready/snapshot/command/ack 事件与主窗口通信，不能建立 WS/HTTP/第二份 StateEngine。卫星路由只读取同包 `mod.json`、surface entry/style，以透明 underlay/components/overlay 运行，并按 generation/sequence 丢弃旧快照。bridge 初始 hidden，ready 后首次 snapshot 与 visible/fps 会进入诊断；隐藏时停止 rAF，显示时幂等恢复。Rust 用物理屏幕 px、主窗口 owner 和 move/resize/scale 事件处理负坐标、多显示器与 DPI。`requires` 经 Rust 平台报告和前端能力矩阵评估，不满足时在选择器和 diagnostics 显示 unavailable/partial reason，不创建部分窗口。

关键状态：

| state | 说明 |
|---|---|
| `theme` | 当前主题 id；通过主题注册中心注入 token 并持久化到 `chat.theme` |
| `petVisible` | 控制独立 Tauri pet 窗口显隐，并同步 engine mode |
| `sidebarOpen` / `sidebarTab` | 控制左侧副栏；tab 以 `chat.sidebarTab` 持久化，开关以 `chat.sidebarOpen.<layoutId>` 按布局持久化 |
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
│   ├── DreamChatPanel.tsx   消息区 + 输入框（append-only；支持回放只读模式）
│   ├── DreamSidebar.tsx     status / emotional_tension / scene_state / symbolic_anchors / dream flow 摘要
│   ├── DreamReplaySidebar.tsx 归档列表、分页和选中态
│   ├── DreamReplayTranscript.tsx 主 Dream 区的只读回放详情与有界分批
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

- `DreamWindow` 是唯一接入后端 Dream API 的正式入口，由 `ChatWindow` 在 Ribbon 月亮按钮或 `GroupChatPanel`「入梦」触发后以 fixed overlay 形式渲染。`mode=single|group` 只切换数据源与退出策略，不复制 Dream UI 组件族。
- Dream 头像由 `ChatWindow` 将当前 Reality 激活角色卡头像传入 `DreamWindow`，再统一下发给控制栏、动向侧栏和消息区；角色卡没有头像时回退到外观设置中的 HER 头像，最后才显示 Dream 默认占位头像。
- 状态机：初始获取 `/dream/state` → 若已在 DREAM_ACTIVE 直接进入 active；否则展示「进入梦境」按钮 → POST `/dream/enter` → active 模式。
- 单人消息 buffer 为 append-only，不读历史 log；群梦模式额外消费 `domain=dream` 的 `group_round_*`、`message_stream_*`、`channel_message` / `message_segments`，按 `round_id` 与 `char_id` 关联伪流式回复。
- 群梦的轮次输入锁以 `group_round_end` 为主；若 WS 重连或漏帧，连接恢复时立即 GET `/group/{id}/dream/state` 校准，且在后端整轮 90 秒上限加 30 秒缓冲后再次校准。仅 `round_status=idle|failed|timed_out` 才释放输入；显式空轮显示「（无人接话）」。现实群聊没有轮状态接口，使用相同 120 秒阈值做可见的超时恢复。
- `/dream/chat` 返回 `exit_accepted` 或 `force_exited` 时，禁用输入框，刷新状态，进入 ended 阶段。
- 409 / 503 做可见错误提示，不 crash。
- WAKE 按钮 / ESC：调用 `/dream/exit`，然后关闭窗口并触发 `DreamAfterglowBanner`（位于 `components/DreamAfterglowBanner.tsx`）。
- Dream Ribbon 顶部聊天图标是固定选中的装饰入口，以短分隔线与功能区隔开；动向 / 状态 / 潜意识 / 梦境回放打开左侧副栏，其中潜意识挂载只读 hidden state 面板；偏好 / 帮助打开居中 modal，交互层级与 Chat 的偏好 / 帮助窗口一致。
- 梦境回放的归档列表留在 Dream Sidebar；选中场次后由 DreamWindow 将主聊天区切换为只读 DreamChatPanel，隐藏 WAKE、续留和输入，返回后恢复当前 Dream 内容。详情不进入 Dream WS、Reality Chat、StateEngine、TTS 或 pipeline；旧详情响应不会覆盖后续选择。
- Dream 动向 Sidebar 的「梦境流动」区域读取 `/dream/state` 的 `flow_entries: {ts, kind, summary}[]`（后端规则驱动生成，零额外 LLM 调用，见 backend Brief 25 §2）；最多展示 5 条、最新在上，带 `formatAgo` 风格相对时间。旧后端未提供或本轮梦境刚开始（`flow_entries` 为空）时从当前 dream state 派生 3 条短文案兜底，不读取或展示 chat transcript。
- Dream 状态 Sidebar 读取 `/dream/state` 的 Dream HUD v1.1 字段，以状态 pill 和 0-100 进度条展示；情绪 pill 按边界 / 亲密 / 执念方向做轻量视觉区分，未知标签保持原样显示。缺失数字显示 `—` 且条宽为 0。Dream 未激活时显示空态。`physiological_arousal` 默认隐藏，仅当 `/dream/settings` 返回 `display.physiological_arousal === true` 时展示。
- 群梦状态 Sidebar 读取 `roster` 与 `char_tension: Record<char_id, number>`，逐角色展示张力；`body` 仍是全群共享的一份状态。群梦偏好读写群 settings，世界列表来自 `/dream/worlds`、破限选项来自 `/dream/presets`，`per_char` 空数组表示跟随群默认；本地字号、主题与背景继续复用单人外观存储。
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

**与 `/memory/{uid}/short-term` 的关系**：Brief 72 删除了没有调用者的 `loadHistory()`
兼容函数和 Tauri bridge；ChatPanel 只使用 `/chat-log/*`，不会携带或配置用户 ID 来读取短期历史。

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
- 不直接请求后端；读取并订阅 `FlowPresenter`。共享状态 poller 由 `SidebarPresenters` 合并后台 owner 与可见能力的 cadence。
- 从 engine `activity / focus / presence` 派生叙事文本（`buildNarrative`），不发起新网络请求。
- 有 `ToolStatusOverlayController` 状态时，只在 NOW 原位替换叙事文本；同一状态原位更新，不进入 timeline 或 `uiPreferences`，多项调用每项至少展示 1 秒，完成后恢复 engine 派生动向。
- `FlowPresenter` 按激活角色维护 8 小时持久化 timeline；官方 renderer 只负责 NOW/timeline 视觉与子区域 portal。

`buildNarrative(activity, focus, presence)` 模板（优先级从高到低）：

| 条件 | 输出 |
|---|---|
| `presence === 'away'` | `他不在。` |
| `activity.id === 'watching_you'` | `他坐在那儿，看着你。` |
| 通用 | `{activityPhrase}{focusPhrase}{idleTrailing}` |

- `activityPhrase`：`他{activity.text}`（`{book}` 占位符替换为 `读着书`）；activity 为 null 时用 `他坐在那儿`
- `focusPhrase`：7 个固定映射，均以 `，` 开头、`。` 结尾；无匹配时降级为 `。`
- `idleTrailing`：`presence === 'idle'` 时追加 `（他安静了一会儿。）`

Timeline：`uiPreferences` 按激活角色分桶持久化（key `subflow_timeline:{charId}`），8 小时窗口内的条目全部保留；旧的全局 `subflow_timeline` 会在首次读取时一次性归入当时激活角色并删除。去重按持久化首条 `timeline[0].text` 比对（不含 mood——同文案不同心情不再刷新条目），而非 render-scoped 的 ref，天然抗组件重挂（切 Sidebar tab 等）触发的误插入；显示文本 = `activity.text`，activity 为 null 时用 `state.focus` 中文名兜底；30s 定时器驱动时间标签重渲染。

数据源：

| 来源 | 路径 | 轮询 |
|---|---|---|
| mood | `SidebarPresenters` shared poller → `engine.applyBackendState('mood-poll', {mood})` | 后台 120s；可见 presenter cadence 合并 |
| activity | `SidebarPresenters` shared poller → `engine.applyBackendState('activity-poll', {activity})` | 后台 180s；可见 presenter cadence 合并 |
| focus / presence | engine 现有值（由 ChatPanel 交互驱动） | — |

---

## SubStatus

文件：`src/windows/chat/components/SubStatus.tsx`

职责：

- 在 Sidebar 的 `status` tab 展示叶瑄持续状态信号。
- 读取 `StatusPresenter`；共享 poller 负责 mood/activity 请求、写入和错误重试，sensor 也由 presenter 统一管理。
- 从 engine state 派生 4 个可感知信号（前端 derived，不进 engine state）。
- presenter 维护 60 格、每 2 秒带 `sampledAt` 的 ring buffer，renderer 只呈现近 2 分钟 mood 轨迹。

数据源：

| 来源 | 路径 | 轮询 |
|---|---|---|
| mood 后端持久值 | `StatusPresenter` shared poller → `/mood/state` → `engine.applyBackendState('mood-poll', {mood})` | 共享 cadence |
| activity 身体动作 | `StatusPresenter` shared poller → `/activity/current` → `engine.applyBackendState('activity-poll', {activity})` | 共享 cadence |
| sensor 实时快照 | `StatusPresenter` → `loadSensorRealtime()` → `/sensor/realtime` → Rust 兼容归一化 → TypeScript 完整结构校验 | 10s |
| presence | engine 现有值（默认 active）；sensor 可用时仅参与 4 个信号派生，不写入 engine | — |
| focus | ChatPanel 输入驱动，SubStatus 不动 | — |

Status renderer ownership：`SubStatus` 通过三个 `DesignAwareRegion` 提供稳定子区边界。
`mood` 拥有 mood 卡和 `data-status-element` glow/indicator；`activity` 拥有 activity 与
presence 两张卡；`timeline` 拥有 telemetry 四条 signal bar 与近 2 分钟 mood 轨迹。根级
错误 / 重试条只归父 `chat.sidebar.status`，不是独立 primitive。`official-renderer` 挂父级，
`subregions` 挂三个子级，`presenter-only` 不挂官方 portal；注册表保证这三种 ownership
不会同时渲染。

`--status-*` 变量由 `statusRendererContract.ts` 从同一份 `StatusPresenter` snapshot
生成，并写入 root 及每个官方子区 mount。portal 脱离父 root 后不依赖 document/global CSS
继承；Mod 自绘必须从 `host.presenters.status` 读取 hue、aura、breath 等值。子区未 attach
时的官方 DOM 只存在于 active Mod 的 hidden fallback tree，fixture 会一次挂载三个 Status
子区，因此验收时 activity/timeline 不应残留在 hidden tree。
Host 只为实际 attach 了父级或子区 renderer 的 capability 创建 hidden source tree；
`presenter-only` 不创建官方 `SubStatus`，不会额外 acquire presenter 或启动 sensor/timeline timer。

持续可感知信号公式（均为前端 derived，0-100）：

| 信号 | 来源 | CSS transition |
|---|---|---|
| 呼吸频率 `breath` | sensor 可用时按键击/秒与 sensor presence 派生；不可用时回退 mood/presence 偏移 | 2s ease |
| 视线锁定度 `gaze_lock` | sensor 可用时按 stale_seconds 与 switch_count 派生；不可用时回退 focus 映射 | 0.1s ease |
| 情绪光晕 `mood_aura` | 按 mood 映射固定值（平静→20…病娇→90） | 3s ease |
| 节奏不规则 `rhythm` | sensor 可用时按键鼠比例偏离 + mood 基线 + spike 派生；不可用时回退原 mood 基准 + spike | 0.5s ease |

Ring buffer：`useState<{mood, aura}[]>` 长度 60；2s 采样；mood 轨迹柱状图，每格高度 = aura %，颜色 = MOOD_HUE。

后端连接失败：顶部显示小型警告条 + 重试按钮，UI 继续显示 engine 当前值，不 crash。sensor 的 `_no_data`、旧后端首启 `null` 字段和其他残缺 HTTP 200 响应均按“不可用”处理，回退 mood/presence 派生信号；activity 响应也先归一化，空 `arc` 不进入字符串方法调用。

## SubGarden

文件：`src/windows/chat/components/SubGarden.tsx`

职责：

- 在 Sidebar 的 `garden` tab 中展示陪伴花园。
- 调用 `loadGardenState()` 读取后端 `/garden/state`。
- 在渲染前校验 `slots` 必须为数组、每个槽位的字符串/数值字段完整；异常 HTTP 200 响应进入面板内错误态，不交给 React ErrorBoundary。
- `GardenPresenter` 在有 consumer 时每 30 秒刷新，组件只消费快照和 `refresh` 命令。
- 展示五个情绪花槽、花名、英文名、阶段、阶段进度条和 bloom 标签。

当前数据来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 花园状态 | `loadGardenState()` → Tauri `load_garden_state` | 从后端 `/garden/state` 读取 |

当前边界：

- 只读展示和刷新；浇水、采收、送花及其他写操作由角色内部工具或后端受控状态机处理。
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
- `DiaryPresenter` 在有 consumer 时拉 `getPromptAssets()` 和当前角色列表，默认选中 active 角色。
- 顶部角色分类栏：以 `getPromptAssets()` 返回的 characters 为 tab，显示名取 `label`（fallback `id`）；切换角色时重新拉该角色的日记列表。
- 列表调用 `loadDiaryList(charId)` 读取轻量列表（date / title / emotion），presenter 不预拉正文。
- 时间线滚动，最新在前，每条显示完整日期 + title + em dash 占位；emotion 非 null 时渲染标签。
- 点击 entry 时由 `DiaryPresenter.openEntry()` 打开当前角色独立 Tauri detail window；快照只保留 date/title/emotion/feeling 等元数据，不暴露本地路径。
- 详情窗正文做最简渲染：`\n\n` 切段落 → `<p>`，段内 `\n` → `<br/>`，行首 `## ` → `<h3>`，其他 markdown 原样。
- 顶部有刷新按钮；错误时显示错误文本 + 重试按钮；空状态显示"他还没开始写日记。"
- 不轮询；emotion 字段后端当前恒为 null，遇 null 不渲染标签（标签行为保留以备后端填充）。

当前数据来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 角色列表 | `getPromptAssets()` → Tauri `get_prompt_assets` | 从后端 `/settings/prompt-assets` 读取 |
| 日记列表 | `loadDiaryList(charId?)` → Tauri `load_diary_list` | 从后端 `/diary/list?char_id=<v>` 读取 |
| 日记正文 | `loadDiaryEntry(date, charId?)` → Tauri `load_diary_entry` | 从后端 `/diary/{date}?char_id=<v>` 懒加载 |

## Dream replay

文件：`src/windows/dream/components/DreamReplaySidebar.tsx`、`DreamReplayTranscript.tsx`

- Dream Sidebar 的回放 tab 通过 `dreamListArchive()` 分页读取安全元数据；当前活动梦不在 archive 范围内。
- 选中场次后，DreamWindow 调 `dreamGetArchive()` 并把主 Dream transcript 切换为只读 DreamChatPanel；回放消息复用正常 Dream 气泡、头像和滚动，不创建 Webview，也不在 Sidebar 展示正文。
- 详情只显示 `role/content/ts` 与安全元数据；长梦在前端按 80 条有界分批，支持继续加载，不提供输入、退出 Dream、续留、编辑、删除或继续梦境，也不触发 WS、StateEngine、TTS、逐字动画或 pipeline。
- `src/shared/api/dream-replay.ts` 只做响应归一化：旧 archive 缺字段时显示未知值，过滤 tool/未知角色和空内容，避免把 prompt、hidden state 或其他归档字段带入 UI。

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

四个 tab 已接入真实数据：

- `flow`：动向，挂 `SubFlow`，消费共享 `FlowPresenter` 的 mood/activity/focus/presence、tool overlay 与 8 小时角色时间线
- `diary`：他的日记，消费 `DiaryPresenter` 的角色、列表元数据和独立详情窗口命令
- `status`：状态，挂 `SubStatus`，消费共享 `StatusPresenter` 的 telemetry、错误重试、语义 region 和 60 格轨迹
- `garden`：陪伴花园，消费 `GardenPresenter` 的后端快照、刷新命令和 visual/summary/controls 子区域

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
- `registry.ts` 合并内置主题与 Tauri `list_themes` 扫描到的磁盘主题，校验必需 token、持久化 `chat.theme` 并通知订阅者；debug 只读 `public/themes/`，release 只读 `resource_dir/themes/`，磁盘主题的可选 CSS 经同一资源根的 Tauri `read_theme_css` 读取，前端继续用 `inspectThemeCss()` 安检。
- `ThemePicker.tsx` 由 Chat 和 Activity 偏好页共用，提供「刷新主题」入口，清空 registry cache 后重新扫描用户刚放入的磁盘 mod。
- `globals.css` 只保留 paper FOUC 兜底和结构性样式。

所有窗口启动时由 `main.tsx` 调用 `initTheme()`；独立 Pet WebView 通过同一初始化和 localStorage `storage` 事件跟随切换。Dream token 可由主题选择性覆盖，`features/dream/DreamTokens.css` 继续提供默认值与 sRGB/OKLCH 渐进增强。

## Shared frontend helpers

- `src/shared/fontAppearance.ts`：Chat / Dream 共用字体扫描、family 和 URL helper；两套 appearance 配置结构保持独立。
- `src/shared/images/cropImageToBlob.ts`：AvatarCropper / DreamBackgroundCropper 共用 canvas 裁剪 helper；输出尺寸由调用方传入。
- `src/shared/ui/TypingDots.tsx` / `TypingDots.css`：Chat / Dream 共用输入中视觉组件；颜色由各自主题变量传入。
- `src/shared/i18n/`：桌面客户端本地化入口。`locales/zh-CN.ts` / `en-US.ts` 保存语义 key 资源，`useI18n()` 驱动 React 文案和语言切换；Chat 偏好「常规」第一行持久化语言选择，选择后当前窗口立即重渲染，并通过 `storage` 事件同步其他 Webview。`legacy.ts` 与 DOM bridge 只兼容迁移前的既有硬编码文案；bridge 分开保存原文与上次翻译结果，双向切换不需要刷新页面。新增用户可见文案禁止写入兼容表，必须使用语义 key。

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

设置页沿用现有 PreferencesPanel：模型分类挂载 ModelRoutingSettingsPage、CharacterModelRoutingSettingsPage、ThinkingSettingsPage 与 OutputSegmentEnforceSettingsPage；能力与权限分类挂载 DesktopTtsSettingsPage、ToolLoopSettingsPage、VisualPerceptionSettingsPage 与电脑操作安全设置。视觉观察设置通过 Tauri command 控制本地开关与采样间隔；Rust sampler 在每次截图前都调用后端预检，稳定画面只做内存哈希比对，不上传。段落兜底页只负责 `output.segment_enforce.enabled` 热开关及有效阈值只读展示。助手非流式消息在桌面 TTS 开启时使用 VoiceMessageBar；语音按点击懒生成，可播放/暂停并展开文字。自动播放会立即并行请求各条音频，但主 Webview 持有跨窗口播放租约，聊天和桌宠均按消息入队顺序逐条输出，避免重叠。
## Runtime performance boundary (Brief 60)

Native satellite surfaces use one shared 20 Hz main-window snapshot per tick.
On Windows, `ensure_design_satellites` is asynchronous because WebView2 can
deadlock when a synchronous command creates a WebView. Satellite routes skip
main-window preference/theme/voice bootstrap, and their async cleanup guards
must call `invalidated()` rather than test the function object. A 175% DPI
debug fixture run verified three owned surfaces, ready replay, move/resize and
minimize/restore/close; release, multi-DPI and multi-monitor coverage remains
partial.
Per-surface frames are batched, stale/oversized frames are dropped, and
diagnostics are throttled to one-second updates. Hidden, covered, dream,
activity, toy, room and minimized states stop the rAF/IPC path and resume with
one current snapshot. Avatar HER/YOU loads emit as soon as a usable result is
available; backgrounds continue at low priority. Prompt-assets requests are
shared within a WebView and invalidated after mutation.

## Client-visible regression closure (Brief 61)

Ribbon tooltip overlays are portaled to `document.body` and clamped to the
viewport, while `.chat-ribbon__scroll` is vertical-only. `usePetController`
hydrates visibility from the native `pet` window, polls for external close,
deduplicates toggles and exposes retry state. `OnboardingGate` uses the
cancellable `checkTokenStatus` boundary (8 seconds by default) and renders a
retryable connection error instead of blocking the app forever.

## Design Mod Visual Ownership (Brief 62)

`NativeSurfaceManifest.visualBleed` reserves outer physical-window pixels around
the unexpanded content bounds. `contentInset` is applied inward to those
unexpanded bounds, so the satellite snapshot's `surface.contentRect` never
contains visual bleed. The snapshot exposes both `surface.bounds` and
`surface.contentRect`; a native surface is still clipped at its WebView
boundary, and the larger native bounds make that boundary intentional.

Freeform fixture mounts use a placement wrapper, a visual shell and an inner
content mask. `TransformController` is the only writer of the wrapper's
transform and combines base, drag, motion and physics offsets. The visual shell
may apply perspective, clip-path and decoration without changing measured
geometry. `DiaryPresenter` subscribes to `subscribeActiveCharacter`; the
official `SubDiary` exposes the active character and refresh action, not a
character picker. Avatar revision events refresh persistent consumers without
remounting `ChatPanel`.

## Design Mod Freeform Primitives (Brief 63)

Host API v2 adds explicit sidebar composition (`official-renderer`, `subregions`,
or `presenter-only`), semantic Status/Flow/Garden/Diary primitives, a single
scene scheduler over `TransformController`, and DPI-aware page/component edge
  observations for capped local ornaments. The built-in renderer portals Status
  `mood`, `activity`, and `timeline` independently; `activity` owns presence and
  `timeline` owns telemetry. The host keeps the default shell intact for
  builtin-default; the fixture uses separate primitive portals rather than moving
  complete Flow/Garden/Diary panels and now attaches all three Status child ids.
  See `docs/brief-63-freeform-primitives.md`.

## Diary sync settings (Brief 171)

`src/windows/chat/components/DiarySyncSettingsPage.tsx` is mounted in the
General preferences tab. The directory picker is native Tauri dialog UI. Its
actions call `get_diary_sync_status`, `set_diary_directory`,
`clear_diary_directory`, and `sync_diary` through the shared gated API. This
does not change the read-only `SubDiary` panel or its character-inner-diary
contract.
## RPG Dream 双栏

`DreamWindow` 在后端状态的 `dream_mode === "rpg"` 时挂载 `RpgDreamPanel`。面板从 RPG state/transcript 恢复活动场景，将 `character` 与 `kp/shared` 分栏展示，并通过 lane 选择提交回合。RPG capability 不可用时，Dream 偏好中的 RPG 模式不会显示；普通 sandbox/scenario/mirror 路径保持原状。
## Agent Runtime Browser retirement (Brief 72)

Browser policy, allowlist, worker state and experiment task submission are owned by the
backend admin panel. The desktop client has no browser task form, observation panel, shared
API, Tauri bridge, lifecycle cache, or `botUserId`/`bot_user_id` configuration. It neither
submits a browser URL, operation or params nor receives tokens, cookies, profile paths, local
files, full URLs/query strings, page bodies, or raw task results. The old Brief 71 surface was
removed rather than retained as a compatibility bridge; a refresh, character switch, or restart
therefore cannot reconstruct, confirm, resume, or run a browser task from stale client memory.


## 桌面聊天交互修复（2026-09-10，partial）

实现与跨仓边界见 `docs/chat-usability-2026-09-10.md`（本目录中为同名文档）。聊天/上传使用 600 秒总等待与 15 秒连接预算；桌宠创建/销毁采用 async command；子页面懒加载独立 Suspense。
界面新增不透明度、情绪色条/标签开关；附件先暂存后发送，用户与角色均可引用。真实窗口/慢请求验收及历史引用恢复仍 open；跨仓总账同步待后端仓处理。
