# docs/known-issues.md — 已知问题与技术债

## 手机梦境广播 UI 隔离（2026-09-13，partial/open）

现实窗口误收旧 Dream 打字机流已修复，纯逻辑与浏览器 IPC 夹具回归通过；见
dream-isolation-2026-09-13.md。真实手机 + Tauri 联合验收仍 open。
后端无 domain 的旧动画缺完整请求归属；跨设备同时发 Dream/活动时的动画关联仍 open，
建议后端另单补 domain/request 归属。本单不修改其他仓库，后端 three-repo-interface-catalog.md
同步待后端仓处理，不能把客户端过滤视为后端协议已升级。

## 资料接续联合验收（2026-09-13，observe）

后端图片/文档回读、生活记录待评估投递和静默工具结果接续已实现；管理面隔离实测与定向回归通过。
桌面无需新包，上传/WS/通知和本机截图授权不变。运行中后端需重启，真实桌面/手机/模型联合验证未完成。
设置职责见 settings-control-audit.md；后端详情见 docs/media-continuity-2026-09-13.md。

### 聊天交互修整验收（2026-09-11，partial/open）

实现与浏览器夹具验证见 ui-refinements-2026-09-11.md。活动/群聊标准壳及 Design Mod
往返、气泡透明度、思考延迟占位与自动刷新、双端配色预览已实现。
open：真实 Tauri / 模型归档延迟 / release 验收；未跨仓修改后端总账，待后端仓同步。
思考空记录自动读取最多 30 次，缺 canonical ID 等待最多 60 秒；超时停止，不无限轮询。
手机入口仍 roadmap，历史缺 turn_id 仍依赖后端修复。

### API 思考展开验收与跨端关联（Brief 244，2026-09-11，partial/open）

桌面 IPC、canonical 关联、每次回复一个居中旁白入口、角色与对话展示开关已实现；
详情见 brief-244-reasoning.md。展开不再显示模型/调用/来源字段。
**open：历史恢复**。后端 chat_log._parse_day 忽略 > 元数据，实际不返回 turn_id；
这使重启后的历史回复缺少思考入口。用户要求后端另单，未跨仓修复；具体施工和验收见
../cc-tasks/244-history-turn-id-backend-handoff.md。带 ID 的历史夹具通过不等于真实后端已修复。
open：真实 Tauri WebView + 真实后端 desktop token/模型归档联调、release 验收未完成；
浏览器 IPC 夹具不代表实机通过。手机无展开 UI，保留 roadmap。
仅收到 WS 的另一端没有 canonical turn_id（当前 WS 只有 transport msg_id），不提供
猜测入口；后端若补明确关联契约再接入。无关联旧归档、QQ/主动/Dream/Stage 仍 roadmap。
本单限定本仓，未修改 ../Emerald-presence/docs/three-repo-interface-catalog.md；
后端总账仍写客户端 roadmap，待后端仓按本仓验收文档同步 current/partial。
窄至 480px 且保留默认宽侧栏时，原布局会挤压整个聊天区；本单窄屏面板验收先收起侧栏，
全局小窗口布局适配保留 open，不以面板换行修复冒充整窗适配。

### Agent Runtime 浏览器旧后端 compatibility 路由待发布迁移确认（Brief 72，observe）

影响：桌面端不再配置 browser allowlist、提交或观测浏览器任务，也没有 Tauri bridge、
`bot_user_id`、URL/operation/params 缓存或恢复路径。后端 admin 面板独立拥有 worker、allowlist
和 task receipt；桌面端不会展示 token、cookie、profile、文件路径、完整 URL/query、页面正文或
原始参数。

证据：`tests/client-surface-retirement.test.ts` 锁定退役边界；真实 Tauri WebView 经 CDP
打开偏好并硬刷新后，旧标题、表单、提交按钮和 URL 输入均为 0。后端三仓接口总账仍将旧
owner bridge 标为 OpenAPI-deprecated compatibility，直到发布客户端完成迁移；当前 admin
`/settings/agent-runtime-browser*` 是唯一提交面。Brief 71 的旧 client 生命周期验收仍是
历史 `partial/open`，见 `docs/brief-71-acceptance-record.md` 与
`docs/runtime-acceptance-matrix.json`。

建议：由后端仓在确认发布迁移后删除 deprecated compatibility routes，并继续在 admin 面板完成
真实隔离浏览器验收；不得以这个历史缺口重新引入桌面任务表单、bridge 或自动确认/恢复行为。


