# docs/known-issues.md — 已知问题与技术债

> 修复前请先对照代码确认问题仍存在；修复后在本文件改状态或移到已修复区。

---

## 语音（TTS）功能完全未接入

**影响**：后端已有完整 TTS 合成（`config.yaml: tts.enabled`、情绪音色映射、`/tts-config` 接口），但客户端从未实现音频播放端，`/tts-config` 的开关也无处放置——控制一个不存在的功能没有意义。

**证据**：全仓 grep `tts|voice|audio` 仅命中 avatar 等无关项，无任何音频播放代码。

**建议**：单开"语音接入"工单，最小形态：① Rust command 请求后端合成音频 → ② 前端播放 → ③ 偏好面板加 TTS 开关（音色映射属部署期，留 `config.yaml`）。目前对话设置（Fix 1）已先行独立上线，不依赖本项。

---

## P1：客户端和目标 v1 WS 协议不一致

**位置**：`src/shared/api/ws.ts`、`src/shared/api/types.ts`、`Emerald-presence` 仓库（通常与本仓库同级）的 `channels\desktop_ws.py`

当前实际协议是 legacy：

- `hello` / `hello_ack`
- `channel_message`
- `action`
- `ack`
- `ping` / `pong`

旧 v1 协议文档要求：

- envelope：`v` / `ts` / `payload`
- `assistant_message`
- `state_update`
- `user_message`
- `client_event`
- capabilities 声明

**影响**：后续接手者容易误以为 Phase 2b 已完成；状态推送、用户输入 WS 化、模式切换都还没落地。

**建议**：先决定是短期继续 legacy，还是直接推动后端和客户端一起升 v1。不要在客户端单边实现 v1。

---

## P1：用户发送仍走 HTTP `/desktop/chat`，不是 WS `user_message`

**位置**：`src/windows/chat/components/ChatPanel.tsx`、`src/shared/api/backend.ts`、`src-tauri/src/lib.rs`

当前 `send()` 调用 `sendChat()`，Tauri command 再 POST `/desktop/chat`。

**影响**：与 v1 协议文档中“用户输入走 WS，回复走 assistant_message”的目标不一致；也导致 HTTP 返回回复和 WS 主动消息两条路径并存。

**建议**：协议升级时把 `sendChat()` 改为 WS `user_message`，或明确文档标记 HTTP 为过渡路径。

---

## P2：admin token 已从前端源码迁出（QQ 号 ChatPanel 已绕过）

**位置**：`src-tauri/src/client_config.rs`、`config/client.local.json`

Phase 2c+ 之后，ChatPanel 启动历史改走 `/chat-log/*` 接口，owner_qq 由后端从 `config.yaml` 读取，客户端不再直接使用 `BOT_USER_ID`。但 `BOT_USER_ID` 仍出现在 `loadHistory()`（现备用）及可能的 future 模块里。

**当前状态**：

- `ADMIN_TOKEN` 已迁移到 Rust 侧本地配置读取，前端不再保存或传递 token。
- `config/client.local.json` 已加入 `.gitignore`，真实 token 不应提交。
- `/memory/{uid}/short-term` 不再被 ChatPanel 调用，但其他模块未来可能仍用。

**剩余建议**：`BOT_USER_ID` 遗留可在确认无其他调用者后清理；长期仍可考虑后端专用本机鉴权替代静态 token。

---

## P1：`state_update` 没有接入 StateEngine

**位置**：`src/shared/state/store.ts`、`src/shared/api/ws.ts`

`StateEngine.applyBackendState('state-update', patch)` 已保留未来 source，但 WS 类型里没有 `state_update`，`wsClient` 也没有处理；当前 mood/activity/presence ownership 也未切换为推送。

**影响**：后端推送的情绪、活动、presence 不能驱动 UI；当前 mood/activity 来自轮询，presence 仍由本地交互驱动。

**建议**：协议对齐后先明确推送字段 ownership，再把后端状态变化统一转成 `engine.applyBackendState('state-update', patch)`。

---

