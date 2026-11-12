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
该阶段的完整请求归属曾等待后端交接；当前稳定 request_id 的恢复路径见下方 307 契约，旧响应仍不猜造归属。

回归：chatReplyFallbacks.test.ts 覆盖各 HTTP 来源、canonical 取消、fallback-first、旧回包/重试替换、
独立 wake、legacy 匹配、卸载清理；httpReplyIdentity.test.ts 覆盖 HTTP/WS/stream/fallback 顺序与不同 ID。
这些测试覆盖已提取部分，不冒充完整 ChatPanel 全事件排列证明。

历史 turn_id 已改为独立有界 registry，不再预先当成 transport msg_id。HTTP 显式别名可复用历史分段，
清除对应临时流和延迟追加；已知新 canonical turn 优先于同文 hash。没有 canonical 关联的旧 WS
仍使用兼容 hash，完整跨端归属仍 open。浏览器新增七个顺序场景通过，包含晚 WS/重放与 stream fallback。

## 2026-11-12：307 执行状态与正文恢复

`chatReconciliation.ts` 分开维护服务器执行状态与正文可用性。执行状态为 sending、processing
（回执 running）、completed、failed、interrupted_unknown、not_executed 或 unknown；正文状态为
rendered、recoverable 或 unavailable。completed 不等于正文已显示，rendered 不被晚到 HTTP 或查询降级。

- completed 缺 result、正文为空或结果校验失败：显示「请求已执行，但回复暂时无法恢复」，保留
  request_id 和可用的 msg_id/turn_id；不显示重试。查看结果仅查询原回执并刷新只读历史。
- 有效 result 继续经过 safeChatPrefix、request_id 和 canonical ID 一致性校验，复用 HTTP fallback。
  WS 或历史已呈现同一稳定身份时只补绑定，不追加重复气泡。历史恢复按显式 turn_id，不能用同文推断执行成功。
- failed、interrupted_unknown、unknown、回执缺失或查询失败都不自动重发；只有明确 not_executed
  且仍有本地草稿时，用户才可显式用新 ID 重试。已恢复正文后删除未结算记录。
- 未结算 ID 按后端地址与角色隔离，只存 ID，不存正文或凭据；兼容读取旧版仅按后端地址存储的记录。
  切换角色或保存连接配置时取消旧观察并重挂载 ChatPanel，迟到查询不能应用到新上下文。

`chatReceiptPolling.ts` 集中持有查询生命周期：立即只读查询后按 1、2、4、8 秒退避，带 ±15% jitter，
最多每 15 秒一次；单次自动观察最多 90 秒，且请求年龄不超过 12 分钟（原 POST 最长等待 10 分钟）。
独立截止计时器也覆盖挂起的 GET；到期显示「执行状态待确认」，停止自动查询并忽略迟到结果。
completed/failed/not_executed/interrupted_unknown 或完整 canonical 回复到达后停止自动查询。
手动查看最多执行一次查询，并受 90 秒截止约束；同一观察内不并发查询。

API 层按 scope/request_id 合并在途 GET；支持 Web Locks 时，其他 WebView 已持锁则跳过本次读取，
后续仍可查询。不支持 Web Locks 的旧 WebView 仅保证单 WebView 内合并，跨窗口协调仍是降级边界。
卸载及上下文切换清除 timer 并使在途结果失效，不承诺取消已发出的底层 HTTP。

回归证据（2026-11-12）：全量 Vitest 115 文件 / 638 项通过；TypeScript、生产构建与 Rust cargo check
通过。`node scripts/chat-recovery-browser.mjs` 使用真实 ChatPanel、模拟 Tauri/WS 外部边界，覆盖
无正文完成、历史/WS 单气泡、回执正文恢复、协议拒绝、终态不重试、晚到 HTTP、只读查看及后端切换。
撤销历史关联 Map 的快照迭代会在查看结果时卡住；恢复快照后浏览器回归通过。挂起 GET 的独立截止测试
在修复前失败、修复后通过。真实 Windows/Tauri 断网、快速重启与 OrangeVPS 联调仍为 open；Gmail 不在本工单验收范围。
