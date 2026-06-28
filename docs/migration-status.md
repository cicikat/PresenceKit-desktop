# docs/migration-status.md — 迁移状态

本文档记录从旧桌宠和 UI 原型迁移到 Emerald-client 的状态。它只描述 `Emerald-client` 当前仓库，不代表后端完成度。

---

## 相关项目

| 项目 | 路径 | 角色 | 本仓库是否可改 |
|---|---|---|---|
| Emerald-presence | `D:\ai\Emerald-presence\` | 后端、核心数据、记忆、调度、工具、WS/HTTP 服务 | 默认不可改 |
| Emerald-desktop | `D:\ai\Emerald-desktop\` | 旧 PyQt 桌宠和 Python 感知/行为层 | 默认不可改 |
| Emerald-desktopUI | `D:\ai\Emerald-desktopUI\` | React/JSX UI 原型 | 只读参考 |
| Emerald-client | `D:\ai\Emerald-client\` | 新 Tauri 客户端 | 当前工作区 |

---

## UI 原型迁移映射

| 原型文件 | 当前 client 文件 | 状态 |
|---|---|---|
| `app.jsx` | `src/windows/chat/ChatWindow.tsx` | 已迁主布局；DebugPanel 和 Pet 挂载移除 |
| `chat.jsx` | `src/windows/chat/components/ChatPanel.tsx` | 已迁视觉；已接 HTTP send 和 legacy WS 主动消息 |
| `ribbon.jsx` | `src/windows/chat/components/Ribbon.tsx` | 已迁；新增 WS 连接状态角标 |
| `sidebar.jsx` | `src/windows/chat/components/archive/Sidebar.legacy.tsx` / `Sidebar.tsx` | legacy 骨架保留；所有四个 tab 均已接真实数据 |
| `panes.jsx` | `src/windows/chat/components/Panes.tsx` | 已迁浮动 pane 系统 |
| `spec.jsx` | `src/windows/chat/components/archive/SpecPanel.legacy.tsx` / `SpecPanel.tsx` | legacy 骨架保留；当前运行版是帮助/公告占位 |
| `ui-kit.jsx` | `src/windows/chat/components/UIKit.tsx` | 已迁共享 UI 工具 |
| `state-engine.js` | `src/shared/state/store.ts` | 状态表已迁；behavior loop 删除，等待后端状态 |
| `sidebar.jsx` 中的 SubFlow 视觉 | `src/windows/chat/components/SubFlow.tsx` | 已接真实 mood/activity，叙事文本 + ring buffer 时间轴 |
| `sidebar.jsx` 中的花园视觉 | `src/windows/chat/components/SubGarden.tsx` | 已接后端只读状态，不再是纯 mock |
| `sidebar.jsx` 中的日记视觉 | `src/windows/chat/components/SubDiary.tsx` | 已接后端只读日记，不再是占位 |
| `pet.jsx` | `src/windows/pet/PetWindow.tsx` / `components/ParticleCanvas.tsx` | 已落地独立透明粒子桌宠；具象角色视觉未迁 |
| `companion.html` | `src/shared/theme/globals.css` 等 | 主题变量部分迁入 |

---

## 后端通信迁移状态

| 能力 | 当前状态 | 目标 |
|---|---|---|
| HTTP 发消息 | 已实现：Tauri `send_chat` → `/desktop/chat` | 未来改 WS `user_message` |
| 加载聊天历史（按日懒加载） | 已实现（Phase 2c+）：`load_chat_log_dates` + `load_chat_log_day` → `/chat-log/*` | — |
| 加载短期历史 | 已实现（备用）：Tauri `load_history` → `/memory/{uid}/short-term`，ChatPanel 不再调用；P-02 已将 admin token 来源迁到 client config | 后续确认是否清理备用 uid |
| 加载花园状态 | 已实现：Tauri `load_garden_state` → `/garden/state`；P-02 已将 admin token 来源迁到 client config | 补详情/操作入口 |
| 加载日记列表 | 已实现：Tauri `load_diary_list` → `/diary/list` | emotion 字段后端未产出（返回 null） |
| 加载单篇日记 | 已实现：Tauri `load_diary_entry` → `/diary/{date}` | 懒加载，点击 entry 时才拉正文 |
| WS 连接 | 已实现 legacy 连接和重连 | 升级到 v1 envelope |
| 后端主动消息 | 已实现 `channel_message` | 改 `assistant_message` |
| 情绪状态（持久值） | 已实现并接入 UI：`load_mood_state` → `/mood/state` → SubStatus（Phase 2d.3） | — |
| 活动状态（身体动作） | 已实现并接入 UI：`load_activity_state` → `/activity/current` → SubStatus（Phase 2d.3） | — |
| 状态推送 | 未实现 | 明确推送字段 ownership 后接到 `StateEngine.applyBackendState('state-update', patch)` |
| 用户输入 WS 化 | 未实现 | `user_message` |
| 模式/窗口事件 | 未实现 | `client_event` |
| 桌面 action 执行 | 未实现 | 收 action、执行、返回真实 ack |

---

## 桌宠迁移状态

当前仓库已有独立透明置顶 pet Tauri window。Ribbon 桌宠按钮会显隐窗口、切换
`petVisible` 并调用 `engine.setMode("companion" | "chat-only")`。Chat 通过
`src/shared/pet/bridge.ts` 将 mood / presence / activity / thinking / 最新回复摘要广播给桌宠。

桌宠当前使用抽象粒子视觉，并已实现鼠标交互：

- `惊讶` mood 下光标靠近会缓动躲避，目标位置限制在显示器 work area。
- 随机间隔朝光标轻移并触发蹭的粒子脉冲。
- Ctrl 钉住和拖拽期间暂停自动移动。
- Chat 偏好“其他”页可关闭鼠标交互并配置随机靠近间隔。

后续迁移要解决：

- 具象角色视觉、眨眼与更丰富的姿态行为。
- 是否需要点击穿透和独立桌宠上下文菜单。
- 多窗口 StateEngine 从快照广播升级为更完整的共享状态同步。
- 后端 `state_update` 如何驱动宠物表现。

---

## 花园迁移状态

当前已完成：

- 后端 `Emerald-presence` 提供 `GET /garden/state`。
- Tauri command `load_garden_state` 已接入，HTTP client 使用 `no_proxy()`。
- 前端 `loadGardenState()` 已封装。
- Sidebar `garden` tab 已挂载 `SubGarden`。
- `SubGarden` 展示五个花槽、阶段进度和 bloom 状态。

当前未完成：

- 花园仍只读，没有手动浇水、采收、送花、插花瓶等客户端操作。
- `harvest_count` / `vase_count` 只有计数，没有详情列表。
- P-02 已将 backend base、WebSocket base、admin token 和 sensor config 迁到 client config；`config/client.local.json` 不提交。默认开发 token 仍作为无本地配置时的兼容 fallback，未来可替换为首次启动引导或本机鉴权。
- 后端 garden daily lifecycle 需要真实 scheduler 长跑验证，见 `docs/known-issues.md`。

---

## sensor 感知模块迁移状态

原计划走 Python 独立进程(`sensor-service/`),已改为
**嵌入 Tauri Rust 侧**(`src-tauri/src/sensor/`)。

决策原因:

- 数据通路更短,Rust 抓取后直接 POST,不经过 IPC
- 隐私清洗在同一进程内完成,原始键鼠/窗口标题不离开
  `title_sanitizer` 函数
- `title_sanitizer` 采用白名单输出：Browser 仅保留域名，Editor 仅保留安全 basename；
  Chat、Other、未知应用及 Explorer / Office / PDF / 压缩工具不返回 `title_hint`
- 单进程模型,无需 daemon 管理
- Rust 跨平台键鼠/窗口 API 比 Python 更稳定

当前 `sensor-service/` 目录已废弃,保留目录是为后续物理清理
时统一处理,不再有新代码进入。

规划目录:

```text
src-tauri/src/sensor/
├── mod.rs
├── aggregator.rs       # 30s 窗口聚合
├── publisher.rs        # POST /sensor/realtime
├── input_hook.rs       # 键鼠 hook 抽象
├── focus_window.rs     # 焦点窗口抓取抽象
├── title_sanitizer.rs  # title_hint 清洗
└── platform/
    ├── windows.rs      # Windows 实现(本期)
    ├── macos.rs        # 占位,后期补
    └── linux.rs        # 占位,后期补
```

后端相关接口已就绪(Phase 2e):

- `POST /sensor/realtime`(主要消费方,本规划目标)
- `GET /sensor/realtime`
- `POST /sensor/activity`(屏幕识别用,Phase 2f 之后另规划)
- `POST /sensor/push`(手机端 APP 用,与本规划无关)
- `GET /sensor/status`
- `GET /sensor/today`

---

## 文档迁移状态

已在本仓库新增：

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/backend-integration.md`
- `docs/frontend-structure.md`
- `docs/migration-status.md`
- `docs/known-issues.md`

外部参考文档位置：

- 旧桌面方案：`D:\ai\Emerald-desktop\docs\desktop-client-plan.md`
- 旧桌面协议：`D:\ai\Emerald-desktop\docs\desktop-client-protocol.md`
- 后端总览：`D:\ai\Emerald-presence\ARCHITECTURE.md`
- 后端细节：`D:\ai\Emerald-presence\docs\`

注意：旧入口文档曾指向 `D:\ai\Emerald-presence\docs\desktop-client-protocol.md`，但当前该文件不在后端 docs 目录。

---

## 建议迁移顺序

1. 先对齐后端和客户端 WS 协议：明确是继续 legacy 过渡，还是直接实现 v1。
2. 修 action ack：未实现动作前不要回成功。
3. 评估是否清理备用历史 user id；长期把默认开发 token fallback 替换为首次启动引导或本机鉴权。
4. 接 `state_update` 到 `StateEngine`。
5. 补花园详情/操作入口，或明确它长期只是只读陪伴状态。
6. 再做桌宠窗口，否则桌宠缺少后端权威状态。
7. 最后实施 sensor 感知模块(嵌入 Tauri Rust,
   见"sensor 感知模块迁移状态")。

---

## 判断一个迁移是否完成

一个模块迁移完成至少要满足：

- 有明确运行入口。
- 不依赖旧项目文件运行。
- 与后端真实接口对齐。
- 文档更新到本仓库。
- 已知缺口写入 `docs/known-issues.md`。