## P2：`sensor-service/` 只有空目录骨架

**位置**：`sensor-service/`

目录存在，但没有 Python 实现文件。

**影响**：项目结构看起来像已迁感知服务，但实际不可运行。

**建议**：迁移旧 `Emerald-desktop` 感知层时，先写启动入口、数据路径和后端 `/sensor/*` 对接文档。

---

## P2：桌面协议文档路径漂移

**位置**：文档路径

旧入口说明曾写（相对 `Emerald-presence` 仓库根，通常与本仓库同级）：

```text
docs\desktop-client-protocol.md
docs\desktop-client-plan.md
```

当前实际同名文件在 `Emerald-desktop` 仓库（通常与本仓库同级）的：

```text
docs\
```

**影响**：后续协作者按旧路径找不到协议文档，容易重复设计或误判状态。

**建议**：要么把协议文档复制/迁到本仓库或后端仓库，要么持续在 `docs/backend-integration.md` 标明权威位置。

---

## P3：旧客户端迁移没有独立状态地图

旧的 `docs/migration-status.md` 已随基本迁移完成而移除。剩余迁移缺口只在
`ARCHITECTURE.md` 的「迁移关系」和本文档维护；新增或关闭迁移缺口时必须同步更新这两处，
避免再次留下失效入口。

---

## P3：Tauri 项目名和窗口标题仍是模板名

