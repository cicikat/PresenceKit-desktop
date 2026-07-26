# AGENTS.md — PresenceKit-desktop 工作入口

> 每次开始任务前必读。本文档描述本仓库根目录（本文件所在目录，可整体改名/移盘）的真实边界、当前实现和文档入口。

---

## 项目定位

PresenceKit-desktop 是 `PresenceKit` AI 陪伴系统的新桌面客户端，技术栈是 Tauri + React + TypeScript。

它目标上包含两个 view：

- 主聊天窗口：Obsidian 风格布局，Ribbon + Sidebar + ChatPanel。
- 桌宠窗口：透明、置顶、可交互的陪伴形象窗口。

当前实际状态：

- 主聊天窗口已经完成视觉迁移，并接入了部分后端通信。
- Sidebar 的花园 tab 已接入后端 `GET /garden/state`，当前是只读展示。
- Dream Sidebar 的潜意识 tab 已将 Phase 4.5 Hidden State UI 从 debug-only 入口提升为单用户只读状态面板。
- WebSocket 目前是 legacy 协议订阅层，不是最终 v1 协议实现。
- 桌宠 view 已落地在 `src/windows/pet/`：独立透明置顶窗口支持粒子、3D 和 Live2D 舞台，
  通过主窗口转发的 Tauri 事件接收状态/说话信号；鼠标躲避、靠近和拖拽由 `usePetMouse.ts` /
  `usePetRoam.ts` 驱动。它不自行连接 WebSocket。
- sensor 感知功能已嵌入 Tauri Rust 侧（`src-tauri/src/sensor/`）。
- v0.1 已冻结发布范围，详见 `docs/release-v0.1.md`。

不在本项目范围内的事：

- 不修改 `Emerald-presence` 仓库（通常与本仓库同级），它是后端和核心数据项目。
- 不修改 `Emerald-desktop` 仓库（通常与本仓库同级），它是旧桌宠客户端。
- 不修改 `Emerald-desktopUI` 仓库（通常与本仓库同级），它是 UI 迁移参考原型，只读。

---

## 代码根目录

本文件所在目录即仓库根。所有路径一律相对仓库根书写，不依赖盘符或上级目录名。

---

## 协作约定（Claude / Codex 共用）

本节同步 `CLAUDE.md` 的协作规则，使 Codex 在默认读取本 `AGENTS.md` 时也获得同一施工约定：

1. 用中文回复；默认自主推进、替用户拍板，只在删数据、改契约、对外发布等不可逆决策前提问。
2. 先按本文件和 `ARCHITECTURE.md` 定位，再做精确检索；检索排除 `node_modules/`、`dist/`、`src-tauri/gen/`、`src-tauri/target/`。
3. 多个独立交付物一次性批量输出，并标明可并行项与前置依赖；每个独立修复验收后应小步 commit。
4. 代码、脚本和文档不得写盘符绝对路径，统一相对仓库根；`start-dev.bat` 用 `%~dp0`。
5. 本机密钥仅放在 gitignore 文件（`config/client.local.json`）；提交的仅为 `*.example.*` 占位文件。

---

## 必读文档

| 任务类型 | 必读文档 |
|---|---|
| 理解客户端全貌 | `ARCHITECTURE.md` |
| 改聊天窗口、Ribbon、Sidebar、样式 | `docs/frontend-structure.md` |
| 改后端通信、协议、Tauri IPC | `docs/backend-integration.md` |
| 改记忆 / 潜意识 / hidden state UI | `docs/memory.md` |
| 改 Dream HUD / 梦境状态展示 | `docs/dream-hud.md` |
| 改桌宠窗口、模型舞台或鼠标互动 | `docs/pet-window-reference.md` |
| 改 mod / Layout Registry / 布局排布 | `docs/layout-mods.md`（主题 mod 同读 `docs/ui-mods.md`） |
| 改系统边界或跨 pipeline 行为 | `docs/design-constraints.md` |
| 导入 Live2D / Room 模型 | `docs/人类说明书/` 下对应导入指南 |
| 查 bug、技术债、迁移缺口 | `docs/known-issues.md` |

后端系统本身的细节以 `Emerald-presence` 仓库（通常与本仓库同级）的 `AGENTS.md` 和它的 `ARCHITECTURE.md` / `docs/` 为准。
在 Codex / Claude Code Windows 沙箱中运行 build、pytest、跨仓 git 或浏览器验证前，
必须阅读 `Emerald-presence` 仓库的 `docs/dev-environment.md`。

---

## 当前目录结构

