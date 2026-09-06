# Brief 71：Agent Runtime 浏览器生命周期验收记录

状态：`partial/open`（历史验收；Brief 72 已退役桌面 Browser Runtime 表面，真实桌面与真实 Chromium 条件仍未满足，未伪造通过）

> 2026-09-06：Brief 72 删除了 Browser Runtime 的桌面 UI、shared API、Tauri bridge、
> `bot_user_id` 配置与生命周期缓存。以下记录只保留为当时实现的未完成验收证据，不再代表
> 当前客户端功能，也不能作为重新引入任务创建、确认、暂停、取消或观测入口的依据。

## 运行上下文

- 客户端基线 commit：`4c7a8e8`（本次验收改动待提交；提交后以该新 commit 为准）
- 后端代码 commit：`8d24d4e`（验收时后端工作树为 dirty，未提交改动不作为客户端提交的一部分）
- OS：Windows `Win32NT 10.0.26200.0`
- Tauri CLI：`@tauri-apps/cli 2.11.1`
- 客户端构建命令：`npx.cmd tsc --noEmit`、`npm.cmd test -- --run`、`npm.cmd run build`、`cargo check`
- 记录时间：2026-09-04 UTC（验收命令期间）

## 已取得证据

| case | 结果 | 证据 |
|---|---|---|
| desktop surface retired | `passed (automated)` | `tests/client-surface-retirement.test.ts` 断言当前客户端没有 browser bridge、任务路径、表单文案或 `bot_user_id` |
| former capability / no-user degradation | `historical partial` | 原 bridge 已删除；后端 admin 面板独立拥有 capability、allowlist 和 task receipt |
| metadata redaction / lifecycle controls | `historical` | 原 `agent-runtime.test.ts` 和旧偏好组件随 Brief 72 一并删除，不再是当前桌面行为 |
| type/build/Rust | `passed` | tsc、Vitest、Vite build、cargo check 均通过；build 仅有既有 chunk warning |
| backend browser unit | `passed` | `Emerald-presence/tests/test_agent_runtime_browser.py`：3 passed |

## 未通过或未运行的真实场景

- 运行中的 8080 是旧后端实例；其公开 `/openapi.json` 只包含 capability/task observability，不包含 Brief 239 的 browser task 写路由，不能用于真实创建/确认/暂停/取消联调。
- 后端仓库当前存在用户未提交改动，且 Playwright Python 模块未安装（`playwright=False`），没有可用的确定性 Chromium fixture。
- `npm.cmd run tauri dev` 曾成功启动真实 Tauri 进程并显示 `PresenceKit-desktop` 窗口，但后端请求不可达/能力为 remote-disabled，无法完成 safe success、waiting_confirm、pause/cancel、timeout/disconnect/redirect 全链路。
- 尝试通过 Windows `PrintWindow` 截取真实 Tauri 窗口时调用挂起，未生成可审阅截图；已终止并清理临时产物。因此没有把“无截图的进程启动”记录为 UI 通过。
- 2026-09-06 的 Brief 72 退役复核再次启动了真实 `PresenceKit-desktop` 窗口并向其发送 Ctrl+R；Windows UI Automation 能定位窗口但 WebView2 没有公开 controls（0 button），无法审阅偏好页内容。此运行不构成 UI 验收通过。
- 刷新/重开/重启后的 waiting_confirm 只能验证客户端代码的 fail-closed 设计：没有本会话内安全请求引用时确认按钮禁用；后端没有公开 resume/confirmation handle，不能执行恢复。

## 结论

本记录只保留历史客户端实现的证据；Brief 71 要求的真实后端 schema、Chromium worker、Tauri 窗口截图及完整生命周期场景仍保持 `partial/open`。当前客户端不再拥有该表面，不得将本记录解释为 release acceptance 或恢复 bridge 的依据。