- **苔庭 Design Mod（工单 66）** — `partial/open`。
  M1-M4 包结构、theme/layout、十个 Scene 节点、四组 subregions、presenter 错误木牌、DPR 像素植物、
  bounded edge 苔藓、Halo 与风铃 Island 已落地；manifest/入口语法、Design Mod 相关纯测试和 TypeScript
  检查通过。仍需 Windows 真实窗口验收：宽/窄窗口、100%/125%/175% DPI、双屏负坐标、拖窗同框、
  hide/restore、Mod A→苔庭→builtin ×20、Halo click-through、Island command ack，以及 release
  `resource_dir/design-mods` 读取。和纸纹理目前使用 CSS 纤维 underlay，`assets/washi.png` 位图待可用图像
  生成工具后补入；本 Mod 未新增 backend/mobile/API/WS/StateEngine 契约。

- **Design Mod freeform primitives and edge ornaments (work order 63)** — `partial/open`.
  Component composition, scene/edge APIs, bounded canvas ornaments, presenter
  selector isolation and lifecycle cleanup are covered by pure tests. Windows
  fixture acceptance remains open: verify five primitives at page edges/top,
  page and component ornaments through resize/tab switches, 100%/125%/175% DPI,
  negative multi-monitor coordinates, drag/window-motion interaction, and 20
  Mod/builtin switches. Native outer-window ornaments remain optional/open. This
  is desktop-local only; no backend or mobile settings, API, IPC, WS, queue,
  trace, or cross-repository contract was added.

- **Design Mod visual bleed and lifecycle closure (work order 62)** — `partial/open`.
  Contract, transform ownership, active-character diary scope, avatar revision,
  and awaited native teardown are covered by TypeScript/Rust tests. Windows real
  window acceptance remains open: verify transparent Halo pixels, 100%/125%/175%
  DPI, negative multi-monitor coordinates, 30-second Flow/Garden drags, avatar
  mutation refresh, and ten rapid Mod-to-builtin restores. This is a desktop
  local/UI repair only; it adds no backend setting, mobile setting, HTTP route,
  WS message, queue, trace, or cross-repository contract.

- **Design Mod lifecycle and content rect fix (work order 64)** — `partial/open`.
  Scene-node unregister/rebuild and content-rect geometry regression tests are
  covered by TypeScript/Rust tests. Real Windows acceptance remains open for
  transparent Halo pixels, unequal bleed/inset at 100%/125%/175% DPI, negative
  multi-monitor coordinates, and repeated Mod/builtin teardown. This remains a
  desktop-local repair with no backend, mobile, HTTP, WebSocket, or IPC contract.

- **Status subregion renderer and hook scope (work order 65)** — `partial/open`.
  `SubStatus` now portals `mood`, `activity` (including presence), and `timeline`
  (including telemetry) to their registered mounts. The same `--status-*` hook
  values are written to every official child mount, and the pure contract tests
  cover parent ownership, subregions, presenter-only, and presenter-derived hook
  values. The debug fixture now attaches all three Status subregions, so its
  activity/timeline content is not left in the hidden fallback tree. Remaining
  acceptance is real Windows debug verification across default/subregions/
  presenter-only switches, wide/narrow windows, and 100%/125%/175% DPI; this is
  desktop-local UI only and adds no backend, mobile, HTTP, WS, or IPC contract.

- **运行时性能基线与真实窗口验收（工单 60）** — `partial/open`。快照采样、合帧、20Hz 预算、暂停/恢复、诊断节流、头像优先加载、prompt-assets 去重和窗口协调器已接入并通过纯逻辑测试；2026-08-17 已在 Windows debug/175% DPI 验证 fixture 三个 surface 的创建、跟随和暂停销毁，但尚未完成 release resource_dir 的进程私有字节、frame p95、click-to-ack、100%/125% DPI、双屏和 20 次切换实测，记录模板见 `docs/brief-60-runtime-baseline.md`。
- **客户端可见回归与窗口生命周期（工单 61）** — `partial/open`。Ribbon tooltip、桌宠 native 状态回填/重试、Onboarding 检查超时和 Mod payload generation 隔离已通过自动化检查；真实 Windows 窄窗口、DPI、桌宠连续开关、Activity 失败恢复和 20 次切换仍需实窗验收。

> 修复前请先对照代码确认问题仍存在；修复后在本文件改状态或移到已修复区。

---

## 当前仍存在（2026-07-16 清盘后权威清单）

