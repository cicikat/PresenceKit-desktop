# Brief 70：Agent Runtime 浏览器任务与能力状态客户端面

> 状态：`partial`
> 优先级：`high`
> 前置：后端 Brief 238；后端 `/openapi.json` 和三仓接口总账先冻结
> 范围：`Emerald-client`；不实现浏览器 worker，不接触凭据

## 背景

后端 Agent Runtime 浏览器能力此前只有后端观测外壳，桌面客户端没有任务状态、能力状态、用户
确认、取消或失败降级面。本工单把它接入现有桌面设置/任务 surface，使用户能看见并控制一次受控
浏览器实验；客户端只消费公开的 metadata projection。

## 目标

- 通过现有 `src/shared/api/` + Tauri HTTP bridge 调用后端公开 API；禁止在 WebView 中直接 `fetch`。
- 展示浏览器 capability 的 `enabled/disabled/unavailable/remote_disabled` 有效状态和原因。
- 展示任务的 `queued/running/waiting_confirm/paused/succeeded/failed/canceled/expired/outcome_unknown`
  状态、时间、错误码、尝试次数、截断标记和有限 artifact 信息。
- 对高风险操作提供明确的用户确认；提供暂停、取消和人工接管入口。
- 对 backend 不支持、权限不足、Dream/remote_server、未知结果和网络错误提供明确降级，不猜测成功。
- 只显示用户可见结果和安全摘要，不显示 token、cookie、password、profile、完整 URL query、
  页面原文、原始工具参数或绝对路径。

## 接入约束

1. 先从后端 `/openapi.json` 生成/手写最小 TypeScript 类型，字段以公开 schema 为准；不得根据
   `core/agent_runtime` 私有落盘结构自行推断。
2. API 调用集中在 `src/shared/api/`，复用现有鉴权、错误分类、退避和 Tauri bridge；不要在
   React 组件中复制 token 或请求逻辑。
3. 轮询/刷新必须有取消、退避、卸载清理和重复请求保护；未知状态保留为未知，不自动触发再次执行。
4. UI 不能把“能力已启用”当作“当前任务成功”，也不能把浏览器页面内容当作聊天消息或记忆写入。
5. 客户端不继承桌面本地 OS 权限：上传/下载仅提交后端返回的受控 artifact 引用，不能读取任意本地路径。
6. 新增文案全部使用 `src/shared/i18n/` 语义 key；不向 `legacy.ts` 增加新功能文案。

## 建议界面

- 在现有设置或任务状态 surface 增加 Browser capability 状态行和失败原因。
- 在任务详情中显示状态时间线、确认提示、暂停/取消按钮和安全结果摘要。
- `waiting_confirm` 必须是醒目的阻断状态；确认后显示新的 attempt 状态。
- `outcome_unknown` 显示人工接管/重新发起提示，不能显示“已完成”。
- `remote_disabled`、未授权和后端版本不支持时显示只读降级状态，不显示实现细节。

## 测试与验收

- 纯逻辑测试覆盖 schema 解析、状态机、错误码映射、退避、重复请求和未知结果。
- UI 测试覆盖 capability disabled、queued/running、waiting_confirm、paused、canceled、
  succeeded、failed、expired、outcome_unknown、remote_disabled 和空数据。
- 鉴权测试确认所有请求经过统一 bridge/header；客户端源码和渲染文本不出现凭据字段。
- 与后端联调：创建任务、用户确认、取消、暂停、恢复、失败和未知结果均能正确显示，且不会生成
  第二个任务或重复副作用操作。
- `npm test`、`npx.cmd tsc --noEmit`、`npm.cmd run build` 通过；涉及 Tauri/Rust 时补 `cargo check`。
- 启动 dev server 后硬刷新实际受影响页面，核对状态、按钮、降级提示和窄窗口布局；若浏览器环境
  无法启动，必须记录“浏览器实测未完成”，不能以静态检查代替。
- 更新 `docs/backend-integration.md`、`ARCHITECTURE.md`、`docs/frontend-structure.md` 和必要的
  `docs/known-issues.md`；同步后端三仓接口总账中的客户端状态为 `open/partial/current`。

## 完成条件

只有后端 Brief 238 已冻结公开 schema，客户端真实联调覆盖确认/取消/未知结果，且 build、测试和
实际 UI 检查全部通过后，本工单才能标记 `implemented`。在此之前，客户端不得显示浏览器能力为
“可用”，也不得把后端仅有的观测端点冒充用户任务控制面。

## 客户端当前交付（2026-09-04）

已接入 Chat 偏好「能力与权限」中的只读 Browser Runtime surface：通过 Tauri bridge 读取脱敏 capability/task 观测，展示状态、时间、错误码、尝试次数、截断和安全 artifact 摘要，并使用统一轮询退避。后端 Brief 238 尚未冻结 owner-facing 创建/确认/暂停/恢复接口，故控制入口明确 disabled，不能标记为 `implemented`。
