# ChatPanel 回复对账契约（v0.1）

`/desktop/chat` 的 HTTP 响应与 WebSocket `channel_message` 是同一 assistant 回复的两条到达路径。正常路径以 WS 为准；HTTP 仅在 WS 未到达时兜底渲染。

```text
HTTP reply → 登记 3s fallback timer ── WS channel_message 到达 → 取消 timer、渲染 WS
                                  └── timer 到期 → 渲染 HTTP fallback → 后到 WS 仅关联 msg_id
message_segments 先到 → 停靠 ── channel_message 到达 → 领取并就地更新气泡
```

| 机制 | 目的 | 时限/上限 |
|---|---|---|
| pending segments | `message_segments` 早到停靠；绝不单独创建气泡 | 5 分钟、50 条 |
| wake fallback | `desktopWake` HTTP 回复在 WS 缺席时兜底 | 5 秒 timer |
| send/upload fallback | 聊天或上传 HTTP 回复在 WS 缺席时兜底 | 3 秒 timer |
| rendered fallbacks | HTTP 已渲染后，后到 WS 仅补关联，避免双气泡 | 15 秒 |
| WS msg-id mapping | `msg_id` 到本地 bubble id，供 segments/重复 WS 去重 | 最近 200 条 |

匹配优先级为 `msg_id`；旧后端或异常 HTTP 响应无 `msg_id` 时，使用规范化内容 hash。重复 `channel_message` 必须跳过；paragraph 数不一致时仅附加 segments，不覆盖原文。

## 2026-09-17：HTTP 兜底生命周期收口（partial）

ChatReplyFallbacks 按本地请求 ID 持有 send/upload 定时器，wake 仍独立。并行发送互不等待；
canonical 只结算精确 msg_id，或在仅一条无 ID 且允许 hash 时使用兼容匹配。重叠请求关闭 hash
归属。ChatPanel 的单个 queueHttpReply adapter 负责判断已渲染/stream 替换/首次追加。
不改变 3 秒/5 秒等待、通知、TTS 或消息分段语义。

httpReplyIdentity 是明确命名的绑定 helper，不是完整状态机。普通发送、附件和 wake 都绑定显式
canonical turn_id；WS 先到时补到已有分段，HTTP 先到时供后续呈现读取。仅 msg_id 不生成思考身份。
附件 fallback 现在保留 canonical ID；wake 有明确 ID 时也保留。只有文件卡无正文时仍分配真实本地气泡 ID。

本地并行请求槽和 waiting 派生已接入 ChatPanel；空 `message_stream_start` 在
首个可见段到达前保持等待气泡，但主聊天链跳过/失败导致 HTTP 空回复或请求结算后
会立刻丢掉无主空流等待。无本地请求的主动空流仍以 8 秒为上限，避免永远转圈。
仍未完成全链路 reconciler、history/stream/canonical 唯一身份注册与旧 hash 退役。
显示顺序仍按到达时间追加，未另做重排。
带 canonical ID 的历史当前仍参与旧 hash 兼容；不能声称不同同文回复已得到完整隔离。
Legacy turn-only HTTP 仍保留原 responseMsgId 兼容，不把该传输别名当成新增 canonical 来源。
完整请求归属等待 9.17 后端交接契约，客户端不猜造 request_id。

回归：chatReplyFallbacks.test.ts 覆盖各 HTTP 来源、canonical 取消、fallback-first、旧回包/重试替换、
独立 wake、legacy 匹配、卸载清理；httpReplyIdentity.test.ts 覆盖 HTTP/WS/stream/fallback 顺序与不同 ID。
这些测试覆盖已提取部分，不冒充完整 ChatPanel 全事件排列证明。

历史 turn_id 已改为独立有界 registry，不再预先当成 transport msg_id。HTTP 显式别名可复用历史分段，
清除对应临时流和延迟追加；已知新 canonical turn 优先于同文 hash。没有 canonical 关联的旧 WS
仍使用兼容 hash，完整跨端归属仍 open。浏览器新增七个顺序场景通过，包含晚 WS/重放与 stream fallback。