- **支出意向单确认 / 拒绝** — `open`（外部前置）。等后端 Brief 63 冻结鉴权、二次确认和审计契约后实现写入口。
- **v1 WS 协议与用户输入 WS 化** — `post-v0.1`，见 [protocol-v0.md](protocol-v0.md)；v0.1 的 HTTP `/desktop/chat` 是正式契约。
- **花园 harvest / vase 详情与操作** — `post-v0.1`，后端先冻结详情和写接口；见 [release-v0.1.md](release-v0.1.md)。
- **日记 emotion 数据** — `post-v0.1`；客户端已安全判空，见 [release-v0.1.md](release-v0.1.md)。
- **Garden daily lifecycle 端到端体感** — `observe`；需至少一周真实周期记录发言频率和多事件体感。
- **旧客户端迁移状态地图** — `observe`；继续以 `ARCHITECTURE.md` 迁移关系和本文为准。
- **ChatPanel 对账 timer 竞态测试** — `post-v0.1`；下一步把 timer orchestration 抽为纯控制器，用 vitest 假时钟覆盖 WS 先到、timer 先到和 fallback 命中。
- **Dream 期间 Reality park / 退梦 flush 端到端验收** — `open`。当前 `ChatPanel` 已保持挂载，Dream 使用 overlay，静态前置条件已满足；仍需在真实后端连接下于入梦期间注入 Reality `channel_message` + `message_segments`，确认 Dream UI 不显示、退梦只 flush 一次且分段不重复。
- **macOS 客户端首轮真人冒烟** — `open`。Release CI 已配置产出 Universal `.dmg`，但 Windows 开发机无法验证透明置顶桌宠、多窗口、Live2D/WebGL 与实际 Gatekeeper 流程。首个 macOS 包须标注 experimental，并至少确认启动、连接本机后端和聊天收发。macOS sensor 当前固定降级为不可用（`sensor_not_supported_on_macos`），不申请 Accessibility 权限也不上传空数据。
- **可信设计 Mod / native satellite 真实窗口 fixture 验收** — `partial/open`。54/55/56/57/58 的默认高度链、宿主恢复入口、manifest v1/v2、Rust surface 生命周期、能力判定、DPI/负坐标纯逻辑测试和 presenter 生命周期已通过；2026-08-17 在 Windows debug/175% DPI 实测 Halo 透明 click-through、三个 owned surface、move/resize/minimize/restore/close，并修复同步 WebView 创建 deadlock 与 satellite 初始化提前退出。仍需右/顶部 island 的视觉点击/ack、100%/125% DPI、双屏负坐标、20 次 Mod 切换与 release `resource_dir/design-mods`。macOS/Linux surface 仅记录为 experimental，尚无真人验收，不能以逻辑测试替代。

本轮已关闭：TTS 合成播放（后端合成端点、Tauri bridge、聊天/桌宠语音条、场景自动播放与跨窗口顺序播放均已接通）；Panes 历史 TS 条目、backend-integration L213、ChatPanel 三处内联 `15000`、Tauri 模板名、Header 偏好死按钮、system 消息气泡、SubFlow 跨角色单桶。system 样式经现有代码核对已先于本工单修好；关闭证据保留在下方历史快照和 Git 历史。

## 历史快照（已由上方权威清单覆盖）

<details>
<summary>展开查看清盘前的原始条目与修复背景</summary>

## 阻塞：支出意向单确认 / 拒绝仍依赖后端 Brief 63

观测面板已读取 `/spend/mandates` 并展示状态，但后端当前只有 Brief 64 的只读端点，没有经过安全门的
confirm / reject 写接口。客户端明确显示“当前仅只读”，不会通过猜测路由绕过非自主支出边界。待后端
Brief 63 落地并冻结鉴权、二次确认和审计契约后，再补全该验收项。

---

## 已完成：TTS 语音播放（原 post-v0.1）

v0.1 时 TTS 不在发布范围；后续已接通 `/tts/synthesize`、Tauri bridge、聊天与桌宠语音条、场景自动播放，以及跨窗口 FIFO 播放队列。仍需独立进行真人桌面播放验收时，应作为发布验收记录，而不是重新列为实现技术债。

---

## post-v0.1：v1 WS 协议与用户输入 WS 化

v0.1 已正式冻结现有 legacy WS + HTTP `/desktop/chat` 路径，不再把它描述为临时过渡。`assistant_message`、`state_update`、`user_message`、`client_event`、统一 envelope 和 capabilities 均为未排期 roadmap，见 [protocol-v0.md](protocol-v0.md)。