```text
src/
├── main.tsx
├── windows/
│   ├── activity/       # 全屏活动空间：阅读、五子棋、国际象棋、梦种
│   ├── chat/           # 主聊天布局、Ribbon、Sidebar 和聊天面板
│   ├── diary-detail/   # 单篇日记独立 Webview 窗口
│   ├── dream/          # 正式 Dream overlay、HUD、潜意识只读面板
│   ├── pet/            # 透明置顶桌宠、模型/粒子舞台和鼠标互动
│   ├── presence-nag/   # 单实例存在感提醒透明窗口
│   ├── room/           # 视频通话场景：3D/Live2D 舞台与 VN 对话呈现
│   └── toy/            # 玩耍模式：硬件状态和独立聊天界面
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
| sensor 感知(键鼠/焦点窗口) | `src-tauri/src/sensor/` |
| 潜意识 / hidden state 只读展示 | `src/windows/dream/components/SubHiddenStatePanel.tsx` + `src/shared/api/backend.ts` |
| 活动空间 | `src/windows/activity/` + `src/shared/api/activity-api.ts` |
| 视频通话房间 | `src/windows/room/` + `src/shared/room/` |
| 日记详情独立窗口 | `src/windows/diary-detail/` + `src/windows/chat/components/SubDiary.tsx` |

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
9. 不要修改 `Emerald-presence`、`Emerald-desktop`、`Emerald-desktopUI` 仓库（通常与本仓库同级），除非用户明确改范围。
10. 沙箱中 `npm run build` 若因 `node_modules/.vite-temp` 写入报 `EPERM`，这是环境权限问题；
    对原命令申请权限后重跑，不能只跑 `tsc` 就宣称 build 通过。
11. 跨仓 git 遇到 `dubious ownership` 时使用单命令参数
    `git -c safe.directory=<仓库根> ...`，不要擅自修改全局 git 配置。
12. 新增或修改用户可见文案必须通过 `src/shared/i18n/` 的语义 i18n key；禁止在组件中继续写死中文。`legacy.ts` 仅用于兼容迁移前的既有文案，不得向其中追加新功能文案。

---

## 后端连接信息

当前实际后端：

- 后端项目：`Emerald-presence` 仓库（通常与本仓库同级）
- 默认管理服务：`http://127.0.0.1:8080`
- WebSocket：`ws://127.0.0.1:8080/ws/desktop`
- HTTP 对话：`POST http://127.0.0.1:8080/desktop/chat`
- 短期历史：`GET http://127.0.0.1:8080/memory/{user_id}/short-term`
- 花园状态：`GET http://127.0.0.1:8080/garden/state`
- 潜意识状态：`GET http://127.0.0.1:8080/debug/user-hidden-state`，经 Tauri `load_hidden_state_debug` 只读转发；显隐开发者字段时只读参考 `/dream/settings` 的 `display.physiological_arousal`

协议状态：

- 后端当前实际 WS 协议是 v0.1 冻结的 legacy 集合；消息全集、字段、ack/nack 语义和 action allowlist 以 `docs/protocol-v0.md` 为唯一权威，不要依据本入口文件中的简写自行扩展。
- v1 目标协议文档目前在旧项目：`Emerald-desktop` 仓库（通常与本仓库同级）的 `docs/desktop-client-protocol.md`。
- `Emerald-presence/docs/` 目前没有 `desktop-client-protocol.md` 和 `desktop-client-plan.md`，不要按旧路径假定存在。

---

## 启动方式

```bash
# 纯前端开发
npm run dev

# Tauri 桌面应用开发
npm run tauri dev

# 生产构建
npm run tauri build

# Agent 验证：前端和 Rust 分开检查
npx.cmd tsc --noEmit
npm.cmd run build
cd src-tauri
cargo check
```

GitHub Actions `ci.yml` 会在 main 的 push / PR 覆盖同套前端检查，以及 Windows 上的 `cargo check`。

Vite 固定端口是 `1420`，见 `vite.config.ts`。

---

## 测试约定

- 前端纯逻辑测试用 vitest，`npm test` 运行；测试文件与被测文件同级、同名加 `.test.ts` 后缀（例如 `activity-api.ts` → `activity-api.test.ts`），不使用 `__tests__/` 目录。
- 不引入 jsdom 或组件测试栈；只测纯函数/纯逻辑。若某文件的顶层 import 链会触碰 `window`/`localStorage`（如 `ws.ts` 经 `presenceNag`/`activeCharacter` 引到 `uiPreferences.ts`），把要测的纯函数拆到独立、无副作用 import 的模块（如 `wsActionParams.ts`）里，再测那个模块。
- `src/shared/api/activity-api.ts` 的 Tauri command 名称和请求/响应字段形状，是本仓对 Emerald-presence `tests/test_activity_contract.py` 的己方权威锁定：改字段名或 command 名时 `npm test` 必须能感知到。

## 文档维护约定

- 改接口、协议、IPC command 时，同步更新 `docs/backend-integration.md`。
- 改窗口结构、状态流、组件职责时，同步更新 `ARCHITECTURE.md` 和 `docs/frontend-structure.md`。
- 继续迁移旧桌宠或原型 UI 时，同步更新 `ARCHITECTURE.md` 的「迁移关系」和 `docs/frontend-structure.md` 的对应窗口章节。
- 发现未修问题，先记到 `docs/known-issues.md`，标明影响、证据和建议修复方向。


## 设置控制面文档

修改模型路由、TTS、scheduler、relay、thinking、tool loop 或高级功能开关时，必须同步 docs/settings-control-audit.md，不得把配置字段存在写成已有 UI。
