# AGENTS.md — Emerald-client 工作入口

> 每次开始任务前必读。本文档描述 `D:\ai\Emerald-client\` 的真实边界、当前实现和文档入口。

---

## 项目定位

Emerald-client 是 `qq-st-bot` AI 陪伴系统的新桌面客户端，技术栈是 Tauri + React + TypeScript。

它目标上包含两个 view：

- 主聊天窗口：Obsidian 风格布局，Ribbon + Sidebar + ChatPanel。
- 桌宠窗口：透明、置顶、可交互的陪伴形象窗口。

当前实际状态：

- 主聊天窗口已经完成视觉迁移，并接入了部分后端通信。
- Sidebar 的花园 tab 已接入后端 `GET /garden/state`，当前是只读展示。
- Dream Sidebar 的潜意识 tab 已将 Phase 4.5 Hidden State UI 从 debug-only 入口提升为单用户只读状态面板。
- WebSocket 目前是 legacy 协议订阅层，不是最终 v1 协议实现。
- 桌宠 view 还没有在 `src/windows/pet/` 落地；Ribbon 的桌宠按钮目前只切本地状态。
- sensor 感知功能将嵌入 Tauri Rust 侧(`src-tauri/src/sensor/`),
  不再使用 `sensor-service/` Python 独立进程方案。该目录骨架
  已废弃,后续清理。

不在本项目范围内的事：

- 不修改 `D:\ai\qq-st-bot\`，它是后端和核心数据项目。
- 不修改 `D:\ai\Emerald-desktop\`，它是旧桌宠客户端。
- 不修改 `D:\ai\Emerald-desktopUI\`，它是 UI 迁移参考原型，只读。

---

## 代码根目录

```text
D:\ai\Emerald-client\
```

---

## 必读文档

| 任务类型 | 必读文档 |
|---|---|
| 理解客户端全貌 | `ARCHITECTURE.md` |
| 改聊天窗口、Ribbon、Sidebar、样式 | `docs/frontend-structure.md` |
| 改后端通信、协议、Tauri IPC | `docs/backend-integration.md` |
| 改记忆 / 潜意识 / hidden state UI | `docs/memory.md` |
| 继续旧客户端迁移 | `docs/migration-status.md` |
| 查 bug、技术债、迁移缺口 | `docs/known-issues.md` |

后端系统本身的细节以 `D:\ai\qq-st-bot\AGENTS.md` 和它的 `ARCHITECTURE.md` / `docs/` 为准。

---

## 当前目录结构

```text
src/
├── main.tsx
├── windows/
│   └── chat/
│       ├── ChatWindow.tsx
│       └── components/
│           ├── AvatarCropper.tsx
│           ├── ChatPanel.tsx
│           ├── Panes.tsx
│           ├── Ribbon.tsx
│           ├── Sidebar.tsx
│           ├── SubGarden.tsx
│           ├── SubHiddenStatePanel.tsx
│           ├── SpecPanel.tsx
│           └── UIKit.tsx
├── shared/
│   ├── api/
│   │   ├── backend.ts
│   │   ├── types.ts
│   │   └── ws.ts
│   ├── avatars/store.ts
│   ├── state/store.ts
│   └── theme/globals.css
src-tauri/
├── src/lib.rs
├── tauri.conf.json
└── capabilities/default.json
sensor-service/
└── 已废弃(原 Python 方案),sensor 改为嵌入 src-tauri/src/sensor/
```

注意：旧入口说明里写过 `src/shared/ws/`，但当前实现实际在 `src/shared/api/ws.ts`。

---

## 任务关注点

| 任务类型 | 重点位置 |
|---|---|
| UI / 样式 | `src/windows/chat/components/`、`src/shared/theme/globals.css` |
| 前端状态 | `src/shared/state/store.ts` |
| WebSocket / HTTP 包装 | `src/shared/api/` |
| Tauri IPC / 后端 HTTP 桥 | `src-tauri/src/lib.rs` |
| Tauri 权限 / 窗口配置 | `src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json` |
| 头像本地存储 | `src/shared/avatars/store.ts` + `src-tauri/src/lib.rs` |
| sensor 感知(键鼠/焦点窗口) | `src-tauri/src/sensor/`(规划中) |
| 潜意识 / hidden state 只读展示 | `src/windows/dream/components/SubHiddenStatePanel.tsx` + `src/shared/api/backend.ts` |

---

## 强制规则

1. TypeScript 当前不是严格类型化项目，功能迁移优先；必要时可以用 `any` / `unknown`，但要加 `// TODO: type`。
2. 不要简单改文件后缀。`.jsx` 到 `.tsx` 必须真正改造类型、导入和运行方式。
3. WebSocket / 后端通信必须集中在 `src/shared/api/` 或未来统一迁移到 `src/shared/ws/`，不要把协议细节散进组件。
4. 本地状态修改必须走 `StateEngine`，不要在多个组件里复制一份 mood / activity / presence 真值。
5. 桌宠窗口和聊天窗口未来必须共享同一份 engine 状态；如果拆成 Tauri 多窗口，需要明确 IPC / store 同步方案。
6. 所有出站 HTTP 请求必须显式禁用代理。Rust 侧用 `reqwest::Client::builder().no_proxy()`。
7. 不要用浏览器原生 `fetch` 直接打后端 HTTP；CORS 和代理规则都不稳定。HTTP 走 Tauri command。
8. 浏览器原生 WebSocket API 不读系统代理环境变量，当前可以直接连 `ws://127.0.0.1:8080/ws/desktop`。
9. 不要修改 `D:\ai\qq-st-bot\`、`D:\ai\Emerald-desktop\`、`D:\ai\Emerald-desktopUI\`，除非用户明确改范围。

---

## 后端连接信息

当前实际后端：

- 后端项目：`D:\ai\qq-st-bot\`
- 默认管理服务：`http://127.0.0.1:8080`
- WebSocket：`ws://127.0.0.1:8080/ws/desktop`
- HTTP 对话：`POST http://127.0.0.1:8080/desktop/chat`
- 短期历史：`GET http://127.0.0.1:8080/memory/{user_id}/short-term`
- 花园状态：`GET http://127.0.0.1:8080/garden/state`
- 潜意识状态：`GET http://127.0.0.1:8080/debug/user-hidden-state`，经 Tauri `load_hidden_state_debug` 只读转发；显隐开发者字段时只读参考 `/dream/settings` 的 `display.physiological_arousal`

协议状态：

- 后端当前实际 WS 协议仍是 legacy：`hello` / `hello_ack` / `channel_message` / `action` / `ack` / `ping` / `pong`。
- v1 目标协议文档目前在旧项目：`D:\ai\Emerald-desktop\docs\desktop-client-protocol.md`。
- `qq-st-bot/docs/` 目前没有 `desktop-client-protocol.md` 和 `desktop-client-plan.md`，不要按旧路径假定存在。

---

## 启动方式

```bash
# 纯前端开发
npm run dev

# Tauri 桌面应用开发
npm run tauri dev

# 生产构建
npm run tauri build
```

Vite 固定端口是 `1420`，见 `vite.config.ts`。

---

## 文档维护约定

- 改接口、协议、IPC command 时，同步更新 `docs/backend-integration.md`。
- 改窗口结构、状态流、组件职责时，同步更新 `ARCHITECTURE.md` 和 `docs/frontend-structure.md`。
- 继续迁移旧桌宠或原型 UI 时，同步更新 `docs/migration-status.md`。
- 发现未修问题，先记到 `docs/known-issues.md`，标明影响、证据和建议修复方向。
