# 69 Dream 聊天随轮数增长的前端渐进式卡顿
> 状态：`open`
> 优先级：`high`
> 范围：`Emerald-client` Dream 窗口前端；不修改 Dream 上下文语义、后端 transcript 或 API 契约
> 创建：2026-09-02

## 现象

Dream 模式开始正常，连续聊天后窗口整体越来越卡。卡顿不仅表现为回复等待，连 textarea 输入、键盘回显和输入法候选出现都会延迟。即使未设置聊天背景图，现象仍可复现；重启客户端后可暂时缓解，但同一 Dream 会话继续聊天后再次恶化。

## 当前代码证据

- `src/windows/dream/hooks/useDreamChat.ts` 每轮把 user/assistant 消息追加到 React `messages`，没有前端数量上限。
- `src/windows/dream/components/DreamChatPanel.tsx` 每次 render 都对完整 `messages` 执行 `map`，全部气泡长期保留在 DOM。
- `useDreamChat` 的伪流式回调每个 delta 都执行 `setMessages(prev => prev.map(...))`，并对完整累计文本重新运行 `parseIncremental()`。
- `DreamChatPanel` 监听 `messages.length/loading` 并滚动到底部；消息节点持续增加时会反复触发布局与滚动。
- Dream CSS 对大量气泡使用 `backdrop-filter`、blur、阴影和动画，即使无背景图也会产生较高合成/重绘成本。
- `DreamMsgRow` 已使用 `memo`，但消息数组更新时仍会遍历整个列表；需要确认是否存在稳定 props 之外的额外失效。

## 目标

将 Dream 聊天的渲染成本限制在可控范围内，使长对话期间 textarea 输入和输入法响应保持流畅。Dream 上下文仍由后端按既有契约处理；本工单不做历史语义、摘要或 token 策略改动。

## 实施建议

1. 先用性能计时/React Profiler确认瓶颈：记录 10、30、60、120 条消息时的 keydown 延迟、单次 commit 时长、DOM 节点数和 FPS。
2. 为可见聊天引入有界渲染策略（例如仅保留最近 N 条，或使用虚拟列表）；必须保留“加载更早消息/当前会话继续发送”的行为约定。
3. 将伪流式 delta 更新合并为定时批次（约 30–50ms），避免每个 delta 都触发全量 `map`、解析和布局。
4. 检查 `DreamMsgRow`/分段气泡的 key 与 props 稳定性，确保历史消息不会因新消息或流式更新重复渲染。
5. 对 Dream 气泡的 backdrop-filter/blur/入场动画做降级或按数量阈值关闭；无背景图场景也必须覆盖。
6. 为消息窗口、流式更新和输入响应补纯逻辑测试；不引入 jsdom/组件测试栈。需要真实窗口验收时记录为 `partial`，不能用静态检查替代。

## 验收标准

- 连续发送至少 100 轮后，输入框 keydown 到可见字符的延迟不随消息数线性增长；目标 p95 < 100ms（Windows debug 窗口）。
- 伪流式期间 React commit 频率受批处理上限约束，历史消息不会在每个 delta 重新解析。
- 聊天 DOM/渲染节点数有明确上限，或虚拟列表只挂载可视区域；滚动到底部行为和新消息顺序不回归。
- 无背景图、窄窗口、125%/175% DPI 下均验证；关闭 Dream 后不存在定时器、订阅或动画继续占用主线程。
- `npm test`、`npx.cmd tsc --noEmit`、`npm.cmd run build` 通过；若修改 Tauri 侧再补 `cargo check`。

## 不在范围内

- 不把普通聊天历史或 Dream transcript 清空作为修复。
- 不修改 `/dream/chat`、Dream prompt D9、会话上下文窗口或后端存储契约。
- 不以 API 响应时间变短作为本工单完成条件；必须以窗口输入/渲染交互延迟为主指标。