**位置**：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`

当前仍有：

- package name: `tauri-app`
- productName: `tauri-app`
- window title: `tauri-app`
- Rust package description: `A Tauri App`

**影响**：开发和打包时显示不符合 Emerald-client。

**建议**：在正式打包前统一改名。

---

## P3：ChatPanel header 的“偏好”按钮没有 onClick

**位置**：`src/windows/chat/components/ChatPanel.tsx`

Header 右侧渲染：

```tsx
<Btn icon="settings" dense>偏好</Btn>
```

没有传 `onClick`。实际可用的偏好入口在 Ribbon。

**影响**：用户点击 header 偏好按钮没有反应。

**建议**：传入 `onOpenPrefs`，或移除这个重复入口。

---

## P2：日记 emotion 字段后端未产出，客户端已预留 UI，等后端扩展

**位置**：`Emerald-presence/admin/routers/diary.py`、`src/windows/chat/components/SubDiary.tsx`

后端 `/diary/list` 和 `/diary/{date}` 的 `emotion` 字段当前统一返回 `null`。客户端的 filter tabs 和 entry 标签已按 `emotion !== null` 判空处理，不渲染空标签。

**影响**：日记 tab 的 filter tabs 目前只显示"全部"一项，emotion 标签不出现。功能完整，只是 emotion 标注数据未来需要后端补充（如 LLM 客观判断后写入文件 frontmatter）。

**建议**：后端扩展 emotion 后，客户端无需改代码，emotion 值会直接出现在 filter tabs 和标签里。

---

## P2：Garden daily lifecycle 仅数据层手测，scheduler 端到端未实测

**位置**：`Emerald-presence/core/garden/manager.py daily_check()`、`Emerald-presence/core/scheduler/triggers/garden_daily.py`、`Emerald-presence/core/scheduler/loop.py` `garden_daily` cooldown

Phase 2d.5e 完成时数据层在 REPL 单测全通过：

- harvest 过期事件触发一次后不重复
- harvest handle 通过 `handle_triggered` 标记防重
- bloom 事件在 `water()` 返回值的 `events` 字段里正确生成

**未实测**的部分：

- `garden_daily` trigger 在 scheduler 真实主循环里是否按 24h cooldown 正确触发
- `_pipeline_send` 在 garden 这条调用路径下 LLM 是否产出合理叶瑄发言
- `harvest_handle` 中 `ask` / `gift` 必发、`dry` / `vase` 30% sample 的实际发言频率是否符合体感
- 多事件同 tick 触发时叶瑄是否一次说太多（events 是循环逐条 `await _pipeline_send`，中间没有节流）

**影响**：首次出现 harvest 过期 / handle / vase 枯萎之前完全无法暴露；日常体感问题（发言频率、口吻、上下文连贯性）只有长时间使用后才显现。

**触发条件**：需要至少跑一株花从浇水到开花（约 3 天）+ 3 天 handle 阈值 + 偶尔 7 天 vase 枯萎，最早能观察到行为大约是 phase 完成后 1 周。

**建议**：实际使用 1-2 周后按 Phase 2d.5e 验证步骤复检，根据体感调：发言频率、`SAMPLE_TALK_PROB` 数值、prompt 文本风格。

---

## P2：花园客户端目前是只读状态页，缺 harvest/vase 详情和操作入口

**位置**：`src/windows/chat/components/SubGarden.tsx`、`src/shared/api/types.ts`

当前 `SubGarden` 已能读 `/garden/state` 并展示五个花槽，但 UI 只消费 `slots`。`harvest_count` / `vase_count` 只在类型里存在，没有展示收获区、花瓶详情，也没有手动浇水、采收、送花等操作入口。

**影响**：后端花园生命周期已经往 harvest/vase 方向推进，但客户端用户只能看到生长槽位，无法理解“开花后去了哪里”。

**建议**：后端若继续只暴露 count，就在 UI 上至少展示计数；如果要完整闭环，需要扩展 `/garden/state` 返回 harvest/vase 列表，或新增只读详情接口和操作接口。

---


---

## P3：system 消息会按 HER 气泡渲染

**位置**：`src/windows/chat/components/ChatPanel.tsx`

发送失败时追加：

```ts
{ role: "system", text: `（连接失败：${msg}）` }
```

`Bubble` 只判断 `msg.role === "user"`，否则都走助手气泡。

**影响**：连接失败提示看起来像叶瑄发言。

**建议**：给 `system` 单独样式，或统一走 toast/status bar。

---

---

## P2：Panes.tsx 存在历史 TS 类型错误

**位置**：`src/windows/chat/components/Panes.tsx`

tsc --noEmit 存在来自 Panes.tsx 的历史报错，不属于本次重构范围，不影响运行时行为。

**建议**：下一轮清理时修复。

---

## P1：Dream 打开时 ChatPanel 仍会卸载，Reality park/flush 路径无法端到端生效

**位置**：`src/windows/chat/ChatWindow.tsx`、`src/windows/chat/components/ChatPanel.tsx`

ChatPanel 已实现 Dream active 期间按 `msg_id` park Reality `channel_message` / `message_segments`，退梦后再 flush；但 ChatWindow 当前仍以 `!dreamWindowOpen` 条件渲染 ChatPanel。Dream 打开时 ChatPanel 会卸载并取消 WS 订阅，组件内的 parked map 也随之丢失。

**影响**：park/flush 逻辑已存在，但当前窗口挂载结构下无法在 Dream overlay 打开期间持续接收 Reality WS 消息。

**建议**：像 Activity overlay 一样保持 ChatPanel 挂载，仅在 Dream 期间隐藏 Reality UI，再验证退梦 flush。

---

## 已修复

### 梦境流动一直显示假数据；客户端硬编码「叶瑄/yexuan」到处都是（2026-07-06，cc-tasks/15 §E/§G，配合 backend Brief 25）

**原问题（§E）**：`DreamSidebar.tsx` 读 `dreamState.flow_entries / dream_events / events`，但后端 `GET /dream/state` 从不返回这三个字段，`getBackendFlowEntries` 永远拿到空数组，侧栏「梦境流动」永远显示 `buildFallbackFlowEntries` 的三条固定文案，看起来像接了实际没接。`dream-types.ts` 里的 `DreamFlowEntry`/`DreamFlowEntrySource` 类型也是当时猜测的形状（`type`/`description`/`label` 等字段），和后端实际产出对不上。

**原问题（§G）**：全仓 grep 大量硬编码「叶瑄」「yexuan」——不止 Brief 里列出的几个已知点（`ChatPanel.tsx` 通知标题、`RoomWindow.tsx` 视频通话标签、`presence-nag` 映射表、`ws.ts`/`actions.rs` 兜底），活动陪聊面板、活动设置页、玩具聊天面板/侧栏、五子棋/象棋对手枚举等也都是字面量，换角色部署时界面到处露出「叶瑄」。

**修复（后端 Brief 25 §2/§3 P2 落地后）**：
- `GET /dream/state` 新增规则驱动的 `flow_entries: {ts, kind, summary}[]`（零额外 LLM 调用，FIFO 上限 10 条），`char_tension`（`yexuan_tension` 作为迁移期双发的废弃别名保留一段时间），五子棋/象棋对手枚举 `yexuan_ai` → `character_ai`（读路径旧值归一化，响应始终发新值）。
- `dream-types.ts` 的 `DreamFlowEntry` 按后端实际形状重定型，删掉猜测字段和 `dream_events`/`events`；`DreamSidebar.tsx` 直接消费 `flow_entries`，展示条数从 3 提到 5、最新在上、带相对时间（`formatAgo` 风格）；仅在为空时回退固定文案。`char_tension ?? yexuan_tension` 兼容读取（`DreamSidebar.tsx`、`DreamControlBar.tsx`——后者此前只读了旧字段，属于遗漏）。
- 新增 `shared/activeCharacter.ts`：基于 `uiPreferences` 的跨窗口「当前激活角色」缓存（`StateEngine` 不跨窗口，无法承担这个角色），`ChatWindow.tsx` 是唯一 writer，其余窗口/组件用 `getActiveCharacterName()` 只读。替换了 `ChatPanel.tsx`、`GroupChatPanel.tsx`（含 group 场景下按 `speakerId` 解析而非用单一 active 角色名）、`RoomWindow.tsx`、`presence-nag/PresenceNagWindow.tsx`（删掉 `CHARACTER_NAMES` 映射表）、`ws.ts`、`ActivityCompanionPanel.tsx`、`ActivitySettingsPage.tsx`、`ToyChatPanel.tsx`、`ToySidebar.tsx`、`ChatWindow.tsx` 偏好面板提示文案、`DreamStatusSidebar.tsx`/`DreamSidebar.tsx` 里所有硬编码「叶瑄」；`actions.rs::presence_nag` 的 Rust 侧兜底从 `"叶瑄"` 改为中性标识 `"character"`（展示名解析交给客户端）。五子棋/象棋对手常量抽为 `AI_OPPONENT = 'character_ai'`。
- 新增 `npm run check:naming`（`scripts/check-naming.mjs`）扫描 `src/**/*.{ts,tsx,css}` 断言不出现「叶瑄」/「yexuan」，仅白名单 `char_tension ?? yexuan_tension` 兼容读取的三行（双发窗口结束后连同白名单一起删）。

### 潜意识面板系统味太重、非梦境时也显示假数据（2026-07-05，cc-tasks/15 §F）

**原问题**：`SubHiddenStatePanel.tsx` 挂载即无条件 `loadHiddenStateDebug()`，不管是否在梦境里都渲染数值卡；顶栏 `READ ONLY · Phase 4.5` 标签、每张卡片的「最近来源」badge、`SourceDiagnostic` 驱动源诊断行、`DiffRow` prev/curr 数值对比行、`InertNote`（「H1 接线前仅衰减驱动」）、`DeveloperNotice`、「仅出梦 afterglow 回流」说明行——全是给开发调试看的系统信息，产品要的是沉浸感。

**修复**：新增 `dreamState` prop，复用 `DreamStatusSidebar.tsx` 导出的 `isDreamActive()` 判定；非梦境时只渲染占位文案「还未进入梦境」（复用 `.dream-hud__empty`），不发请求。入梦后：移除上述所有系统味文案/诊断行（`HudMeter` 自带的 delta 箭头保留），开发者模式下的「开发者信息 / SCHEMA v1」整卡（`last_decay_tick`、`display.physiological_arousal` 两行）一并删除，只留「即时敏感」「触碰亏缺」两张数值卡；`DreamSidePane` 的 kicker 从 `READ ONLY · HIDDEN STATE` 改为 `SUBCONSCIOUS`。`SourceBadge`/`SourceDiagnostic`/`DiffRow`/`InertNote`/`DeveloperNotice` 及相关常量（`SOURCE_HUE`/`PASSIVE_SOURCES`）确认无其他引用后整体删除。

### 自定义配色预设无法二次编辑；梦境 env 气泡样式突兀；日间聊天区偏灰（2026-07-05，cc-tasks/15 §B/§C/§D）

**原问题（§B，`ChatColorPage.tsx`）**：三个问题叠加。① token 加载 `useEffect` 依赖 `[selectedPreset]`（对象引用）——`subscribeTheme` 在任何主题事件（切槽位、日夜自动切换定时器等）时都会 `setPresets(loadUserPresets())` 重建数组，`selectedPreset` 引用随之变化，effect 重跑，把用户正在改的颜色静默回滚成已保存值。② 预设下拉框按 `base === 当前槽位` 过滤，白天建的预设晚上打开面板就找不到，看起来像"保存过的预设丢了"。③ `moodReactive.applyMoodOverlay`（mood 每次更新触发）内联覆写 `--accent`/`--forest` 等——正是编辑器里的 token，用户刚选的颜色几秒后被盖掉。

**修复（§B）**：token 加载 effect 依赖改为 `[selectedId]`；下拉框改为显示全部预设并带 `[日]/[夜]` 标记，选中与当前槽 base 不符的预设时自动切换 `editSlot`（原来"切槽位清空选择"的逻辑移进日夜按钮自己的 `switchSlot` 里，避免和"选预设联动切槽"互相打架）；`ChatColorPage` 挂载时 `suspendMoodOverlay()`（内部 `clearMoodOverlay()` + 挂起标志，`applyMoodOverlay` 调用变为 no-op 但仍记录最新 mood/intensity），卸载时 `resumeMoodOverlay()` 用记录的最新状态立即重新应用。顺带修了 `moodReactive.ts` 里 `computeMoodOverrides` 从**已被覆写的当前值**再偏移导致的连续漂移——同一批目标 CSS 变量的"真实基准值"现在只在无覆盖的干净状态下抓取一次并缓存（`baseSnapshot`），`registry.ts` 的 `setTheme()` 在真正切主题时调用新增的 `resetMoodOverlayBase()` 使缓存失效。

**原问题（§C，`DreamTokens.css`）**：梦境第三种气泡类型 `env`（环境描写）用 mono 字体 + 0.86× 字号 + 边框盒样式，和其余类型（尤其视觉上更协调的 `do` 动作描写）风格突兀。

**修复（§C）**：`.dream-segment--env` 规则整体替换为与 `.dream-segment--do` 一致（衬线、oblique、左细线、渐变淡底），删掉 mono/边框盒样式和废弃的 `--dream-segment-env-font-size` 变量；`env` 语义类名和 TSX 判断逻辑不变。

**原问题（§D，`DreamWindow.tsx` / `dreamAppearance.ts`）**：日间模式聊天区偏灰。排查后：`colorOverridesDay` 没有针对已知 token 键集做校验，理论上可能混入非法 key（`dreamAppearance.ts` 的 `load` 校验此前完全不过滤）；`.dream-theme__chat` 顶层白色渐变（`0.58`/`0.38`）叠加 `--dt-bg-1/2/3` 花卉底色后不够亮，读起来发灰。

**修复（§D）**：把 `DREAM_DAY_DEFAULTS`/`DREAM_NIGHT_DEFAULTS`（原本定义在 `DreamPrefsPane.tsx` 里）搬到 `dreamAppearance.ts` 作为唯一权威键集导出，`loadDreamAppearance()` 加载时丢弃 `colorOverridesDay`/`colorOverridesNight` 里不在各自默认键集中的 key；`.dream-theme__chat` 顶层白色渐变从 `0.58`/`0.38` 提到 `0.80`/`0.62`（只影响日间——夜间在 `.dream-theme--night .dream-theme__chat` 里整段覆写 `background`，不受影响）。背景图容器 `.dream-theme__chat-background` 的渲染条件（`backgroundDataUrl &&`）核实后本来就正确，未发现"空 dataUrl 仍渲染空容器"的问题，未改动。

### `tauri.conf.json` 的 `identifier` 改名导致全部 UI 偏好一次性归零（2026-07-05，cc-tasks/15 §A）

**原问题**：commit `67d9a98`（opensource rename）把 `identifier` 从 `com.emerald-client.app`
改成了 `com.presencekit.desktop`。Windows 上 WebView2 的 user-data 目录按 `identifier`
派生，改名后 webview 换到全新空 profile，所有 `emerald.ui.*` localStorage（字体大小、主题、
颜色预设、房间设置、角色绑定、动向时间轴……）全部归零。旧数据还在旧 `identifier` 目录的
LevelDB 里，无实用导入手段，按丢失处理。

**修复**：`uiPreferences.ts` 改为文件后端——真正的持久化落在 Rust 侧
`app_config_dir()/ui-preferences.json`（IPC `load_ui_prefs`/`save_ui_prefs`，原子写），
不再单独依赖 localStorage 的存续。localStorage 仍作为镜像保留（给依赖原生 `storage`
事件跨窗同步的代码路径用），但即使它被清空，下次启动也会从磁盘文件恢复。详见
`docs/frontend-structure.md` 「uiPreferences」一节。

**教训**：`identifier` 之类影响 WebView2 profile 路径的 Tauri 配置项，一旦改名等同于
把所有 localStorage-only 的状态清零；以后再动这个字段前必须先确认关键偏好已经落到
不依赖它的存储（文件/后端），而不是临时补救。

### 桌宠话语不是主通道，两头不同步；输入框只能在聊天窗（2026-07-04，cc-tasks/14 §D）

**原问题**：桌宠气泡不是独立通道——`ChatPanel.scheduleAssistantSegments`（`ChatPanel.tsx:927`）把回复第一句摘要（`summarizePetReply`，≤92 字）经 `pet://snapshot` 的 `latestAssistantText` 字段转发，依赖 ChatPanel 自身的挂载状态、去重守卫、梦境隐藏与 fallback 竞态；任意一环吞掉渲染，桌宠与聊天框就两头不同步。桌宠窗也没有输入框，无法主动发起对话。

