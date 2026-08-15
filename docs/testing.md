# 桌面端测试与验收矩阵

> 本文说明 PresenceKit-desktop 当前的自动化测试入口、CI 范围和必须由人工或真实设备完成的验收。代码、测试文件和 `.github/workflows/ci.yml` 是事实来源；本文不把静态检查等同于运行时验收。
>
> 盘点日期：2026-08-10。本文记录测试结构与证据边界，不代表本轮已经重新执行全部命令。

## 一、自动化入口

在桌面仓库根目录执行：

```powershell
npm ci
npm run check:naming
npx tsc --noEmit
npm test
npm run build
```

Rust / Tauri 侧：

```powershell
Set-Location src-tauri
cargo check
```

其中：

- `npm test` 执行 Vitest；当前仓库盘点到 19 个 `*.test.*` 文件。
- `npx tsc --noEmit` 只检查 TypeScript 类型，不启动 Tauri，也不连接后端。
- `npm run build` 是 `tsc && vite build`，证明前端产物可以编译，不证明窗口、IPC、WebSocket 或真实渲染正常。
- `cargo check` 只做 Rust 编译检查，不证明 Tauri command、窗口生命周期或系统权限行为正常。
- `npm run check:naming` 是已有的命名检查入口，但当前 CI 没有单独执行它；需要时应在本地提交前补跑。

## 二、当前自动化覆盖

现有 Vitest 测试主要覆盖：

- HTTP / WebSocket 辅助层：错误解析、状态响应归一化、增量文本解析、action 参数、diary sync、activity API；
- 聊天与窗口状态：聊天 correlation、角色模型路由、偏好信息架构；
- Dream：关闭过渡、group dream 路由、回合恢复、回放选择；
- UI / 状态基础设施：i18n、布局 loader、tool status overlay、Live2D motion adapter、语音播放队列。

这些测试大多是纯函数、状态机或组件级测试，不覆盖真实 Tauri 窗口和真实后端连接。

## 三、CI 实际范围

前端 CI 当前执行：

1. Node 20；
2. `npm ci`；
3. `npx tsc --noEmit`；
4. `npm test`；
5. `npm run build`。

Rust CI 当前在 Windows 上执行 `cargo check`。

CI **没有自动证明**：

- Tauri IPC 在打包应用中的真实调用；
- WebSocket 与 HTTP `/desktop/chat` 的真实后端对账；
- 桌宠窗口、透明置顶、多窗口和 Live2D / WebGL 的真实渲染；
- Dream overlay、退梦 flush、分段展示和桌宠转发的端到端行为；
- macOS 启动、Gatekeeper、Universal 包、透明窗口或传感器行为；
- Windows / macOS 的真实安装升级和用户数据迁移。

## 四、发布前手工验收

发布候选版本至少需要在运行中的后端上完成：

- 主窗口连接、鉴权、发送消息、接收完整回复和断线错误提示；
- HTTP 回复与 WebSocket 推送的 correlation / 去重；
- 桌宠窗口启动、气泡显示、输入发送、主窗口关闭边界；
- Dream 入场、消息隐藏、退梦只 flush 一次、回放与分段选择；
- Live2D / WebGL、透明置顶、多窗口和 TTS 播放；
- macOS 首轮真人冒烟：启动、连接后端、聊天收发。macOS 目前仍是 experimental，见 [`release-v0.1.md`](release-v0.1.md)。

每项应记录桌面 commit、后端 commit、操作系统、构建产物、后端地址类型、测试步骤和截图/日志位置。Windows 开发机无法替代 macOS 验收。

## 五、当前测试缺口

- [`known-issues.md`](known-issues.md) 仍记录 ChatPanel timer 竞态测试缺失；应覆盖 WS 先到、timer 先到和 fallback 命中三种顺序。
- 没有 Tauri command / IPC 的集成测试，也没有打包后真实窗口的自动化测试。
- 没有跨仓 protocol fixture；桌面协议需要和后端、移动端固定 commit 一起做兼容矩阵。
- 没有 Playwright 或等价的真实窗口 / 浏览器端到端套件；组件测试不能替代这一层。
- `check:naming` 未进入 CI，命名回归可能只在本地暴露。
- macOS 真机冒烟仍未完成；`release-v0.1.md` 的“CI 打包成功”不能替代真实 Mac 证据。

