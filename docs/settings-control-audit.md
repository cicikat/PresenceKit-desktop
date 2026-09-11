# 设置与功能开关审计（P0–P2）


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


## API 思考存档与展示（Brief 244，2026-09-11，partial）

后端默认归档实际返回的思考；thinking.enabled 仍仅控制生成，管理面独立维护。
桌面 Reality 每次回复前有一个居中“展开思考”旁白入口，默认收起、点击加载。
设置 → 角色与对话 → 显示思考入口，本地 chat.reasoningVisible 默认 true，经 uiPreferences
持久化。关闭只隐藏入口，卸载面板，阻止新增读取；不编辑生成策略、归档、effective state 或权限。
展开只展示动态角色名与正文，隐藏模型/调用/来源/协议字段。
GET /chat/turns/{turn_id}/reasoning 要求 memory.read；标准 desktop/mobile profile 已含。
401 沿用连接门禁，403 提示缺少权限；不升级 admin 凭据。管理员全局归档接口保持独立。
手机 lib/models/app_models.dart 已独立保存 canonical turnId，但尚无 reasoning 展开 UI；
手机实现与真机验收为 roadmap，poll/ack、后台服务、relay、TTL 和通知未改。
详情、验收和跨仓总账待同步项见 brief-244-reasoning.md。

## 桌面偏好归类（2026-07-30）

本次仅调整信息架构，存储 key、后端 API 和 Tauri command 均不变。

| 偏好内容 | Chat 分类 |
|---|---|
| Signal-first autonomy lifecycle | Backend-owned; the client does not create or send proactive messages. Redacted observation is available at `GET /observability/autonomy-opportunities`; prompt snapshots remain admin-only. |

The backend admin control center exposes `GET /admin/control-center/effective-state` as the
authoritative global overview for configured versus runtime-effective values. The desktop client
does not consume this admin-only projection or infer Tool Loop, MCP, scheduler, autonomy, TTS,
Embedding, channel, model-routing, or frozen Intiface state from its local settings; it continues
to use only the persona-scoped settings and runtime endpoints documented below.
| 语言、后端连接 | 常规 |
| 全局 / 角色模型路由、思考、输出分段 | 模型 |
| 桌面 TTS、Tool loop、视觉感知、电脑操作安全 | 能力与权限 |
| 主题、布局、字体、背景、颜色、头像 | 界面 |
| Prompt Assets、对话模式、Presence Nag、主动间隔 | 角色与对话 |
| 经期日期（查看、保存、清除） | 角色与对话 |
| 桌宠、玩耍模式、视频通话、Coplay | 桌宠与互动 |

电脑操作安全不再出现在 Activity 偏好。Chat 和 Activity 中的日间 / 夜间主题入口是有意保留的便利入口，二者均由同一 theme registry 状态驱动。

> 2026-07-13 实装后的事实清单。本文只描述当前可操作入口，不把“后端存在配置字段”写成“客户端已经支持”。

## 桌面设置（persona token 可用）

| 功能 | 入口 | 当前能力 |
|---|---|---|
| 后端地址 / WS / token | 设置 → 系统 | 修改本机 `config/client.local.json`；token 不回显 |
| 对话 mode / style / 多消息 | 设置 → 对话 | 即时写后端配置 |
| 模型路由 | 设置 → 系统 → 模型路由 | 只能在管理员预建的 routing profile 之间切换；不下发 API key 或 base URL |
| 角色 · 模型绑定 | 设置 → 系统 → 角色 · 模型绑定 | 按角色单独绑定 routing profile（不是裸 preset）；“跟随全局”发送 `null` 并明确展示当前全局 profile/chat，profile 列表中的 `default` 仍是固定绑定；行内展示解析后的 `resolved_chat_preset`；清除即回到全局默认；旧后端无 Brief 87 API 时区块整体隐藏 |
| TTS 桌面语音条 | 设置 → 系统 → 桌面语音 | 独立总开关；聊天与桌宠气泡显示可播放语音条，可展开/收起文字；下方控制聊天与桌宠的自动播放，收到回复后并行合成，并在所有桌面窗口间按消息顺序逐条播放 |
| Tool loop | 设置 → 系统 | 总开关、步数、总超时、允许类别、排除工具 |
| Thinking | 设置 → 系统 | 总开关、模式、主动消息、独白 token 上限 |
| 生成后段落兜底 | 设置 → 系统 | 默认关闭；热切换长篇单段回复的发送前空行兜底，当前阈值只读展示 |
| Garden | Sidebar → 花园 | 只读状态展示和刷新；收获/花瓶仅显示计数，写操作仅供角色内部工具或后端受控状态机 |