**修复**：新增 `pet://turn` 通道（`src/shared/pet/bridge.ts`，`PetTurnEvent` 判别联合覆盖 `channel_message`/`message_segments`/`message_stream_start|delta|end`）。转发层落在 `ChatWindow.tsx` 顶层（不在 `ChatPanel` 内，绕开其去重/梦境门控），原样订阅 `wsClient` 对应事件后 `emitPetTurn` 广播全文，不再摘要。`PetWindow.tsx` 监听 `pet://turn`，第一版只消费 `channel_message` 渲染全文气泡（展示时长 `max(6s, len*80ms)`），流式 reveal 留给 `windows/room/turnIngest.ts` 复用；`Model3DStage` 的开口动画同样改由 `pet://turn` 驱动（不再读 `snapshot.latestAssistantText`）。`PetSnapshot.latestAssistantText`、`summarizePetReply`、`ChatPanel` 内对应的 `publishPetSnapshot` 调用一并删除。桌宠窗底部新增输入框，回车走 `sendChat()`（HTTP Tauri command，任意窗口可用，桌宠语音热键已在用），回复经 WS → 主窗转发 → 气泡，同轮也会自然出现在主聊天历史。边界：主窗口关闭则桌宠也收不到转发（pet 由主窗口 spawn，可接受）。

