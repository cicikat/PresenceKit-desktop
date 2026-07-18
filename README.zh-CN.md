[English](README.md) | [简体中文](README.zh-CN.md)

# PresenceKit-desktop

[PresenceKit](https://github.com/cicikat/PresenceKit)（有长期记忆和情绪状态的 AI 陪伴后端）的 Tauri + React + TypeScript 桌宠 + 管理面板客户端。

本客户端负责聊天窗口、桌宠形象，以及只读的花园/日记/状态面板；不拥有任何人格、记忆或调度数据——这些都在后端。

**必须搭配运行中的 PresenceKit 后端使用**，见[后端快速开始](https://github.com/cicikat/PresenceKit#快速开始)。本客户端单独运行无法工作。

---

## 下载

预编译 Windows 安装器见本仓 [GitHub Releases](https://github.com/cicikat/PresenceKit-desktop/releases)。兼容的 [PresenceKit 后端](https://github.com/cicikat/PresenceKit/releases) 版本见对应 Release notes。

安装器未做代码签名（本项目目前不购买代码签名证书），下载安装前请留意：

- **Edge 浏览器可能会直接拦截下载**，下载栏里点「保留」也不一定生效。遇到这种情况，建议改用 Chrome 下载；或按微软官方步骤手动保留被拦截的下载（[管理不安全网站警告](https://support.microsoft.com/zh-cn/topic/e0aae59d-a67c-2b90-8006-b3f2b8f232ed)）。
- 首次运行 Windows SmartScreen 会提示"未识别的应用"——点击**更多信息 → 仍要运行**即可，这是未签名安装包的预期提示，不代表安装包有问题。
- 如果有多块盘，**建议安装/解压到非系统盘**（如 `D:\`），放在 `C:\` 下可能会遇到额外的权限提示和杀毒软件扫描开销。

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

---

## 文档

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) | AI 协作者工作入口 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 当前架构总览 |
| [docs/backend-integration.md](docs/backend-integration.md) | 后端 HTTP、WebSocket、Tauri IPC 细节 |
| [docs/frontend-structure.md](docs/frontend-structure.md) | React 窗口/组件/状态结构指南 |
| [docs/design-constraints.md](docs/design-constraints.md) | 跨 pipeline 与传输约束 |
| [docs/known-issues.md](docs/known-issues.md) | 已知问题与技术债 |

---

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0.

Noncommercial use is permitted. Commercial use is not permitted without separate permission from the author.
