# docs/frontend-structure.md — 前端结构指南

本文档描述 `src/` 内当前 React/Tauri 前端实现。它记录的是实际代码状态，不是目标方案。

---

## 入口

`src/main.tsx` 做三件事：

1. 引入全局样式 `src/shared/theme/globals.css`。
2. 调用 `avatarStore.init()` 读取本地头像配置。
3. 渲染 `<ChatWindow />`。

当前只有聊天窗口 view。桌宠 view 尚未作为独立 Tauri window 或 React component 接入。

---

## ChatWindow

文件：`src/windows/chat/ChatWindow.tsx`

职责：

- 创建并持有单个 `StateEngine`。
- 管理 UI 状态：主题、侧栏开关、侧栏 tab、侧栏宽度、帮助面板、偏好面板、桌宠开关。
- 布局三列：Ribbon、Sidebar、ChatPanel。
- 负责偏好面板内的头像上传/裁剪入口。

关键状态：

| state | 说明 |
|---|---|
| `theme` | `paper` / `dark`，写入 `document.documentElement[data-theme]` |
| `petVisible` | 当前只影响 Ribbon active 和 engine mode，没有真实桌宠窗口 |
| `sidebarOpen` / `sidebarTab` | 控制左侧副栏 |
| `sidebarWidth` | 可拖拽调整，范围 260-540 |
| `chatHeaderVisible` | 控制 ChatPanel 顶部状态栏 |
| `specOpen` / `prefsOpen` | 帮助/偏好浮层 |

---

## ChatPanel

文件：`src/windows/chat/components/ChatPanel.tsx`

职责：

- 显示历史消息、用户消息、助手消息、typing/loading 状态。
- 启动时调用 `loadHistory()`。
- 用户发送时调用 `sendChat()`。
- 订阅 WS `channel_message`，显示后端主动消息。
- 根据 engine mood/activity/presence 渲染 header 标签、头像呼吸和 typing 指示。

当前消息来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 启动历史 | `loadHistory()` → Tauri `load_history` | 从后端 `/memory/{uid}/short-term` 读取 |
| 用户发送 | `sendChat()` → Tauri `send_chat` | 当前走 HTTP `/desktop/chat` |
| 主动推送 | `wsClient.on("channel_message")` | legacy WS 消息 |

注意：

- `send()` 顶部注释仍写着“TODO WebSocket”，但实际已经接了 HTTP 后端。
- v1 目标协议要求用户消息走 WS `user_message`，当前未实现。

---

## SubGarden

文件：`src/windows/chat/components/SubGarden.tsx`

职责：

- 在 Sidebar 的 `garden` tab 中展示陪伴花园。
- 调用 `loadGardenState()` 读取后端 `/garden/state`。
- 每 30 秒轮询一次。
- 展示五个情绪花槽、花名、英文名、阶段、阶段进度条和 bloom 标签。

当前数据来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 花园状态 | `loadGardenState()` → Tauri `load_garden_state` | 从后端 `/garden/state` 读取 |

当前边界：

- 只读展示，没有手动浇水、采收、送花、花瓶详情。
- 错误时显示错误文本和重试按钮。
- `harvest_count` / `vase_count` 已在类型里，但 UI 暂未展示详情列表。

---

## SubDiary

文件：`src/windows/chat/components/SubDiary.tsx`

职责：

- 在 Sidebar 的 `diary` tab 中展示叶瑄写的日记。
- 挂载时调用 `loadDiaryList()` 读取轻量列表（date / title / emotion），不预拉正文。
- 顶部 filter tabs：始终显示"全部"；扫描列表中出现过的非 null emotion，去重后作为额外 tab；全为 null 时只显示"全部"。
- 时间线滚动，最新在前，每条显示完整日期 + title + em dash 占位。
- 点击 entry 时懒加载正文：调 `loadDiaryEntry(date)` 并通过 `panesApi.openPane()` 打开浮动详情窗。
- 详情窗正文做最简渲染：`\n\n` 切段落 → `<p>`，段内 `\n` → `<br/>`，行首 `## ` → `<h3>`，其他 markdown 原样。
- 顶部有刷新按钮；错误时显示错误文本 + 重试按钮；空状态显示"他还没开始写日记。"
- 不轮询；emotion 字段当前全为 null，遇 null 不渲染标签。

