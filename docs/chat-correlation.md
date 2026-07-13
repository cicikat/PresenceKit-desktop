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
