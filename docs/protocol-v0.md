# PresenceKit-desktop 协议 v0.1

## Conversation calendar (2026-09-12)

Current: GET /chat-log/stats/calendar requires memory.read + state.read. All four metrics are scoped to owner + character; period=day/week/month/year with date, or start/end (up to 366 days). Missing history is null, never zero. Coverage and totals_partial disclose incomplete data. See backend docs/conversation-calendar.md.
Roadmap: native desktop/mobile heatmap and day detail UI. Observe: real provider streaming usage and independent automation transport coverage. Existing history, WS/poll/ack/TTL remain unchanged.

## Brief 244：思考读取与消息标识（2026-09-11）

本单不新增/修改 WS 帧、正文、ack、TTL 或去重规则。HTTP /desktop/chat 的 canonical
turn_id 用于 GET /chat/turns/{turn_id}/reasoning（memory.read）；HTTP msg_id 只与
WS channel_message/message_segments/message_stream_* 的传输 ID 对账。
流式 msg_id 可以不同于 turn_id，禁止互换或按时间/内容猜测。当前 WS 未传 canonical
turn_id，因此 WS-only 消费端无明确关联时不展示入口。当前历史接口解析器也未返回已有日志
的 turn_id，恢复问题留后端工单。本仓只按显式字段为每次回复显示一个旁白入口；
具体 IPC 与降级见 backend-integration.md。


MCP 调用仍只在后端执行；桌面端只能收到不含远端工具细节的本地瞬态状态。

本文件是本仓与 `Emerald-presence` 当前桌面通信协议的单一权威。v0.1 将现有 legacy 协议冻结为正式协议：不实现 v1，不协商 capabilities，不允许任一端单边新增 action。

## 连接

端点默认是 `ws://127.0.0.1:8080/ws/desktop`。连接由 Tauri Rust bridge 建立，并以 Bearer header 鉴权；token 不进入 URL 或 WebView。后端每 20 秒发送 `ping`，超过约 70 秒未收到 `pong` 时断开；客户端收到 `ping` 即回复 `pong`，60 秒无入站消息时主动重连，退避上限 30 秒。认证失败不自动重连。

## WebSocket 消息全集

| 类型 | 方向 | 字段 | ack |
|---|---|---|---|
| `hello` | C→S | `client: string`、`version: string` | 无 |
| `hello_ack` | S→C | `server_version: string` | 无 |
| `channel_message` | S→C | `content`、`msg_id`；可选 `source`、`char_id`、`round_id` | 客户端立即回 `ack ok:true` |
| `message_segments` | S→C | `content`、`segments`、`msg_id`；可选 `source`、`char_id` | 无；只更新已有气泡 |
| `action` | S→C | `action`、`msg_id` | 执行完成后回 ack/nack |
| `ack` | C→S | `msg_id`、`ok`；失败可带 `error` | 无 |
| `ping` / `pong` | S→C / C→S | 无额外字段 | 无 |
| `message_stream_start` | S→C | `msg_id`；可选 `source`、`char_id`、`round_id` | 无 |
| `message_stream_delta` | S→C | `msg_id`、`delta` | 无 |
| `message_stream_end` | S→C | `msg_id` | 无 |
| `group_round_start` / `group_round_end` | S→C | `round_id`、`group_id` | 无 |
| `tool_status` | S→C | `status_id`、`kind`、`label`、`index`、`total`、`attempt`、`ttl_ms` | 无 |

`msg_id` 是不透明的非空字符串关联键。客户端不得把它解析为时间戳或数字，也不得依赖长度；
服务端保证自动生成的 ID 在同一进程内唯一。流式帧、canonical 消息与对应 ack 需要关联同一
对象时必须复用同一个 `msg_id`，不同并发 action 必须使用不同 ID。

`segments[]` 为 `{ type, text, perform? }`。`type` 是 `say | do | env | feel | narration`；`perform` 可选包含 `expression`、`intensity`、`head`、`posture`、`gaze`、`energy`，未知或非法字段忽略。

`tool_status` 仅覆盖侧栏“动向”NOW，不创建聊天气泡、不追加 timeline，也不写入 localStorage 或 `uiPreferences`。`ttl_ms` 从客户端接收时刻开始计算，过期事件直接丢弃、重连后不重放。相同 `status_id` 原位更新 `queued → waiting → terminal`；不同调用在本地串行展示，每项至少展示 1 秒。`pending_confirmation` 不显示在 NOW，确认交互仍由既有聊天流程承担。`label` 只能是后端本地 policy 配置的展示名；载荷不得包含远端工具名、description、参数或结果。旧客户端忽略未知类型即可。