### 动向时间轴几分钟重复刷 / 桌宠气泡是摘要非原文 / 缩放跨窗不实时且会顶出头 / 房间切模型丢机位（2026-07-04，cc-tasks/14 §B-1/§C/§E/§F）

**原问题**：`SubFlow.tsx` 时间轴插入判定用 `lastKeyRef`（含 mood）比对，组件重挂即归零必插一条，mood 轮询波动（30–60s）也会插新条；`PetWindow.tsx` 左上/右上渲染 mood/thinking/activity 文案，与聊天区重复且占地方；桌宠模型缩放滑杆 `setUIPref` 只 dispatch 同窗 `CustomEvent`，pet 窗收不到（WebView2 跨窗 storage 事件也不可靠），且正交相机 `camera.zoom` 绕视口中心缩放，放大后头出框；房间 `RoomSettings` 的 framing/fov/scale/offset/yaw/customView/props 是单一全局 blob，切模型或切场景会互相覆盖机位站位。

**修复**：时间轴去重改为比对持久化 `timeline[0].text`（不含 mood），删 `lastKeyRef`；`PetWindow.tsx` 删除左上 mood/thinking 与右上 activity 文案及相关 `MOOD_ATMOSPHERES`/`pickAtmosphere` 轮换逻辑，仅保留 `REC`/`PINNED`；新增 `pet://prefs`（`src/shared/pet/bridge.ts`）广播事件，`ChatWindow.tsx` 滑杆变化时 `emitPetPrefs` 通知 pet 窗实时更新 `Model3DStage`/`Live2DStage` 的 zoom；两个 stage 缩放时保持模型头顶在视口投影位置不变（`Model3DStage` 用 `THREE.Box3` 算 `headY` 反解相机 `position.y`；`Live2DStage` 联动 `model.y` 抵消缩放增量）；`RoomSettings` 新增 `perPlacement: Record<'${sceneFile}|${characterFile}', PlacementCfg>`（`src/shared/room/roomSettings.ts`），`switchRoomPlacement()` 在 `CallSettingsPage.tsx` 切模型/场景时快照旧 key、应用新 key（无记录则保留当前值，legacy 兜底），`saveRoomSettings()` 每次保存同步回写当前 key。

