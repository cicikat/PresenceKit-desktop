# Brief 51：客户端 UI 组件复用、设置入口与占位状态整理

## 目标

减少客户端高频控件的重复内联实现，补齐已有能力的可见入口，并把仍处于占位状态的 UI 明确区分为“开发占位”或“暂未开放”。不新增后端能力，不改变现有安全闸门和 API 契约。

## 范围

1. 设置面板组件边界
   - 位置：`src/windows/chat/components/preferences/PreferencesPanel.tsx`、`PrefAtoms.tsx`、`src/windows/chat/components/UIKit.tsx`。
   - 抽出并复用 `PreferenceSection`、`PreferenceTabs`、`SettingRow`、`Modal`、`ModalFooter`、`IconButton` 等最小组件。
   - 统一按钮、输入框、分隔线、错误提示和 loading 状态；保留现有 tab 信息架构和主题行为。
   - 连接、模型、能力和外观四类设置仍可独立滚动，避免单个弹窗承担无法扫描的长页面。

2. LayoutHost 尺寸契约
   - 位置：`src/windows/chat/components/LayoutHost.tsx`、`src/shared/layout/*`。
   - 核对侧栏 `size + 5` 的边框补偿是否与实际 CSS 盒模型一致。
   - 将补偿规则改为明确的 token/常量或归入侧栏组件，确保 manifest 声明宽度与用户看到的宽度一致。
   - 保留现有 layout mod 兼容性。

3. 已有能力入口核对
   - 位置：`src/shared/api/backend.ts`、`src/shared/api/runtimeSettings.ts`、相关设置页。
   - 逐项核对客户端已有 API 与页面入口，重点检查 TTS 自动播放、coplay、周期日期、模型路由、Prompt 资产和角色资产绑定。
   - 已有 API 如果没有产品入口，要么补上最小只读/编辑入口，要么在 UI 明确标注“当前版本未开放”，不得留下无效按钮或无来源状态。
   - 不通过客户端绕过后端权限或安全闸门。

4. 占位 UI 归类
   - 位置：`src/windows/chat/components/SpecPanel.tsx`、`src/windows/room/RoomWindow.tsx`、`src/windows/room/useRoomScene.ts`、Dream 潜意识侧栏相关组件。
   - 对明确的帮助/公告占位、Room 占位模型、Phase 3 camera placeholder 和潜意识实验面板做统一状态标识。
   - 如果功能当前不可用，按钮/入口应显示不可用原因或移除误导性操作；不要把静态占位内容伪装成真实数据。

## 不在范围内

- 不新增后端 endpoint、数据库字段或本地持久化状态。
- 不修改安全策略、tool loop、Dream hard exit、Tauri IPC 权限和 WebSocket 协议。
- 不进行全局视觉重做，也不删除仍有运行时用途的主题/布局系统。

## 验收标准

- 设置面板中高频控件的尺寸、间距、focus 和 disabled 状态一致。
- Layout manifest 的声明宽度与实际侧栏宽度不存在无法解释的偏移。
- 已有能力逐项有明确入口、只读状态或“暂未开放”说明，所有按钮都有实际 handler。
- 占位 UI 在开发模式和普通用户视图下不会造成“功能已完成”的误解。
- 不产生新的持久化物，因此无需新增观测端点；若实现选择新增状态落盘，必须同时提供只读观测接口并补充文档。
- 运行 `npm run build`、相关 Vitest 测试、`npm run check:naming` 和 `git diff --check`。

## 主要文件

- `src/windows/chat/components/preferences/PreferencesPanel.tsx`
- `src/windows/chat/components/preferences/PrefAtoms.tsx`
- `src/windows/chat/components/UIKit.tsx`
- `src/windows/chat/components/LayoutHost.tsx`
- `src/shared/layout/contract.ts`
- `src/shared/layout/registry.ts`
- `src/shared/api/backend.ts`
- `src/shared/api/runtimeSettings.ts`
- `src/windows/chat/components/SpecPanel.tsx`
- `src/windows/room/RoomWindow.tsx`
- `src/windows/room/useRoomScene.ts`

