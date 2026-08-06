# Brief 50：客户端 UI 响应式与交互尺寸修复

## 目标

修复桌宠客户端在窄窗口、活动页面和图片裁剪流程中已经确认的布局问题。保持现有主题、布局 manifest 和后端协议不变，优先保证内容不被裁切、按钮可触达、聊天区域可用。

## 范围

1. 图片裁剪弹窗
   - 位置：`src/windows/chat/components/AvatarCropper.tsx`、`src/windows/dream/components/DreamBackgroundCropper.tsx` 及对应 CSS。
   - 头像裁剪面板不得固定溢出视口；梦境背景裁剪面板同样需要检查 320px、375px 和窄桌面窗口。
   - 操作按钮、缩放滑杆和错误提示在小屏仍可见且不互相覆盖。
   - 头像和背景裁剪继续使用各自输出比例与尺寸，只统一容器和 footer 行为。

2. 活动页面布局
   - 位置：`src/windows/activity/components/GomokuPage.tsx`、`ChessPage.tsx`、`CompanionSidebar.tsx`、`ActivityCompanionPanel.tsx`。
   - 棋盘区与陪聊区在窄窗口切换为上下布局，或提供明确的陪聊折叠入口。
   - 棋盘保持稳定尺寸约束，陪聊输入框不得被挤出视口。
   - 五子棋、象棋、阅读三种活动的陪聊面板保持同一套间距、输入框和按钮规则。

3. 聊天与桌宠触控尺寸
   - 复核 `ToyChatPanel`、Chat header、活动陪聊栏和设置面板中的小按钮。
   - 图标按钮至少保留可操作的点击区域，并提供 `aria-label` 或 tooltip。
   - 发送、关闭、折叠、确认等高频按钮的高度和 disabled 状态保持一致。

4. 长文本边界
   - 设备名、状态提示、陪聊消息和错误消息不得撑破容器。
   - 被截断的设备名或状态应提供 `title`/详情入口；聊天正文保留换行和滚动边界。

## 不在范围内

- 不重做主题色、Dream 视觉 token 或布局 manifest 信息架构。
- 不修改后端 API、Tauri command 或消息协议。
- 不把所有组件立即迁移为 CSS Modules。

## 验收标准

- 在 320px、375px、768px 和宽桌面窗口检查聊天、设置、头像裁剪、梦境背景裁剪、五子棋和象棋。
- 不出现 body 级横向滚动；弹窗 footer 和主要按钮始终可见。
- 活动棋盘和陪聊栏在窄窗口不会相互压缩到不可用。
- 中文、英文和较长角色名下，标题、按钮、输入框都不重叠。
- 所有关闭、折叠和图标按钮可通过键盘或辅助技术识别。
- 运行 `npm run build`、相关 Vitest 测试和 `git diff --check`。

## 主要文件

- `src/windows/chat/components/AvatarCropper.tsx`
- `src/windows/dream/components/DreamBackgroundCropper.tsx`
- `src/features/dream/DreamTokens.css`
- `src/windows/activity/components/GomokuPage.tsx`
- `src/windows/activity/components/ChessPage.tsx`
- `src/windows/activity/components/ActivityCompanionPanel.tsx`
- `src/windows/activity/components/CompanionSidebar.tsx`
- `src/windows/toy/components/ToyChatPanel.tsx`
- `src/windows/toy/components/ToySidebar.tsx`