### Sidebar tab 缺 ErrorBoundary，单 panel 渲染异常会拖垮整个聊天窗口（2026-07-02，cc-tasks/08 #3）

**原问题**：全仓库没有任何 `ErrorBoundary`。`Sidebar.tsx` 里 `flow/garden/diary/status` tab 切换用普通三元表达式渲染，任意一个 panel（尤其 `SubStatus.tsx`，接了 sensor 轮询 + mood 订阅 + 多个 `setInterval`）渲染期抛异常时，React 会卸载整棵树，表现为“点进某个 tab 就黑屏”而不是只黑那一块。静态审查未发现 `SubStatus.tsx` 有明显的 undefined 调用（`MOOD_HUE`/`MOOD_LABEL_EN`/`engine.get()` 等都有 `?? fallback`），本次沙箱环境无法起 Tauri 窗口做浏览器目检，未能复现拿到真实堆栈，因此这次只做了止血。

**修复**：`Sidebar.tsx` 用 `src/shared/ui/ErrorBoundary.tsx`（新增）包住 tab 内容区，`key={tab}` 保证切 tab 时清空错误状态；崩溃只影响当前 panel（显示“状态出错 + 重试”），不再拖垮整个窗口，且 stack 会经 `componentDidCatch` 进控制台。

**遗留**：真实根因仍未定位，需要有人在真实 Tauri 窗口里点开「状态」tab、读控制台第一条报错，重点怀疑 `useTelemetrySignals` 里 `spikeTickRef` 的递归 `setInterval` 或 sensor 轮询在特定时序下的边界情况。