当前 mood/activity 由 `useBackendStatePolling()` 更新：ChatWindow 常驻低频轮询，Sidebar flow/status 打开时叠加高频轮询；presence 仍由本地交互驱动。

---

## 已完成：客户端鉴权配置迁出前端源码

`admin_token` 仅由 Rust 本地配置读取，前端不保存或传递 token；`config/client.local.json` 已被忽略。客户端不再保留 `bot_user_id` 或 `/memory/{uid}/short-term` 兼容读取；ChatPanel 正常历史路径使用 `/chat-log/*`，不依赖 QQ 号。默认 token `CHANGE_ME` 只是不可用占位符。

---

## 已完成：桌面协议权威位置固定

当前正式协议唯一权威是 [protocol-v0.md](protocol-v0.md)，ChatPanel 双路径对账契约见 [chat-correlation.md](chat-correlation.md)。旧 `Emerald-desktop` 中的 v1 文档仅作 post-v0.1 roadmap 参考。

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

**影响**：开发和打包时显示不符合 PresenceKit-desktop。

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

## P2：花园客户端目前是只读状态页，缺 harvest/vase 详情

**位置**：`src/windows/chat/components/SubGarden.tsx`、`src/shared/api/types.ts`

当前 `SubGarden` 已能读 `/garden/state` 并展示五个花槽，但 UI 只消费 `slots`。`harvest_count` / `vase_count` 只在类型里存在，没有展示收获区或花瓶详情；这符合客户端只读边界，浇水及其他写操作不属于玩家入口。

**影响**：后端花园生命周期已经往 harvest/vase 方向推进，但客户端用户只能看到生长槽位，无法理解“开花后去了哪里”。

**建议**：后端若继续只暴露 count，就在 UI 上至少展示计数；如果要完整闭环，可扩展 `/garden/state` 返回 harvest/vase 只读详情，避免为客户端引入玩家写操作。

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

</details>

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
## RPG Dream 客户端（open）

桌面端已完成 capability 门控、入口、双栏 transcript 恢复、回合提交、`RPG_ROUND_BUSY` 原 body 短退避重试和基础 corrections UI；尚未完成真实后端运行态、`RPG_REVISION_CONFLICT` 确认流程和多分辨率窗口验收，仍以后端三仓总账的 open/partial 状态为准。

## Brief 242 设置重整验收（observe）

相关 40 项 Vitest、类型检查、生产构建和 React 浏览器夹具通过；阅读状态保持与角色刷新已验证。真实 Tauri 原生窗口、真实后端保存及手机设备联调尚未完成，不能以夹具 IPC 结果替代。详见 settings-control-audit.md 与后端三仓接口总账。


## 桌面聊天交互修复（2026-09-10，partial）

实现与跨仓边界见 `docs/chat-usability-2026-09-10.md`（本目录中为同名文档）。聊天/上传使用 600 秒总等待与 15 秒连接预算；桌宠创建/销毁采用 async command；子页面懒加载独立 Suspense。
界面新增不透明度、情绪色条/标签开关；附件先暂存后发送，用户与角色均可引用。真实窗口/慢请求验收及历史引用恢复仍 open；跨仓总账同步待后端仓处理。

桌面交互验收更新：222 项前端测试、build、Rust 附件回归及浏览器模拟 IPC 交互通过。真实桌宠/系统剪贴板/慢后端与自绘 Mod、历史引用恢复仍为 partial/open，详见 chat-usability-2026-09-10.md。

## 关闭聊天顶部栏后的启动崩溃（2026-09-10，fixed）

根因：透明度包装器将 headerVisible && JSX 的 false 当成 ReactElement，访问 content.props.style 抛 TypeError，被入口 RoleLoadBoundary 统一显示为本地模块加载失败。
修复：applyChatRegionOpacity 接受 ReactNode，先用 isValidElement 判定；false/null/undefined 原样保留，有效元素再复制样式。保持顶部栏偏好，不清空设置。
验证：4 项回归测试和生产构建通过；真实 Tauri WebView 重载后输入框可见、header 数量 0、错误页数量 0、pageerror 0。浏览器脚本新增 --hidden-header，覆盖保存隐藏顶部栏的启动分支。
跨端：纯桌面渲染修复，沿用原 chat.headerVisible/appearance 偏好；不新增后端管理设置、HTTP/WS/IPC、鉴权、队列、手机/relay 或观测端点。后端总账未修改，跨仓记录同步仍 open。
本修复不改变此前真实慢 OCR、系统剪贴板和桌宠等尚未完成的验收状态。
## 2026-09-11 偏好与自由合成舞台：partial / open

