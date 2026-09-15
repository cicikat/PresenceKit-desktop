[English](README.md) | [简体中文](README.zh-CN.md)

# PresenceKit-desktop

[PresenceKit](https://github.com/cicikat/PresenceKit)（有长期记忆和情绪状态的 AI 陪伴后端）的 Tauri + React + TypeScript 桌宠 + 管理面板客户端。

本客户端负责聊天窗口、桌宠形象，以及只读的花园/日记/状态面板；不拥有任何人格、记忆或调度数据——这些都在后端。

**必须搭配运行中的 PresenceKit 后端使用**，见[后端快速开始](https://github.com/cicikat/PresenceKit#快速开始)。本客户端单独运行无法工作。

另有配套的 [PresenceKit-mobile](https://github.com/cicikat/PresenceKit-mobile) 手机客户端。两端共用后端，功能并不一一对应：桌宠窗口、键鼠感知、视频通话舞台、Design Mod 和原生管理面板入口是桌面端才有的。

---

## 下载

预编译 Windows 安装器见本仓 [GitHub Releases](https://github.com/cicikat/PresenceKit-desktop/releases)。兼容的 [PresenceKit 后端](https://github.com/cicikat/PresenceKit/releases) 版本见对应 Release notes。

安装器未做代码签名（本项目目前不购买代码签名证书），下载安装前请留意：

- **Edge 浏览器可能会直接拦截下载**，下载栏里点「保留」也不一定生效。遇到这种情况，建议改用 Chrome 下载；或按微软官方步骤手动保留被拦截的下载（[管理不安全网站警告](https://support.microsoft.com/zh-cn/topic/e0aae59d-a67c-2b90-8006-b3f2b8f232ed)）。
- 首次运行 Windows SmartScreen 会提示"未识别的应用"——点击**更多信息 → 仍要运行**即可，这是未签名安装包的预期提示，不代表安装包有问题。
- 如果有多块盘，**建议安装/解压到非系统盘**（如 `D:\`），放在 `C:\` 下可能会遇到额外的权限提示和杀毒软件扫描开销。
- GitHub Releases 同时提供 **macOS Universal** `.dmg`。该包是 experimental：未签名、未公证，不含桌面感知采集，仍需真实 Mac 冒烟。Gatekeeper 说明见 [docs/release-v0.1.md](docs/release-v0.1.md)。

---

## 功能

左侧 Ribbon 是应用的主地图。底部是偏好（齿轮）和帮助。

### 聊天

- HTTP 发送 + WebSocket 流式回复，历史按日加载。
- 引用自己的上一条消息；剪贴板图片和附件可先预览再发送或清空。
- 可选气泡透明度、情绪装饰，以及历史里保留的行内样式。
- 可选的逐条**内心旁白**，以及独立的**展开思考**入口（按 canonical 回合读取；开关在「角色与对话」）。
- 工具活动链和简短动作叙述，用来显示后端正在做什么。
- 群聊，以及群梦邀请。单聊 / 通话流与群聊、梦境动画隔离。

### 侧栏（除特别说明外只读）

- **动向** — 当前活动和短时间线。
- **日记** — 列表与正文；单篇可开独立窗口。
- **状态** — 情绪、在场和相关状态。
- **花园** — 五个花槽、阶段、收获数和花瓶数。浇水 / 收获不在本客户端。

### 陪伴窗口

- **桌宠** — 独立透明置顶窗口。粒子 / 3D / Live2D 舞台；鼠标躲避、蹭、拖拽；漫游与涟漪；本机窗口缩放。桌宠自己不连 WebSocket。
- **梦境** — sandbox / scenario / mirror / RPG 覆盖层，含 HUD、潜意识面板和归档回放。梦境配色、字号和背景与现实聊天分开。
- **一起做事** — 阅读、五子棋、国际象棋、梦种；不拆掉主聊天会话。
- **玩耍模式** — 可选硬件 / 玩具窗口（默认关闭，在「桌宠与互动」打开）。
- **视频通话** — 3D 或 Live2D 舞台、环境视觉，以及视觉小说式旁白。
- **存在感弹窗** — 单实例透明置顶提醒，默认关闭。

### 偏好

分类：常规、界面、角色与对话、桌宠与互动、高级。

- 后端地址与桌面 token、语言、日记同步，以及**本机截图同意**（后端可以请求截屏，本机仍要单独点同意）。
- 日夜主题、布局、字体、聊天 / 梦境配色实时预览、本地 HER/YOU 头像，以及当前角色头像裁切。
- 3D 与 Live2D 模型分开选择，TTS 播放、通话和陪玩控制。
- 从宿主菜单打开后端**管理面板**，去改模型路由、世界书、工具、浏览器任务和生活记录设置。这些不在本客户端偏好表单里编辑。

模型绑定、工具循环、思考生成、浏览器任务 allowlist、原生生活记录采集属于后端管理面（或手机端）。本客户端不再提供这些表单。

### Design Mod、主题、布局

受信任的 Design Mod 可以重排窗口内壳（附带示例：苔庭）。布局 Mod 重排 Ribbon / 侧栏 / 主区域。主题 Mod 在 `public/themes/`。写作说明见 [docs/design-mod-authoring.md](docs/design-mod-authoring.md)、[docs/layout-mods.md](docs/layout-mods.md)、[docs/ui-mods.md](docs/ui-mods.md)。

### 仅桌面端的感知

**Windows** 上 Tauri 进程可采集键鼠 / 焦点窗口信号给后端。macOS 包会记录 `sensor_not_supported_on_macos` 后继续启动，不会上传伪造的全零数据。

---

## 连接后端

默认情况下客户端会连接同一台机器上的 `http://127.0.0.1:8080`。如需连接其他地址或填写设备 token：

- **推荐方式**：打开应用 → 偏好设置 → 连接设置，在界面里直接填写后端地址和 token，无需手动改文件。
- **进阶 / 无界面场景**：把 `config/client.example.json` 复制为 `config/client.local.json`，直接编辑 `backendBase`、`websocketBase`、`adminToken`。

完整的 HTTP/WS/Tauri-IPC 协议见 [docs/backend-integration.md](docs/backend-integration.md)；如何签发桌面端专属 token 见后端仓库的 [docs/token-rotation.md](https://github.com/cicikat/PresenceKit/blob/main/docs/token-rotation.md)。

---

## 开发

```bash
npm install
npm run dev          # 只启动 Vite dev server，http://localhost:1420
npm run tauri dev     # 完整 Tauri 开发环境
npm run tauri build   # 生产构建
```

Windows 上可用仓库根目录的 `start-dev.bat` 启动 Tauri 开发循环。

导入 Live2D 模型或房间 GLB 见 [docs/人类说明书/](docs/人类说明书/)。Cubism Core（`live2dcubismcore.min.js`）是专有许可文件，**不进 git**。

---

## 文档

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) | AI 协作者工作入口 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 当前架构总览 |
| [docs/backend-integration.md](docs/backend-integration.md) | 后端 HTTP、WebSocket、Tauri IPC 细节 |
| [docs/frontend-structure.md](docs/frontend-structure.md) | React 窗口/组件/状态结构指南 |
| [docs/testing.md](docs/testing.md) | 自动化测试、CI 范围与发布冒烟边界 |
| [docs/design-constraints.md](docs/design-constraints.md) | 跨 pipeline 与传输约束 |
| [docs/pet-window-reference.md](docs/pet-window-reference.md) | 桌宠窗口行为 |
| [docs/known-issues.md](docs/known-issues.md) | 已知问题与技术债 |

---

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0.

Noncommercial use is permitted. Commercial use is not permitted without separate permission from the author.