## 管理面板（admin token）

- 图片上传用途和 OCR 连接由后端模型路由页 `GET/PUT /image-recognition` 管理。
  默认通用视觉；OCR 使用独立连接，显式选择 GLM Layout Parsing 完整 Endpoint 或
  OpenAI Chat Completions Base URL。密钥、地址和协议不下发桌面或手机。
  两端继续消费 `/upload/ingest`，手机/电脑自动化仍继承通用视觉。
  真实 GLM 服务和实体设备上传验收为 `observe`，详见后端三仓接口总账。

- 模型路由支持从 legacy `llm` 一键初始化 `model_presets`，之后可维护 preset、密钥、URL、模型、`api_protocol`（`chat_completions` / `responses`）与 routing profile。管理面重命名 preset 时会自动更新所有 routing profile 引用并热重载。profile 内的 `sensor_judge` 与 `scenario_reconcile` 是后端后台 category，分别用于传感器裁决与 Dream 发送后的语义校准（缺失时兼容回退 `intent → chat`），桌面端不单独展示或编辑其超时、重试和断路器策略。协议字段只由后端管理面配置；桌面端仍只选择既有 routing profile，不下发 API key、URL 或协议配置。
- 代理、上下文轮数、legacy LLM 参数和视觉模型不再是假只读镜像，保存后热重载。
- TTS 管理配置含服务端总开关、桌面语音条开关、情绪分档、服务 URL、参考音频/文本与语速；provider 的选择、参数和试听只在后端管理面处理。桌面端只调用 `/settings/tts-desktop`、`/settings/tts-auto-play` 和 `/tts/synthesize`，不读取 provider 配置或密钥；兼容层仍返回 `{audio_b64, mime}`。
- 表情包由后端管理面经 `GET/PUT /sticker-config` 管理总开关与 0–1 触发概率；它不是桌面客户端设置项，关闭后后端不会向任一通道发送或广播表情包。
- 系统状态页的 Feature switches 使用后端白名单，仅开放已有运行时消费者的布尔开关：视觉感知、支出、练习、行为痕迹、意图反射、MCP、文件只读访问、防坍缩、陪玩部署、玩具自主生长、自主联网搜索、表演映射。

## 有意保留的边界（不要误导后续 Agent）

- 桌面端不创建/编辑模型 preset，也不接触 API key；一次录入密钥和 URL 后，通过 routing profile 切换模型，无需重复编辑本机 config。
- 角色 · 模型绑定不做 profile 的编辑/新建（那是 config 层），界面只做绑定；绑定对象是整套 routing profile（category→preset 映射），不是裸 preset。
- `embedding` 没有可靠的单一 `enabled` 消费字段，是否启用仍由完整 provider 配置决定，因此未伪造无效开关。
- MCP server 列表现由后端管理面专用 MCP 页管理：可先测试 Streamable HTTP URL，再导入、启停和勾选工具白名单；HTTP headers 支持环境变量占位符且不回显字面 token。桌面端不代理这类 admin 配置或密钥。`fs_access.allow_roots`、支出额度/白名单等其他复杂或高风险字段仍应走专用管理界面或配置文件；通用功能开关 API 不接受这些字段。
- 键鼠/焦点 sensor 的本机采集参数需要 Rust 进程生命周期协调，改动仍需编辑本机配置并重启客户端。视觉观察是例外：它仅控制本地 opt-in 与采样间隔，Tauri runtime 原子更新且立即生效；每次截图前仍必须由后端 `/perception/visual/config` 预检，桌面 UI 不读取视觉模型配置、地址或密钥。
- scheduler 的管理页同时提供运行状态、手动触发和配置表单；可调总开关、主要触发器、owner、提醒间隔、主动消息间隔与签名。
- relay 已有专用管理卡片；token 只打码回显，留空保存时保留原值。

## 降级路径

1. TTS：关闭“桌面语音条”只回退为文字消息，不影响后端总 TTS 配置。
2. Tool loop：关闭总开关，回退到单次普通回复；当前 preset 不支持 function calling 时 UI 会锁定并解释原因。
3. Thinking：关闭总开关；`auto` 在原生 reasoning 不可用时回退到前置独白。
4. 模型：切回管理员预建的稳定 routing profile；legacy 首次迁移可由管理员一键初始化，不要求桌面重新填写密钥。
4b. 角色 · 模型绑定：清除某角色的绑定即回落全局 `active_routing`；后端不支持 Brief 87 API（旧版本）时前端整段隐藏，不报错。
5. 生成后段落兜底：关闭开关后不再插入空行，直接显示后端清理后的模型原文；不会改写短期记忆。
6. 高级功能：管理面板逐项关闭对应白名单开关；不会连带清除已有配置。
## Brief 171 diary sync

