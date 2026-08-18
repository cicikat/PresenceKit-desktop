# 64：Design Mod 节点生命周期与 Content Rect 修复

> 状态：partial/open。代码和自动化回归已补齐；Windows 实窗、多 DPI、多显示器验收仍未完成。
> 本单修复代码审查发现的两个确定性缺口，不扩大 Design Mod authoring API。

## 1. 背景

工单 62、63 已分别提交并通过前端、Rust 自动检查，但检查发现：

1. `SceneNode.dispose()` 只移除 DOM 和 transform，没有从 `SceneScheduler.nodes` 删除节点；同一 Mod 生命周期内用相同 id 重建会被错误判定为重复节点。
2. Rust 普通 native surface 在声明 `visualBleed` 后，`content_rect` 从扩张后的物理 bounds 再按 `contentInset` 推导。若未声明与 bleed 等量的 `contentInset`，返回的 content rect 会错误包含视觉 bleed，不再代表原始内容矩形。

## 2. 目标

- Scene node 单独 disposer、父级 scheduler disposer、重复调用 disposer 都幂等。
- 节点销毁后可以在同一 scheduler 中使用相同稳定 id 重建，不残留旧节点、pointer capture、transform 或待提交帧。
- native surface 的 `bounds` 始终包含 `visualBleed`，`content_rect` 始终表示未扩张的内容区域；`contentInset` 只用于从内容区域向内缩进，不改变 content rect 的基本语义。
- 补齐纯逻辑回归测试，避免依赖真实 WebView 才能发现上述问题。
- 同步把本单、62、63 的状态和已知限制记录清楚；未完成 Windows 实窗验收继续保持 `partial/open`。

## 3. 实施范围

### 3.1 Scene scheduler 生命周期

- 为 `SceneNode` 增加 scheduler-owned unregister 回调，或由 scheduler 提供受控的 `dispose(id)`，确保 node disposer 会从 `nodes` 删除自身。
- `SceneScheduler.dispose()` 继续负责取消 pending rAF 并释放全部节点；单节点 dispose 后不应影响其他节点。
- 节点 dispose、scheduler dispose、StrictMode cleanup、重复 cleanup 和 pointer capture 清理必须幂等。
- 不允许通过公开 map 或绕过 scheduler 直接删除节点。

### 3.2 Native content rect

- 重构 `calculate_layout` 的内容矩形与外扩矩形计算：先确定原始 content bounds，再应用 visual bleed 得到 window bounds。
- 明确定义 `contentInset` 的方向和用途，并在 Rust/TypeScript 类型与文档中保持一致。
- 覆盖普通 Island、Halo、无 bleed、仅 bleed、bleed 与 inset 不相等、负坐标和 125%/175% DPI 的边界情况。
- 保持旧 `margin` schema 的兼容行为，但不得让兼容字段改变新 `content_rect` 语义。

### 3.3 文档与工单状态

- 本单完成代码和自动测试后，将本文件状态改为 `partial/open` 或 `complete`，依据真实验收结果填写。
- 62、63 的工单状态不得在没有 Windows 实窗证据时写成 `complete`；补充对 64 的依赖说明。
- `docs/known-issues.md` 保留 62/63 的实窗 open 项，并新增 64 的修复记录。
- 若 `content_rect` 契约对外部 Mod manifest 可见，更新 `docs/design-mods.md`、`docs/frontend-structure.md`、`docs/backend-integration.md` 中的对应说明。

## 4. 非目标

- 不重新设计 Scene API、composition mode 或 edge ornament API。
- 不修改后端业务协议、StateEngine、WS 或手机端。
- 不删除 `.tmp/` 或覆盖工作区中已有的用户改动。
- 不把自动化测试通过冒充真实窗口验收通过。

## 5. 测试与验收

### 5.1 纯逻辑与自动检查

- Scene：单节点 dispose 后同 id 重建；多节点单独销毁；重复 dispose；scheduler dispose 后 schedule/create；pointer capture 清理。
- Content rect：普通 surface 的 `content_rect` 不含 bleed；Halo content rect；inset 与 bleed 不相等；负坐标和 DPI 换算。
- `npm test -- --run`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `cd src-tauri && cargo test && cargo check`
- `git diff --check`

### 5.2 Windows 实窗

- fixture 在同一 Mod 生命周期内销毁并重建同 id 节点，不出现重复 id、残留 DOM 或点击命中漂移。
- 普通 Island 与 Halo 在 100%/125%/175% DPI、双屏负坐标下，视觉 bleed 可见但 content rect 对齐实际内容。
- Mod A→B→builtin 与恢复默认连续切换后，节点、监听器、rAF、native surface 回到基线。

## 6. 提交要求

- 本单独立提交，不与 62/63 或其他未提交工作区改动混合。
- 提交前记录测试结果和未完成实窗项；若实窗未完成，状态保持 `partial/open`。

## 7. 实施记录（2026-08-18）

- 已修复 Scene node disposer 未向 scheduler 注销的问题；重复销毁、pointer capture 清理、同 id 重建、多节点独立销毁和 scheduler 销毁后拒绝创建均有回归覆盖。
- 最后一个 Scene node 单独销毁时会立即取消 scheduler 的待提交 rAF，不保留空帧；测试直接锁定 node disposer 的取消时机。
- 已修复 Rust `content_rect` 从外扩 bounds 推导的问题；普通 Island 和 Halo 都先计算未扩张内容区域，`visualBleed` 只扩张 `bounds`，`contentInset` 仅向内缩进内容区域。
- 已通过 `npm.cmd test -- --run`（49 files / 206 tests）、`npx.cmd tsc --noEmit`、`npm.cmd run build`、`cargo test`（89 tests）、`cargo check` 和 `git diff --check`。
- 未完成：Windows 实窗的 100%/125%/175% DPI、双屏负坐标、普通 Island/Halo 的不等 bleed/inset，以及 Mod/builtin 连续切换验收；状态保持 `partial/open`。
