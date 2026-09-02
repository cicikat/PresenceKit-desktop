# 67 UI Mod 切换卡顿：去重应用路径并隔离重运行时

## 状态

- status: `done`
- priority: `high`
- scope: `Emerald-client` 前端 UI mod、主题、布局和自由布局切换
- created: 2026-09-02

## 现象

在 Chat 偏好中切换任意主题、布局或自由布局时，界面会短暂无响应，随后才完成切换。历史行为中主题切换基本即时。

## 当前证据与初步根因

### 1. 主题切换存在重复应用

`ThemePicker` 直接调用 `setTheme(id)`；`setTheme()` 内部又会写入 `chat.theme` 并广播 `emerald-ui-pref-change`。`useChatAppearanceController` 订阅主题广播后更新 `theme` state，而其 `[theme]` effect 再次调用 `applyRegisteredTheme(theme)`。

调用链为：

```text
ThemePicker -> registry.setTheme
  -> applyTheme/applyThemeCss + setUIPref + listeners
  -> useChatAppearanceController listener: setTheme(state)
  -> [theme] effect: registry.setTheme (第二次 apply + 第二次 pref 广播)
```

这会重复删除/插入主题 `<style>`、遍历全部 token，并触发全局订阅；每次 `setTheme()` 还会启动一个 600ms 的 `theme-transitioning` 清理定时器。

依据：

- `src/shared/theme/registry.ts` `setTheme()` 同时负责应用和写偏好。
- `src/windows/chat/hooks/useChatAppearanceController.ts` 的 `[theme]` effect 和 `subscribeTheme` listener 形成重复路径。
- `src/shared/theme/ThemePicker.tsx` 直接调用 registry `setTheme`。

### 2. 主题切换会对整棵 DOM 强制开启过渡

`registry.setTheme()` 给 `html` 加上 `theme-transitioning`；`src/shared/theme/globals.css` 对 `html *` 及伪元素设置 `background-color`、`color`、`border-color` 的 500ms `!important` 过渡。Chat 内有粒子/视频/大量消息节点时，会把一次 token 替换放大为整棵 DOM 的样式重算和绘制压力，表现为“卡住后才切过去”。

### 3. 布局/自由布局共享同一重渲染和运行时生命周期

- `src/shared/layout/registry.ts::setLayout()` 在写偏好前会应用一次 CSS 并通知订阅者；随后 `setUIPref()` 广播又触发全局偏好监听（当前因 `currentLayout` 已更新通常会短路），调用方 Promise 回调还会再次写入 `activeLayout/sidebarWidth/sidebarOpen`。这条路径需要显式收敛为单一提交点，避免未来改动重新引入重复应用。
- `ChatWindow` 将 `activeLayout` 传入 `LayoutHost`、`ChatPanel`，切换会导致 Chat 壳层和主区布局重新计算。
- 自由布局激活位于 `DesignModHost.activate()`：每次激活先执行 `cleanupRuntime()`，销毁 lifecycle、satellite、scene、geometry observers、style 和 mount，再异步读取 package、导入 blob module、创建 observers/satellite 并运行 `activate()`。主题/布局 CSS 与自由布局 runtime 在同一 Chat 树中，切换期间会叠加主线程工作。

这些路径说明卡顿不是单个 CSS mod 文件造成，而是近期 Design Mod runtime 接入后，切换操作把全局 CSS 应用、订阅广播和运行时生命周期工作叠在了一起。

## 施工目标

1. 主题切换一次点击只完成一次 `applyTheme/applyThemeCss` 和一次通知。
2. 主题过渡不阻塞布局、消息和 canvas；保留轻量、可禁用的视觉过渡。
3. 布局切换只更新布局 manifest/CSS 和必要的 Chat 壳状态，不重复触发同一变更。
4. 自由布局切换与普通主题/布局切换解耦；清理旧 runtime 不得阻塞首帧，且旧异步激活结果必须失效。

## 建议改动边界

- 在 `useChatAppearanceController` 中移除“主题 state 变化后再次调用 registry.setTheme”的副作用；主题 registry 成为唯一应用入口，state listener 只同步展示状态。
- 或将 registry 拆成“apply-only”和“set preference + apply”两个明确 API，禁止订阅回调反向调用带副作用的 setter。
- 将 `theme-transitioning` 从 `html *` 全量颜色过渡改为受控根节点/少量表面；切换期间对粒子、视频、DesignMod scene 使用 `prefers-reduced-motion` 或运行时暂停策略，避免强制 transition。
- `setLayout()` 增加同 ID no-op，并合并 `setUIPref` 广播与本地 listener 更新；核对 `onUIPrefChange` 与调用方 Promise 回调，确保一次切换一次状态提交。
- 为 `DesignModHost` 增加切换性能埋点（cleanup、package read、module import、activate、首帧），必要时将旧 runtime 清理拆成同步最小清理 + `requestAnimationFrame` 后台释放；不得牺牲 generation/requestId 失效保护。
- 不修改后端协议，不把布局/主题逻辑散回组件。

## 验收与回归

### 自动化

- 新增 registry/controller 纯逻辑测试：一次主题选择只调用一次 apply；同 ID `setLayout` 为 no-op；偏好广播不会形成 setter 循环。
- `npm test`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`

### 手工性能验收

在 debug Tauri Chat 窗口分别执行：

1. `paper -> dark -> paper` 连续 10 次：点击到 `data-theme` 更新无明显冻结，Performance 记录无重复 style 注入。
2. `obsidian-default -> sidebar-right -> mirror-stage` 连续切换：无重复 CSS style、无丢失 Chat 会话状态。
3. `builtin-default -> freeform fixture -> builtin-default`：旧 runtime 不再发布 geometry/satellite 更新；切换后首帧可交互。
4. 开启粒子背景、视频背景和长消息列表重复上述三组，确认没有 500ms 全树 transition 导致的卡顿。

记录每组 P50/P95 点击到视觉完成耗时，以及主线程长任务（`>50ms`）数量；若仍有真实窗口或 native satellite 未验收，保留 `partial` 状态并写入 `docs/known-issues.md`。

## 关联文件

- `src/shared/theme/registry.ts`
- `src/shared/theme/loader.ts`
- `src/shared/theme/globals.css`
- `src/shared/theme/ThemePicker.tsx`
- `src/shared/layout/registry.ts`
- `src/windows/chat/hooks/useChatAppearanceController.ts`
- `src/windows/chat/components/DesignModHost.tsx`
- `src/shared/design-mod/runtime.ts`
