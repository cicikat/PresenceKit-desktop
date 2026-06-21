# docs/known-issues.md — 已知问题与技术债

> 修复前请先对照代码确认问题仍存在；修复后在本文件改状态或移到已修复区。

---

## 语音（TTS）功能完全未接入

**影响**：后端已有完整 TTS 合成（`config.yaml: tts.enabled`、情绪音色映射、`/tts-config` 接口），但客户端从未实现音频播放端，`/tts-config` 的开关也无处放置——控制一个不存在的功能没有意义。

**证据**：全仓 grep `tts|voice|audio` 仅命中 avatar 等无关项，无任何音频播放代码。

**建议**：单开"语音接入"工单，最小形态：① Rust command 请求后端合成音频 → ② 前端播放 → ③ 偏好面板加 TTS 开关（音色映射属部署期，留 `config.yaml`）。目前对话设置（Fix 1）已先行独立上线，不依赖本项。

---

## P1：客户端和目标 v1 WS 协议不一致

**位置**：`src/shared/api/ws.ts`、`src/shared/api/types.ts`、`D:\ai\qq-st-bot\channels\desktop_ws.py`

当前实际协议是 legacy：

- `hello` / `hello_ack`
- `channel_message`
- `action`
- `ack`
- `ping` / `pong`

旧 v1 协议文档要求：

- envelope：`v` / `ts` / `payload`
- `assistant_message`
- `state_update`
- `user_message`
- `client_event`
- capabilities 声明

**影响**：后续接手者容易误以为 Phase 2b 已完成；状态推送、用户输入 WS 化、模式切换都还没落地。

**建议**：先决定是短期继续 legacy，还是直接推动后端和客户端一起升 v1。不要在客户端单边实现 v1。

---

## P1：用户发送仍走 HTTP `/desktop/chat`，不是 WS `user_message`

**位置**：`src/windows/chat/components/ChatPanel.tsx`、`src/shared/api/backend.ts`、`src-tauri/src/lib.rs`

当前 `send()` 调用 `sendChat()`，Tauri command 再 POST `/desktop/chat`。

**影响**：与 v1 协议文档中“用户输入走 WS，回复走 assistant_message”的目标不一致；也导致 HTTP 返回回复和 WS 主动消息两条路径并存。

**建议**：协议升级时把 `sendChat()` 改为 WS `user_message`，或明确文档标记 HTTP 为过渡路径。

---

## P2：admin token 已从前端源码迁出（QQ 号 ChatPanel 已绕过）

**位置**：`src-tauri/src/client_config.rs`、`config/client.local.json`

Phase 2c+ 之后，ChatPanel 启动历史改走 `/chat-log/*` 接口，owner_qq 由后端从 `config.yaml` 读取，客户端不再直接使用 `BOT_USER_ID`。但 `BOT_USER_ID` 仍出现在 `loadHistory()`（现备用）及可能的 future 模块里。

**当前状态**：

- `ADMIN_TOKEN` 已迁移到 Rust 侧本地配置读取，前端不再保存或传递 token。
- `config/client.local.json` 已加入 `.gitignore`，真实 token 不应提交。
- `/memory/{uid}/short-term` 不再被 ChatPanel 调用，但其他模块未来可能仍用。

**剩余建议**：`BOT_USER_ID` 遗留可在确认无其他调用者后清理；长期仍可考虑后端专用本机鉴权替代静态 token。

---

## P1：`state_update` 没有接入 StateEngine

**位置**：`src/shared/state/store.ts`、`src/shared/api/ws.ts`

`StateEngine.applyBackendState('state-update', patch)` 已保留未来 source，但 WS 类型里没有 `state_update`，`wsClient` 也没有处理；当前 mood/activity/presence ownership 也未切换为推送。

**影响**：后端推送的情绪、活动、presence 不能驱动 UI；当前 mood/activity 来自轮询，presence 仍由本地交互驱动。

**建议**：协议对齐后先明确推送字段 ownership，再把后端状态变化统一转成 `engine.applyBackendState('state-update', patch)`。

---

## P2：`sensor-service/` 只有空目录骨架

**位置**：`sensor-service/`

目录存在，但没有 Python 实现文件。

**影响**：项目结构看起来像已迁感知服务，但实际不可运行。

**建议**：迁移旧 `Emerald-desktop` 感知层时，先写启动入口、数据路径和后端 `/sensor/*` 对接文档。

---

## P2：桌面协议文档路径漂移

**位置**：文档路径

旧入口说明曾写：

```text
D:\ai\qq-st-bot\docs\desktop-client-protocol.md
D:\ai\qq-st-bot\docs\desktop-client-plan.md
```

当前实际同名文件在：

```text
D:\ai\Emerald-desktop\docs\
```

**影响**：后续协作者按旧路径找不到协议文档，容易重复设计或误判状态。

**建议**：要么把协议文档复制/迁到本仓库或后端仓库，要么持续在 `docs/backend-integration.md` 标明权威位置。

---

## P3：Tauri 项目名和窗口标题仍是模板名

**位置**：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`

当前仍有：

- package name: `tauri-app`
- productName: `tauri-app`
- window title: `tauri-app`
- Rust package description: `A Tauri App`

**影响**：开发和打包时显示不符合 Emerald-client。

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

**位置**：`qq-st-bot/admin/routers/diary.py`、`src/windows/chat/components/SubDiary.tsx`

后端 `/diary/list` 和 `/diary/{date}` 的 `emotion` 字段当前统一返回 `null`。客户端的 filter tabs 和 entry 标签已按 `emotion !== null` 判空处理，不渲染空标签。

**影响**：日记 tab 的 filter tabs 目前只显示"全部"一项，emotion 标签不出现。功能完整，只是 emotion 标注数据未来需要后端补充（如 LLM 客观判断后写入文件 frontmatter）。

**建议**：后端扩展 emotion 后，客户端无需改代码，emotion 值会直接出现在 filter tabs 和标签里。

---

## P2：Garden daily lifecycle 仅数据层手测，scheduler 端到端未实测

**位置**：`qq-st-bot/core/garden/manager.py daily_check()`、`qq-st-bot/core/scheduler/triggers/garden_daily.py`、`qq-st-bot/core/scheduler/loop.py` `garden_daily` cooldown

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

## P2：花园客户端目前是只读状态页，缺 harvest/vase 详情和操作入口

**位置**：`src/windows/chat/components/SubGarden.tsx`、`src/shared/api/types.ts`

当前 `SubGarden` 已能读 `/garden/state` 并展示五个花槽，但 UI 只消费 `slots`。`harvest_count` / `vase_count` 只在类型里存在，没有展示收获区、花瓶详情，也没有手动浇水、采收、送花等操作入口。

**影响**：后端花园生命周期已经往 harvest/vase 方向推进，但客户端用户只能看到生长槽位，无法理解“开花后去了哪里”。

**建议**：后端若继续只暴露 count，就在 UI 上至少展示计数；如果要完整闭环，需要扩展 `/garden/state` 返回 harvest/vase 列表，或新增只读详情接口和操作接口。

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

## 已修复

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
