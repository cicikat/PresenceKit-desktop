# Brief 67：苔庭 Design Mod 整体聊天面板重做

状态：`open`

## 背景

当前 `koke-niwa` 将多个 Sidebar 子区域实现为可独立拖动的自由节点，未挂载
`chat.header`、`chat.transcript`、`chat.composer`，导致最重要的聊天主流程缺失。
主舞台使用不透明纸张背景，native Halo 使用整块矩形 satellite canvas，实际效果
出现割裂的长方形边界、明显边缘和叠加光晕。该结果不符合“一个完整整体面板”的
产品预期；`freeform-capability-fixture` 仍仅作为 API 验收夹具，不作为视觉参考。

## 目标

将 `koke-niwa` 重做为“整体聊天面板 + 统一辅助区 + 克制装饰层”：聊天始终可见、
内容结构稳定，装饰可以有自由布局但不再把核心 UI 拆成漂浮碎片；窗口和舞台保持
真正透明，只有内容面板承担背景、边框和阴影。

## 范围

1. 在 `public/design-mods/koke-niwa/entry.js` 建立唯一主面板，挂载
   `chat.header`、`chat.transcript`、`chat.composer`，三者作为一个整体移动/缩放。
2. 将 Flow、Garden、Diary、Status 收进一个统一的辅助面板（可采用 tab 或折叠区）。
   允许装饰节点有限拖动，但禁止核心聊天区域逐块漂移。
3. 调整 `layout/layout.json`，保留明确的主区和辅助区，不再默认隐藏 Sidebar。
4. 重写 `style.css` 的背景层级：stage/root 透明；背景纹理、边框、阴影只绘制在
   主面板或辅助面板上；删除多层硬边框和大面积 glow。
5. 暂停 `nativeSurfaces.halo` 的默认启用，先用主窗口 overlay 验证装饰；若保留
   Halo，必须只绘制无底色粒子，不能产生可见矩形窗口边界。
6. 保留现有 Design Mod API、presenter、StateEngine、IPC 和后端契约，不新增后端
   设置、HTTP、WS 或移动端接口。

## 验收标准

- 打开 `koke-niwa` 后，聊天标题、消息流和输入框均可见且可正常交互。
- 聊天三件套属于一个连续的主面板，不再出现每块独立漂浮、独立拖动的碎片效果。
- Flow/Garden/Diary/Status 在辅助区可访问，切换 tab 或折叠不会卸载聊天会话状态。
- 主舞台和窗口外区域无实色矩形底；未启用 Halo 时不存在窗口外长方形边缘。
- 默认视觉不使用大面积模糊光晕；装饰颜色、阴影和边框不会覆盖或污染聊天内容。
- 宽窗口、窄窗口（至少 760px）、100%/125%/175% DPI 下均不遮挡输入框和消息流。
- Mod 切换到 builtin，再切回 `koke-niwa`，节点、挂载点、样式和 native surface
  均完整清理，不残留旧面板或旧光晕。
- `npx.cmd tsc --noEmit`、相关 vitest 测试通过；真实 Windows 窗口验收结果单独记录，
  不以静态检查替代窗口验收。

## 分阶段交付

### M1：恢复主聊天骨架

只实现主面板和三个聊天挂载点，暂时关闭 Halo 与复杂装饰，确认聊天功能完整。

### M2：统一辅助区

将四类 Sidebar 内容收进统一辅助面板，补窄窗口回退和 tab/折叠行为。

### M3：视觉收敛

重做透明背景、边框、阴影、纸纹和色彩层级；装饰只作为低对比度 overlay。

### M4：窗口验收

在 Windows 真实 Tauri 窗口验证 DPI、窄窗口、拖动、隐藏/恢复、Mod/builtin 循环切换，
并将未完成项回写 `docs/known-issues.md`。

## 不在本工单范围

- 不修改 `Emerald-presence`、`Emerald-desktop` 或 `Emerald-desktopUI`。
- 不扩展 Design Mod 权限、Host API、后端协议或移动端设置。
- 不把自由布局做成用户可持久化的任意编辑器；本工单只定义产品内置布局。

## 依赖与风险

主面板必须使用现有 `DesignComponentId` 和挂载生命周期；若聊天三件套无法在同一
容器内挂载，需要先修复 `DesignModHost` 的区域挂载契约。native Halo 的透明窗口
边界受操作系统窗口实现影响，必须保留“关闭 Halo 仍可完整使用”的降级路径。
