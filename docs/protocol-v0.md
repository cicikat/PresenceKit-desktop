# PresenceKit-desktop 协议 v0.1

本文件是本仓与 `Emerald-presence` 当前桌面通信协议的单一权威。v0.1 将现有 legacy 协议冻结为正式协议：不实现 v1，不协商 capabilities，不允许任一端单边新增 action。

## 连接

端点默认是 `ws://127.0.0.1:8080/ws/desktop`。连接由 Tauri Rust bridge 建立，并以 Bearer header 鉴权；token 不进入 URL 或 WebView。后端每 30 秒发送 `ping`，客户端回复 `pong`；客户端 60 秒无入站消息时重连，退避上限 30 秒。认证失败不自动重连。

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

`segments[]` 为 `{ type, text, perform? }`。`type` 是 `say | do | env | feel | narration`；`perform` 可选包含 `expression`、`intensity`、`head`、`posture`、`gaze`、`energy`，未知或非法字段忽略。

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

`POST /desktop/chat` 是 v0.1 正式发送路径，不是过渡态。assistant 回复可能先从 HTTP 响应到达，也可能从 WS `channel_message` 到达；同一回复的 HTTP `turn_id` / `msg_id` 与 WS `channel_message.msg_id` / `message_segments.msg_id` 对齐。

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