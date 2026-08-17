# 61：客户端可见回归与窗口生命周期闭环

> 状态：partial/open。Ribbon tooltip、桌宠状态回填、Onboarding 超时恢复和 satellite payload 串代保护已落地；真实 Windows 回归验收仍待完成。前置：工单 60 的本地性能改动已落地，但真实 Windows 性能基线仍保持 `partial/open`。
> 本单先恢复用户可见入口和跨窗口操作，再进行 60 的实窗验收；不新增视觉自由度，不把
> `console.warn` 当作用户可恢复的错误处理。

## 1. 背景与证据

近期 Design Mod/窗口生命周期改动后，已报告三类用户可见回归：

1. Ribbon 顶部四个功能项 hover 时相邻标签消失，并在桌宠图标下出现异常滚动框；偏好、帮助、日夜切换仍可见。
2. 桌宠开关点击无效或状态不一致。当前 `usePetController` 将 `petVisible` 固定初始化为 `false`，且失败只写控制台；`setPetWindowVisible` 已接入 coordinator，但没有把 native 状态回填到 React。
3. “一起做事”进入后长期停在“正在检查连接配置…”。`OnboardingGate` 对 `getTokenStatus()` 没有超时、取消或可恢复失败状态，任何 Tauri IPC 卡住都会永久占据主窗口。

工单 60 还存在一个切换风险：`DesignModHost` 的 `satellitePayloadRef` 只按局部 `sequence` 区分快照；新 Mod 的 sequence 从 1 重新开始时，可能复用上一个 Mod 的 payload。

## 2. 目标

- Ribbon tooltip、滚动容器和底部关键入口在默认布局、Design Mod 和窄窗口下都保持可见、可 hover、可点击。
- 桌宠开关具备幂等的 open/show/hide/destroy 生命周期；窗口已存在、正在打开、销毁后重开、Tauri command 失败时，React 状态都能回到可解释状态，并给用户可见的重试入口。
- Activity/一起做事连接检查不会无限停在 checking；超时后显示可重试错误，成功后只挂载一次 Activity 内容，不重复初始化 ChatWindow/WS owner。
- Mod 切换、StrictMode 重挂载和 fixture 重启后，satellite snapshot、listener、timer、Blob URL 与 WebView 数量不串代、不累积。

## 3. 实施范围

### 3.1 Ribbon 可见性与 tooltip

- 修正 `chat-ribbon__scroll` 的 overflow 轴和 flex min-size，禁止在 tooltip 需要越界时生成横向滚动条或裁切邻近项。
- 将功能项 tooltip 的定位边界交给明确的 overlay/portal 或可计算的 viewport clamp；不能靠提高 z-index 掩盖裁切父级。
- 底部偏好、帮助、日夜切换和桌宠入口属于 critical controls，不得被普通项滚动推出可视区。
- 默认布局与 Design Mod 的恢复入口分别验证，不能只修 fixture。

### 3.2 Pet window coordinator 回填

- 增加 native `isVisible`/窗口存在状态的读取或事件订阅，在 `usePetController` 初始化和窗口关闭时同步 `petVisible`。
- 合并并发 toggle、open/show/destroy 请求；旧 generation 的完成结果不得覆盖新状态。
- 错误进入共享 UI 状态，至少提供重试和恢复默认路径；不能只 `console.warn`。
- 保持桌宠窗口不自行建立 WS/HTTP，继续由主窗口 owner 转发 snapshot/turn。

### 3.3 Activity onboarding 超时与恢复

- 为 `getTokenStatus` 增加可取消、可测试的超时边界；超时显示明确的连接配置错误和重试按钮。
- `ActivityWindow`/`OnboardingGate` 重挂载时复用已有连接状态，不创建第二个 WS、polling 或 ChatWindow owner。
- 连接检查成功、失败、取消、Activity 关闭后返回主窗口都补最小回归测试。

### 3.4 工单 60 内部修正

- 在 `DesignModHost` cleanup/activation generation 变更时清空 `satellitePayloadRef`，或把 generation/modId 纳入缓存键。
- 为该行为添加纯逻辑测试：Mod A sequence=1 的 payload 不能被 Mod B sequence=1 复用。
- 保留 60 的 20Hz snapshot budget、诊断节流、暂停/恢复和资源 disposer 边界。

## 4. 验收

### 4.1 自动检查

- `npm test -- --run`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `cd src-tauri && cargo test && cargo check`
- `git diff --check`

### 4.2 真实窗口

- 默认布局与 `freeform-capability-fixture`：hover 四个 Ribbon 顶部项，确认无异常 scrollbar、标签不消失，底部入口始终可点。
- 桌宠连续执行显示、隐藏、显示、快速双击、主窗口关闭/重开；记录最终 React/native 状态和失败后的重试行为。
- Activity 连续进入、取消、后端不可达、恢复连接各 3 次；不得出现永久 checking、重复 WebSocket 或重复窗口。
- 20 次 Mod/窗口切换后，surface、listener、timer、Blob URL 和 WebView 数量回到基线。
- 100%/125% DPI、窄窗口、双屏负坐标、Alt-Tab 与主窗口最小化/恢复至少各验证一次。

## 5. 三面闭环与文档

- 本单不新增后端业务契约；若新增 Tauri command/event，必须同步 `docs/backend-integration.md` 和 Rust/前端测试。
- 更新 `ARCHITECTURE.md`、`docs/frontend-structure.md`、`docs/design-mods.md` 和 `docs/known-issues.md`，保留真实窗口未验收项的 `open/partial` 状态。
- 60 的实窗性能表继续使用 `docs/brief-60-runtime-baseline.md`，本单不能用 build 通过替代 frame p95、click-to-ack、私有字节和 20 次切换数据。

## 6. 后续依赖

本单和工单 60 的真实窗口验收完成后，才进入 Scene Graph、窗外透视四边形、连接线、物理漂浮和特殊 Mod authoring API。后续视觉工单必须沿用本单的 coordinator、generation、snapshot budget 和 disposer 边界。