### ChatPanel 先开前端后开后端时历史空白，且不会自动重试（2026-07-02，cc-tasks/08 #4）

**原问题**：`ChatPanel.tsx` 启动加载的 `useEffect` 依赖数组是 `[]`，`init()` 只跑一次。前端先起来、后端还没上时 `loadChatLogDates()` 抛错 → `historyStatus` 落入 `error` → 之后没有任何重试，等后端起来了也不会自动重新拉，页面一直空白（且 `_desktopWakeFired` 不会补触发，问候也丢了）。

**修复**：`init()` 改造成 `useCallback`（配 `mountedRef`/`initInFlightRef` 防重入防并发），可重复调用。新增两条重试路径：① `wsClient.on('state', ...)` 订阅，WS 变 `connected` 且 `historyStatus.kind === 'error'` 时重拉；② 兜底 5s 轮询，`historyStatus.kind === 'error'` 期间持续重试直到成功或卸载。消息区新增 `error` 态下的“正在等待后端连接…+ 重试按钮”占位，不再是纯空白。`_desktopWakeFired`（同 session 只发一次问候）不受影响。

### 上线主动触发（desktopWake）在重登/刷新前后端时会重复误发（2026-07-02，cc-tasks/08 #2）

**原问题**：`desktopWake()` 的“每 session 只发一次”靠模块级布尔 `_desktopWakeFired` 去抖，但 F5 刷新或重开窗口会重置模块变量，导致短时间内重复触发上线问候。