The General preferences page exposes an explicit directory picker and manual
sync action for the user's Obsidian diary. The chosen directory and local
manifest are desktop-local configuration only. No diary path is returned by a
Tauri command or sent to the backend; the backend receives bounded dated
entries through the scoped diary integration endpoint.

## Brief 194: admin panel native entry

Preferences -> General -> Connection provides an "Open admin panel" command
and local-bridge status. It is not a settings switch and does not mirror or
modify any backend configuration. The Tauri process owns the loopback bridge;
the system browser only sees a short-lived capability URL and continues to use
the normal scoped-token login flow. Mobile has no equivalent entry and remains
dependent on its own VPN, DIRECT/PAC, or working system network path.

## Preset forced streaming compatibility (2026-09-09)

The backend admin Preset editor owns force_stream (default false, Chat Completions only) for generation and tool decisions. Desktop keeps selecting backend routing profiles with no additional setting or permission. Mobile still receives complete HTTP JSON. Browser and real gateway verification remain observe in the backend interface catalog.


## Model probe diagnostics (2026-09-11)

Admin-only preset test now uses 256 output tokens, a 30-second total budget and zero SDK retries. It returns category, safe error/hint, HTTP status, error type, declared protocol and request path. Provider bodies and credentials are never echoed; UI uses textContent. Empty visible output is a warning rather than evidence of working conversation. Network/TLS/timeout, authentication, quota, endpoint/model, rejected parameters and response schema are distinguished.

Validation: 69 related tests passed; cache-cleared Chromium Model Routing test rendered quota/protocol/status guidance. Live bounded probes succeeded for the configured Grok Responses and Gemini Chat Completions presets; another relay returned HTTP 403 INSUFFICIENT_BALANCE. No protocol/routing setting was changed. This is unrelated to desktop/device WS protocols. Native clients continue to open the backend management UI; no new local settings or secrets.


## Proactive history and inline display (2026-09-11)

current: talk_owner stamps the trigger write envelope; autonomy is conversational. The existing capture/slow pipeline records assistant-only history and trigger-aware memory with existing provenance. No candidate signal is represented as a user message. New trigger event-log blocks have timestamps and the reader handles assistant-only entries and canonical turn_id. The canonical ledger keeps inline display markup separately from sanitized memory text. /chat-log/{date} adds optional assistant_display_text by scope and turn ID; desktop replays it through the existing inline renderer with plain-text fallback. No new store, scope, notification or ack policy.

Validation: 48 related regressions plus 3 focused persistence/reload tests passed; desktop TypeScript and production build passed. observe: native desktop restart/phone rendering has not been tested; mobile optional styled history consumption remains roadmap. Historical stripped styles and previously unrecorded proactive messages cannot be reconstructed.


## Life records v1 backend (2026-09-11)

current: /life-records capabilities/sync/list/detail/observability are implemented with dedicated life_records scope (mobile profile), transactional images/jobs/receipts, revisions/tombstones, bounded snapshot pagination, asynchronous OCR/vision, correction locks and owner-only read_life_records tool. Admin Service Configuration owns switches, effective recognition, task/device/audit observation and failed-task retry. See backend docs/life-records.md and brief 245. No changes to chat/poll/ack, notifications or payment.

observe: physical phone/network/Doze and live image-model end-to-end validation remain open. Backend tests include atomic retry, edits versus recognition, deletion, scopes, decimals, snapshot pagination and worker recovery; 72 initial scope/store tests and 39 focused/mobile regressions passed. Android LifeRecords/security/credential targeted task succeeded (cached unit-test output). Admin browser hard refresh used real isolated API. Desktop native record UI and original-image refetch remain roadmap.


## XHS reader deployment (2026-09-11)

Backend-owned settings remain authoritative; no client credentials or local switches were added. Docker login and a user-provided share were verified with body text, one WebP image description and ten sampled comments. The adapter supports xhslink.cn and returns busy/cooldown_seconds in its settings projection. Reads are serialized with a 15-25 second cooldown and five-minute backoff on login/rate rejection. Native chat verification and loading the new code in the running backend remain observe.
