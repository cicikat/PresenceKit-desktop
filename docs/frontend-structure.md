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

- 按日文件懒加载历史对话（Phase 2c+），启动拉今日，不足 10 条兜底一次昨日。
- 滚到顶时懒加载更早一天，保持滚动位置不跳。
- 用户发送时调用 `sendChat()`。
- 订阅 WS `channel_message`，显示后端主动消息。
- 根据 engine mood/activity/presence 渲染 header 标签、头像呼吸和 typing 指示。

当前消息来源：

| 来源 | 路径 | 说明 |
|---|---|---|
| 启动历史 | `loadChatLogDates()` + `loadChatLogDay(date)` → Tauri `load_chat_log_dates` / `load_chat_log_day` | 按日文件从后端 `/chat-log/*` 读取 |
| 用户发送 | `sendChat()` → Tauri `send_chat` | 当前走 HTTP `/desktop/chat` |

**与 `/memory/{uid}/short-term` 的关系**：`loadHistory()` 客户端函数仍保留，`/memory/{uid}/short-term` 后端接口也未删除，但 ChatPanel 启动逻辑不再调用它。后续 mood 推断等模块如有需要仍可使用。

**日期处理**：所有日期加减使用 `date-fns`（`format` / `subDays` / `parseISO`），不手算 month/day。

**按日懒加载状态**（均用 ref 避免闭包陷阱）：

| ref | 说明 |
|---|---|
| `availableDatesRef` | 后端返回的全部可用日期（倒序） |
| `loadedDatesRef` | 已加载到前端的日期列表（从早到晚） |
| `isLoadingMoreRef` | 防重复触发 |
| `noMoreHistoryRef` | 到头后停止触发 |
| 主动推送 | `wsClient.on("channel_message")` | legacy WS 消息 |

注意：

- `send()` 顶部注释仍写着“TODO WebSocket”，但实际已经接了 HTTP 后端。
- v1 目标协议要求用户消息走 WS `user_message`，当前未实现。

---

## SubFlow

文件：`src/windows/chat/components/SubFlow.tsx`

职责：

- 在 Sidebar 的 `flow` tab 中展示叶瑄此刻的动向（Live Feed）。
- 自己启动 mood（60s）和 activity（90s）的后台轮询，写入 engine。若 SubStatus 同时挂载，两份轮询并存是可接受代价，不做去重协调。
- 从 engine `activity / focus / presence` 派生叙事文本（`buildNarrative`），不发起新网络请求。
- 维护组件内 ring buffer（最多 10 条），追踪 activity/focus 变化历史。

`buildNarrative(activity, focus, presence)` 模板（优先级从高到低）：

| 条件 | 输出 |
|---|---|
| `presence === 'away'` | `他不在。` |
| `activity.id === 'watching_you'` | `他坐在那儿，看着你。` |
| 通用 | `{activityPhrase}{focusPhrase}{idleTrailing}` |

- `activityPhrase`：`他{activity.text}`（`{book}` 占位符替换为 `读着书`）；activity 为 null 时用 `他坐在那儿`
- `focusPhrase`：7 个固定映射，均以 `，` 开头、`。` 结尾；无匹配时降级为 `。`
- `idleTrailing`：`presence === 'idle'` 时追加 `（他安静了一会儿。）`

Ring buffer：`useState<FlowEntry[]>` 长度上限 10；按 `text|mood` 联合键去重（连续相同不 push）；显示文本 = `activity.text`，activity 为 null 时用 `state.focus` 中文名兜底；30s 定时器驱动时间标签重渲染。

数据源：

| 来源 | 路径 | 轮询 |
|---|---|---|
| mood | `loadMoodState()` → `engine.applyStateUpdate({mood})` | 60s |
| activity | `loadActivityState()` → `engine.set({activity})` | 90s |
| focus / presence | engine 现有值（由 ChatPanel 交互驱动） | — |

---

## SubStatus

文件：`src/windows/chat/components/SubStatus.tsx`

职责：

- 在 Sidebar 的 `status` tab 展示叶瑄持续状态信号。
- 启动时拉 mood/activity 真实数据并写入 engine，之后定期轮询。
- 从 engine state 派生 4 个可感知信号（前端 derived，不进 engine state）。
- 维护 60 格 ring buffer，2 秒采样一次，呈现近 2 分钟 mood 轨迹。

数据源：

| 来源 | 路径 | 轮询 |
|---|---|---|
| mood 后端持久值 | `loadMoodState()` → `/mood/state` → `engine.applyStateUpdate({mood})` | 30s |
| activity 身体动作 | `loadActivityState()` → `/activity/current` → `engine.set({activity})` | 60s |
| sensor 实时快照 | `loadSensorRealtime()` → `/sensor/realtime` → 真实键鼠/焦点数据 | 10s |
| presence | engine 现有值（默认 active）；sensor 可用时仅参与 4 个信号派生，不写入 engine | — |
| focus | ChatPanel 输入驱动，SubStatus 不动 | — |

持续可感知信号公式（均为前端 derived，0-100）：

| 信号 | 来源 | CSS transition |
|---|---|---|
| 呼吸频率 `breath` | sensor 可用时按键击/秒与 sensor presence 派生；不可用时回退 mood/presence 偏移 | 2s ease |
| 视线锁定度 `gaze_lock` | sensor 可用时按 stale_seconds 与 switch_count 派生；不可用时回退 focus 映射 | 0.1s ease |
| 情绪光晕 `mood_aura` | 按 mood 映射固定值（平静→20…病娇→90） | 3s ease |
| 节奏不规则 `rhythm` | sensor 可用时按键鼠比例偏离 + mood 基线 + spike 派生；不可用时回退原 mood 基准 + spike | 0.5s ease |

Ring buffer：`useState<{mood, aura}[]>` 长度 60；2s 采样；mood 轨迹柱状图，每格高度 = aura %，颜色 = MOOD_HUE。

后端连接失败：顶部显示小型警告条 + 重试按钮，UI 继续显示 engine 当前值，不 crash。

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

所有四个 tab 已接入真实数据：

- `flow`：动向，挂 `SubFlow`，从 engine 读 mood/activity/focus/presence
- `diary`：他的日记，读取后端日记列表和正文
- `status`：状态，挂 `SubStatus`，持续轮询 mood/activity
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

- 保存 mood / focus / presence / mode / activity。
- 提供 subscribe/emit/get/set。
- `applyStateUpdate()` 可接受后端状态补丁，但尚未接入 WS `state_update`。
- focus 有 duration 时会自动回到默认 focus。

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `mood` | `Mood`（7 个中文状态） | 情绪，对应 MOOD_TABLE 视觉参数 |
| `focus` | `Focus`（7 个中文状态） | 注意力指向（原 `activity` 字段，已重命名）；前端本地推断 |
| `presence` | `Presence` | active / idle / away |
| `activity` | `{ id, text, arc, thinkingAboutEligible } \| null` | 后端身体动作（来自 activity_manager）；初始 null，接口可调但暂未挂组件 |

`MOODS` 已扩展为 7 个：`['平静', '开心', '低落', '病娇', '分心', '生气', '惊讶']`。

`FOCUS_TABLE`（原 `ACTIVITY_TABLE`）仍保持 7 条注意力指向配置，与后端 16 条身体动作无关。

旧原型的 behavior loop 已删除。不要在组件里重新造一套行为状态；未来接后端 `state_update` 时应调用 `engine.applyStateUpdate()`。

情绪映射：`src/shared/state/mood-mapping.ts` 提供 `backendMoodToFrontend(token)` 将后端英文 token 转换为前端 7 个中文 Mood 之一。

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