当前数据来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 日记列表 | `loadDiaryList()` → Tauri `load_diary_list` | 从后端 `/diary/list` 读取 |
| 日记正文 | `loadDiaryEntry(date)` → Tauri `load_diary_entry` | 从后端 `/diary/{date}` 懒加载 |

---

## Ribbon

文件：`src/windows/chat/components/Ribbon.tsx`

职责：

- 左侧固定 52px 功能条。
- 切换 Sidebar tab：动向、日记、状态、花园。
- 切换本地 `petVisible`。
- 打开偏好和帮助面板。
- 显示 WS 连接状态角标。

WS 连接状态来自 `wsClient.getState()` 和 `wsClient.on("state")`。

---

## Sidebar

文件：`src/windows/chat/components/Sidebar.tsx`

当前 `garden` 和 `diary` tab 已接入真实数据，其余 tab 仍是占位版：

- `flow`：动向（占位）
- `diary`：他的日记，读取后端日记列表和正文
- `status`：状态（占位）
- `garden`：陪伴花园，读取后端花园状态

`Sidebar.legacy.tsx` 存着原副栏 UI 骨架，供后续真实数据接入时参考，不是当前运行入口。

---

## Panes

文件：`src/windows/chat/components/Panes.tsx`

提供模块级单例 `panesApi` 和 `PaneHost`：

- `openPane()`
- `closePane()`
- `bringToFront()`
- `updatePane()`
- `subscribe()`

当前主界面挂了 `PaneHost`，但运行中的功能入口很少。未来可用于日记详情、花园详情、调试面板等浮动窗口。

---

## UIKit

文件：`src/windows/chat/components/UIKit.tsx`

包含共享视觉小组件和图标：

- `Tag`
- `Card`
- `MicroLabel`
- `HRule`
- `Numeric`
- `Icon`
- `Btn`
- `Meter`
- `Body`

它还定义 UI 层的 mood/activity 英文标签和 mood hue 映射。注意这些映射是视觉层数据，后端情绪名不一定一一对应。

---

## StateEngine

文件：`src/shared/state/store.ts`

当前 engine 是轻量前端状态机：

- 保存 mood/activity/presence/mode。
- 提供 subscribe/emit/get/set。
- `applyStateUpdate()` 可接受后端状态补丁，但尚未接入 WS `state_update`。
- activity 有 duration 时会自动回到默认 activity。

旧原型的 behavior loop 已删除。不要在组件里重新造一套行为状态；未来接后端 `state_update` 时应调用 `engine.applyStateUpdate()`。

---

## AvatarStore

文件：`src/shared/avatars/store.ts`

职责：

- 保存 HER/YOU 头像路径和 data URL。
- 控制 YOU 头像是否显示。
- 通过 Tauri command 读写本地文件。

Tauri 命令：

- `read_avatars_json`
- `write_avatars_json`
- `save_avatar`
- `load_avatar`

本地路径在 Tauri `app_data_dir()` 下。

---

## Theme

文件：`src/shared/theme/globals.css`

主题通过 CSS variables 管理：

- `:root[data-theme="paper"]`
- `:root[data-theme="dark"]`

切换由 `ChatWindow` 设置 `document.documentElement.setAttribute("data-theme", theme)`。

---

## 前端变更规则

- 新增真实后端数据时，协议和请求包装放进 `src/shared/api/`。
- mood/activity/presence 只通过 `StateEngine` 改。
- Sidebar 四个 tab 接数据时优先保留 `Sidebar.tsx` 的占位入口和 `Sidebar.legacy.tsx` 的视觉参考关系。
- 桌宠迁入时不要把宠物状态复制成另一份 store；先设计聊天窗口和宠物窗口共享 engine 的方式。