## Desktop action allowlist

v0.1 只允许以下 9 类：

| action | 主要参数 | 客户端行为 |
|---|---|---|
| `minimize_window` | 无 | 最小化当前窗口 |
| `open_url` | `url` | 打开受支持 URL |
| `show_notify` | `text`，可选 `title` | 显示通知 fallback |
| `media_play_pause` | 无 | 播放/暂停媒体 |
| `play_netease` | `song_id` | 播放网易云歌曲 |
| `dream_invite` | 无 | 打开 Dream UI |
| `toy_invite` | 无 | 玩耍模式开启时打开 Toy UI |
| `presence_nag` | `text`，可选 `avatar` | 偏好开启时显示单实例提醒 |
| `avatar_directive` | 表情/注视/手势字段 | 由 avatar directive 订阅层消费 |

动作名兼容 `action_type` 与 `type`，参数优先从 `params` 读取，再兼容顶层字段。缺少动作名、参数无效、执行失败或未知 action 均不得静默成功，必须回复 `ack { msg_id, ok:false, error }`。v0.1 不新增 action 类型。

## HTTP 发送与 WS 回复

旧 HTTP Dream/活动动画也复用 message_stream_*：start 可带 char_id 而无 domain/round_id，
传输层 source=reality 不能证明它属于现实。现实 UI 拒绝这种未定域的角色动画；
若 start 带 char_id，必须显式 domain=reality 并匹配当前角色才可接收，群聊轮次仍排除。
delta/end 仅按已接收 start 的 msg_id 处理；不修改 wire 字段、ack 或 canonical 接收规则。

`POST /desktop/chat` 是 v0.1 正式发送路径，不是过渡态。assistant 回复可能先从 HTTP 响应到达，也可能从 WS `channel_message` 到达；同一回复的 HTTP `msg_id` 与 WS `channel_message.msg_id` / `message_segments.msg_id` 对齐。流式传输 ID 可能不同于 canonical `turn_id`，不得互换。

ChatPanel 以 WS 为主路径、HTTP 为延时 fallback；精确去重、早到 segments、TTL 与容量上限见 [chat-correlation.md](chat-correlation.md)。

## v1 roadmap（post-v0.1，未排期，双端未实现）

| 目标 | 方向 | 状态 |
|---|---|---|
| `assistant_message` 替代 `channel_message` | S→C | 未实现 |
| `state_update` | S→C | 未实现 |
| `user_message` | C→S | 未实现 |
| `client_event` | C→S | 未实现 |
| `v/ts/payload` envelope | 双向 | 未实现 |
| hello capabilities | C→S | 未实现 |

## 工具链与动作旁白（2026-09-12，partial）
新增 tool_activity WS 展示事件；字段为 event_id、chain_id、char_id、source=reality、
origin=chat|autonomy、tool_name、status、ts。status 为 running/success/error/unknown/pending_confirmation。
无 ack、不进发言/TTS、不携带参数结果；ChatPanel 按角色过滤、按调用去重、同链连接。
历史 /chat-log 增加可选 entry_kind=narration 和 tool_activity；近期工具回执复用既有 30 条 action_trace，
与同 event_id 旧旁白对账。设置 chat.toolActivityVisible 仅控制本地展示，默认 true。
实现、验证及原生/手机 open 边界见 docs/tool-activity-2026-09-12.md（本文在 docs 时为同目录）。


## 按需截图三端接入（2026-09-12，partial）

详见仓库 `docs/screen-observation-2026-09-12.md`。后端 `observe_user_screen` 通过独立 HTTP poll/result 请求活跃电脑或手机的新截图，UUID/凭据绑定、20 秒 TTL、30 秒设备新鲜度和本地授权均参与门控；图像只在内存中处理。

管理面提供全局开关、effective state 与 `/perception/screen/status` 无正文观测；电脑视觉观察页、手机系统配置页各有独立本地授权，默认关闭。全局开启时自主工具继承启用，显式工具禁用优先；角色消息继续走原通知/免打扰链路。桌面 IPC 新增可选 onDemandEnabled；手机使用专用 screen_observation 通道与无障碍 worker，不改 mobile poll/ack/relay。

实现及构建/定向测试通过，真实双设备、锁屏、OEM 后台及 VLM/消息联合验收保持 open。管理面既有国际化测试 3 项失败保持 open，详见施工记录，不能将静态检查作为真实设备验收。
