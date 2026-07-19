# Brief 38 · DreamWindow 群模式（梦境群聊）

> 前置：presence Brief 100 §3 契约（端点 / WS domain 字段 / state·settings shape）。
> 契约已在 Brief 100 冻结并抄录于本单附录，可先行开工，联调等后端就绪。
> UI 原则：与单人梦境窗**同一套组件族**扩展，不另起一套群梦 UI。
> 注意：仓库可能有其他 agent 并行施工，只改本单相关文件。

## 施工项

### 1. API 层

- `src/shared/api/dream.ts`：新增群作用域方法
  `dreamGroupEnter / dreamGroupChat / dreamGroupExit / dreamGroupGetState /
  dreamGroupGetSettings / dreamGroupUpdateSettings(group_id, …)`，
  以及 `dreamListPresets()`（`GET /dream/presets`）。
- `src/shared/api/dream-types.ts`：state 类型扩展——`char_tension` 从单值改为
  `Record<string, number>` 的群变体、新增 `roster: string[]`；settings 类型加
  `jailbreak_presets: string[]` 与 `per_char: Record<string, {jailbreak_presets: string[]}>`。
- Rust bridge（`src-tauri/src/lib.rs`）：按现有 `dream_*` command 模式补群作用域
  command；参数只多一个 `group_id`。

### 2. 入口与路由

- `GroupChatPanel` 加「入梦」入口 → 打开 DreamWindow 群模式（携带 `group_id`）。
- DreamWindow 增加 mode 参数（single | group）；group 模式下所有 API 调用走群作用域，
  状态轮询节奏沿用单人（8s）。
- WS：`group_round_start/end` 的 `domain === "dream"` 帧路由到梦境窗；
  `message_stream_* / channel_message`（带 `char_id`/`round_id`）在群梦模式下由
  DreamChatPanel 消费，复用现有伪流式回放逻辑。

### 3. 组件适配

- `DreamChatPanel`：speaker-aware 气泡——按 `char_id` 署名/分色；用户气泡不变。
- `DreamStatusSidebar`：张力显示改为按角色列表（roster × char_tension 映射）；
  body_state 面板不变（全群共享一份）。
- `DreamControlBar`：WAKE / Esc 硬退出改调群 exit（群模式无软挽留，直接硬退，
  不出现挽留 UI 分支）。
- `DreamPrefsPane` 群模式页：全局世界选择（复用 `/dream/worlds` 列表）、
  `enable_dream_lorebook`、`boundary_level`、**per-char 破限选择器**
  （roster 逐角色多选，选项来自 `dreamListPresets()`；留空 = 跟随群默认）。
  单人模式页零回归。
- 现实群聊窗：`blocks_chat` 为真时锁定输入并提示（区分 dreaming / cooldown 文案）。
- 本地外观设置（字号/主题/背景）沿用单人梦境窗既有逻辑，只存客户端。

### 4. i18n

- 全部新文案走 `src/shared/i18n/` 语义 key（zh/en 双份），禁止组件内写死中文；
  不进 `legacy.ts`。

## 附录：后端契约摘要（以 presence Brief 100 §3 为准）

- `POST /group/{id}/dream/enter | exit`；`POST /group/{id}/dream/send` → `{round_id, status}`；
  `GET /group/{id}/dream/state`（单人 shape + `char_tension` 映射 + `roster`）；
  `GET/PATCH /group/{id}/dream/settings`；`GET /dream/presets`。
- settings body：
  `{ world_layer, enable_dream_lorebook, boundary_level, jailbreak_presets, per_char }`。
- 群梦期间现实回合（含 reality 群 send）后端 409；enter 冲突也 409，前端要有
  可理解的错误提示（i18n）。

## 验收

- 双角色以上群：入梦 → 多轮对话（气泡署名正确、伪流式正常、round 帧路由正确）→
  Esc 硬退全链路通。
- Prefs 群模式：世界/世界书/边界/per-char 破限保存后 GET 往返一致；留空回退群默认。
- 群梦期间现实群聊窗锁定并提示；出梦后解锁。
- 单人梦境窗全功能零回归；新文案 i18n 检查通过（无写死中文）。
