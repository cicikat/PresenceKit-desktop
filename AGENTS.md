# AGENTS.md — Emerald-client CC 工作入口

> 每次开始任务前必读此文件。

---

## 项目定位

Emerald-client 是 qq-st-bot 系统的桌面客户端,Tauri + React + TypeScript。
**它是一个项目里的两个 view**:
- 主聊天窗口(Obsidian 风,Ribbon + Sidebar + ChatPanel)
- 桌宠模块(透明置顶圆形立绘 + 对话气泡)

不在本项目范围内的事:
- 不动 D:\ai\qq-st-bot\(后端,独立项目)
- 不动 D:\ai\Emerald-desktop\(老桌宠,迁移阶段不动)
- D:\ai\Emerald-desktopUI\ 是迁移参考,不修改

---

## 代码根目录
D:\ai\Emerald-client\

---

## 目录结构
src/
├── main.tsx                      入口
├── windows/
│   ├── chat/                     聊天窗口(Phase 2a 已迁)
│   │   ├── ChatWindow.tsx
│   │   └── components/
│   │       ├── ChatPanel.tsx     主对话区(send() 暂未连后端)
│   │       ├── Ribbon.tsx
│   │       ├── Sidebar.tsx
│   │       ├── SpecPanel.tsx     (stub,内容待补)
│   │       ├── UIKit.tsx
│   │       └── Panes.tsx
│   └── pet/                      桌宠窗口(Phase 4 做)
├── shared/
│   ├── state/store.ts            engine(原 state-engine.js)
│   ├── ws/                       (Phase 2b 实现)
│   ├── theme/globals.css         全局样式
│   └── types/
└── assets/
src-tauri/                        Tauri Rust 主进程(Phase 4 之前不动)
sensor-service/                   Python 感知服务(Phase 5 做)

---

## 任务 → 重点关注

| 任务类型 | 重点 |
|---|---|
| 改 UI / 样式 | src/windows/chat/components/ + shared/theme/ |
| 改状态管理 | src/shared/state/store.ts(engine 实例) |
| 加 WebSocket / 后端通信 | src/shared/ws/ |
| 改 Tauri 窗口 / 系统集成 | src-tauri/ |
| 改感知层 / 行为层 | sensor-service/ |

---

## 改代码前的强制规则

1. **TypeScript 类型问题用 any/unknown 糊过去**——本项目尚未做严格类型化,优先把功能跑通,加 `// TODO: type` 注释即可
2. **不要简单改文件后缀**——.jsx → .tsx 必须真正改造代码,不能只 rename
3. **不要修改 D:\ai\Emerald-desktopUI\**(原型,只读参考)
4. **WebSocket 连接走 src/shared/ws/**,不要把 WS 逻辑塞进组件
5. **state 修改必须走 engine**(单一可信源),不要在组件里直接维护重复状态
6. **桌宠窗口和聊天窗口共享同一份 engine 实例**——通过 Tauri IPC 或单一进程内的 Context
7. **所有出站 HTTP/WS 请求必须显式禁用代理**。
   - Rust 侧（plugin-http / 自写 command）：用 `reqwest::Client::builder().no_proxy()`
   - 不要依赖 std::env::remove_var，reqwest 初始化时已读取环境变量
   - 不要用浏览器原生 fetch（被 CORS 挡）
   - WebSocket：浏览器原生 WebSocket API 不读环境变量，可以直接用

---

## 后端连接信息

- 后端项目:D:\ai\qq-st-bot\
- WebSocket 端点:ws://127.0.0.1:8080/ws/desktop
- 协议规范:D:\ai\qq-st-bot\docs\desktop-client-protocol.md
- 客户端方案:D:\ai\qq-st-bot\docs\desktop-client-plan.md

---

## 启动方式

```bash
# 纯前端开发(无 Rust 需求)
npm run dev          # → http://localhost:1420

# Tauri 桌面应用开发(需要 Rust)
npm run tauri dev    # 第一次编译 5-10 分钟

# 生产构建
npm run tauri build
```

---

## 当前阶段

Phase 2a 已完成(前端视觉迁移)。下一步 Phase 2b:接 WebSocket。
详细路线见 D:\ai\qq-st-bot\docs\desktop-client-plan.md。