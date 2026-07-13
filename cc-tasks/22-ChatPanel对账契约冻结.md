# 22 — ChatPanel 对账逻辑抽纯函数 + 补测(P0/P1,可并行)

## 背景

`ChatPanel.tsx`(1913 行)维护五套 HTTP/WS 回复对账机制,全部活在 useRef 里,零测试:

1. `pendingSegmentsByMsgIdRef` — message_segments 早到停靠(TTL 5min,MAX_PARKED 上限)
2. `pendingWakeReplyRef` — desktopWake HTTP fallback(5s timer,WS 先到则取消)
3. `pendingSendReplyRef` — send/upload HTTP fallback(同模式)
4. `renderedFallbacksRef` — 已渲染 fallback 登记(15s 过期,msg_id 优先、normalizedHash 兜底)
5. `wsMsgIdToLocalIdsRef` — ws msg_id → 本地 ChatMsg id 列表映射

这是全仓最高复杂度故障点。**明确:v0.1 不重构成全 WS,不改任何行为,只冻结契约。**

## 交付物

1. **抽纯逻辑**:新建 `src/windows/chat/correlation.ts`(或 `shared/`下),把上述对账决策
   抽成纯函数/纯状态机:输入(事件类型、msg_id、hash、now、当前登记表)→ 输出(渲染/跳过/停靠/
   替换 + 新登记表)。ChatPanel 改为调用它,refs 只存状态机实例/数据。**行为逐条保持不变**,
   现有 console.log 埋点(`appendSource:`/`fallback-skipped` 等)保留。
2. **单测**:`correlation.test.ts`,至少覆盖:
   - WS 先到、HTTP 后到(timer 应 skip)
   - HTTP timer 先触发、WS 后到(WS 应 skip,按 msg_id 匹配)
   - 无 msg_id 的旧 HTTP 响应走 hash 匹配
   - segments 早于 channel_message 到达的停靠与领取
   - TTL/上限淘汰(5min pendingSegments、15s renderedFallbacks、MAX_PARKED)
   - 同 msg_id 重复 channel_message 去重
3. **契约文档**:`docs/chat-correlation.md`,一页说明五套机制的职责、时序图(文字版即可)、
   TTL 常量表。protocol-v0.md(工单 21)链接到它。

## 验收

- `npx vitest run`(或现有测试命令)全绿。
- 手工 smoke:正常发消息、断 WS 发消息(走 HTTP fallback)、wake 各一次,行为与改前一致。

## 依赖

无(与 21 并行;21 的文档链接可后补)。