**修复**：新增 `src/shared/desktopWakeGate.ts`，用 `localStorage` 持久化“上次成功发出 wake 的时间戳”（跨刷新/重启存活，`WAKE_MIN_GAP_MS = 10 * 60 * 1000`）。`ChatPanel.tsx` 里发 wake 前先查 `shouldSkipDesktopWake()`，10 分钟内跳过（历史加载不受影响，照常拉），否则正常发送并在 HTTP 成功后 `markDesktopWakeFired()`。与 `_desktopWakeFired` 的 session 内去抖是两层，互不冲突。

### 桌宠按钮已接入真实桌宠窗口与鼠标交互（2026-06-14，CC-11b）

**原问题**：Ribbon 只切 `petVisible` 和 engine mode，没有真实桌宠窗口。

**修复**：已接入独立透明置顶 `PetWindow`、Chat/Pet 快照桥、粒子视觉，并补充害羞躲避、
随机蹭、Ctrl 钉住、拖拽协调、屏幕边界保护和全局鼠标交互偏好。

### title_sanitizer 已改为隐私保守默认（2026-06-12，N4）

**原问题**：未知 / Other 应用会透出原始窗口标题，可能泄漏文件名、目录、压缩包名、终端路径或聊天内容。

**修复**：只有明确白名单 Browser 返回域名、Editor 返回安全 basename；Chat、Other、未知应用以及 Explorer / Office / PDF / 压缩工具均不返回 `title_hint`。

### WebSocket action 基础执行器已接入（2026-05-26，P-01）

**原问题**：`src/shared/api/ws.ts` 收到 `action` 后立即回成功 ack，但没有执行动作。

**修复**：新增 `src-tauri/src/actions.rs` 并在 `src-tauri/src/lib.rs` 注册四个 action commands；`ws.ts` 收到 action 后异步 dispatch，执行成功回 `ok:true`，失败或未知 action 回 `ok:false`。当前只覆盖 `minimize_window`、`open_url`、`show_notify`、`media_play_pause`，不改 legacy WS 协议，不删除旧桌宠或 file fallback。

### SubStatus 4 个持续可感知信号已接入 sensor（2026-05-19，Phase 2f+）

**原问题**：呼吸频率、视线锁定度、节奏不规则三个 signal 由 mood 派生，是视觉装饰，不反映真实生理节律。

**修复**：接入 `/sensor/realtime` 后端接口，breath / gaze_lock / rhythm 改由真实键鼠、stale_seconds、switch_count 派生。sensor 不可用（stale > 90s 或 _no_data）时降级回 mood 派生算法。mood_aura 保留 mood 派生，因为它是 mood 的视觉投影。

---

### Panes.tsx cleanup 类型报错（2026-05-16，Phase 2c+）

**原问题**：`useEffect(() => panesApi.subscribe(setList), [])` 返回 `Set.delete` 的 boolean，React 期望 `void | Destructor`，`tsc --noEmit` 报 TS2322。

**修复**：改为显式 cleanup 函数：

```tsx
useEffect(() => {
  const unsub = panesApi.subscribe(setList);
  return () => { unsub(); };
}, []);
```

修复后 `tsc --noEmit` 零报错。