- 已实现：活动/角色设置行统一、当前角色头像裁剪上传、自由合成单窗口视觉小说式舞台。
- 浏览器 IPC mock 验证不能证明真实 Tauri 与后端联调完成；真实 100%/125%/175% DPI、
  多显示器、窗口 hide/restore、旧 Halo 运行会话切换到新版后的销毁、真实头像上传与
  手机群聊头像刷新仍为 open。建议按 `ui-polish-2026-09-11.md` 的 E 项逐项实测。
- 跨仓只读核对：后端 `admin/routers/settings_prompt_assets.py` 使用 persona scope 与
  runtime override → authored default 头像读取顺序；手机 `GroupRosterMember.avatarUrl`
  消费 roster 头像，本次无手机上传设置或 relay 变更。桌面样式和 Design Mod 无后端总开关。
- 后端 `docs/three-repo-interface-catalog.md` 同步为 open：当前授权限本仓，未修改后端仓。
  待同步内容：桌面新增既有角色头像 API 的设置入口，接口/权限未扩展，真实跨端验收未完成。
## 2026-09-11 七项客户端修复验收 — partial/open

群聊隔离、加载占位、思考宽度、窄栏输入、活动偏好、视频视觉和 Live2D 入口的施工与验证
见 `docs/client-fixes-2026-09-11.md`。真实 Tauri 窗口、模型渲染、手机后台 relay 联调及
后端 three-repo-interface-catalog 总账同步仍 open；不将编译/纯逻辑测试作为完整验收。

### 桌宠分段（2026-09-12，partial/open）
换行队列、重投去重、贴纸首段规则已实现并有纯逻辑回归。
open：真实 Tauri 分段停留、TTS 时长与切换角色后的队列清理体验待验证。

### 工具链与动作旁白（2026-09-12，partial/open）
代码、构建、纯逻辑和浏览器夹具通过，见 tool-activity-2026-09-12.md。
open：真实后端重启/Tauri 联调；手机工具链 roadmap；仅近期 30 条保留工具状态，更早回退动作旁白。


## 按需截图三端接入（2026-09-12，partial）

详见仓库 `docs/screen-observation-2026-09-12.md`。后端 `observe_user_screen` 通过独立 HTTP poll/result 请求活跃电脑或手机的新截图，UUID/凭据绑定、20 秒 TTL、30 秒设备新鲜度和本地授权均参与门控；图像只在内存中处理。

管理面提供全局开关、effective state 与 `/perception/screen/status` 无正文观测；电脑视觉观察页、手机系统配置页各有独立本地授权，默认关闭。全局开启时自主工具继承启用，显式工具禁用优先；角色消息继续走原通知/免打扰链路。桌面 IPC 新增可选 onDemandEnabled；手机使用专用 screen_observation 通道与无障碍 worker，不改 mobile poll/ack/relay。

实现及构建/定向测试通过，真实双设备、锁屏、OEM 后台及 VLM/消息联合验收保持 open。管理面既有国际化测试 3 项失败保持 open，详见施工记录，不能将静态检查作为真实设备验收。

## 截图设置位置与样式修正（2026-09-12，partial）

手机按需截图开关移到 SettingsPage 的系统配置分组，复用 SettingsRow + Switch；能力权限页仅显示 CapabilityRow 状态标记，不再显示灰色禁用开关。系统配置中的权限操作子页不重复放置截图开关。桌面按需截图使用与“允许视觉观察”一致的左侧标题/说明、右侧滑动开关布局。两端 AGENTS.md 已写入复用周围 UI 风格约定，手机额外明确设置与权限观测边界。

三面检查：后端管理开关、effective state、观测端点、截图请求/TTL/去重和原生授权闸门不变。本次仅移动本机设置入口和统一控件；手机可先保存本地授权，实际截图仍须 Android 11+、无障碍及未锁屏。真实手机更新安装后的交互验收仍 open。

## Admin visual decisions (2026-09-12, observe)

Backend admin static styling and configuration disclosure were verified in Chromium using synthetic APIs. Native admin bridge container and physical mobile validation remain observe; no native UI or IPC changed. Full request/queue/send/ack tracing remains roadmap in backend docs/admin-design-implementation.md and docs/three-repo-interface-catalog.md.
