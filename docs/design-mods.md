# 可信设计 Mod

可信设计 Mod 是 Chat 窗口内的本地设计运行时。它与主题 Mod、布局 Mod 分开校验，但可以在一个包里
可选地携带 `theme` 和 `layout`。第一版只允许一个运行时 Mod，按“可信本地代码”执行；没有 iframe
沙箱、签名、网络权限或自动下载。设计错误会恢复 `builtin-default`，偏好面板和恢复默认入口始终由宿主保留。

## 包格式

debug 的唯一源码根是 `public/design-mods/<id>/`；release 的唯一资源根是
`resource_dir/design-mods/<id>/`。`target/`、`dist/` 不参与扫描。

```text
public/design-mods/<id>/
├── mod.json
├── entry.js       # 已打包单文件 ESM，只导出 activate(host)
├── style.css      # 可选，设计 Mod 自己的完整 CSS
├── assets/        # 可选，本地图片、字体、纹理和 shader
├── theme/         # 可选：theme.json 及其 CSS
└── layout/        # 可选：layout.json 及其 CSS
```

`mod.json` 必须包含 `schemaVersion: 1`、`id`、`name`、`author`、`version` 和 `.js` 的 `entry`。
`id` 必须是单级安全目录名并与目录名一致；`style`、`theme`、`layout` 只能是包内相对路径。
`entry.js` 不能依赖运行时裸相对 import，依赖应由作者预先打包进单文件。

内含 theme/layout 在启用前分别复用现有 validator 与 CSS 安检；任一失败都不会应用其中任何一半。
它们不会被复制到 `public/themes/` 或 `public/layouts/`。独立主题/布局仍使用原有 registry，来源标记
为 `design-mod` 只表示本次应用来源。

## 运行时入口

```js
export function activate(host) {
  const mount = document.createElement('div');
  host.layers.components.appendChild(mount);
  host.components.attach('chat.sidebar.garden', mount);
  const unsubscribe = host.signals.chat.subscribe(() => {
    const session = host.signals.chat.get();
    // 自由使用 DOM / SVG / Canvas / WebGL / rAF；这里仅示意。
    mount.dataset.entries = String(session.sessionEntryCount);
  });
  return () => {
    unsubscribe();
    host.components.detach('chat.sidebar.garden');
    mount.remove();
  };
}
```

`host.components.attach()` 是 singleton 登记，不会复制组件；未知 id、重复 attach 都会明确报错。真实
React 能力由宿主 portal 到 Mod 创建的容器中，Mod 不得从源码 import `SubGarden`、复制 DOM 或自行建立
WS/HTTP 链。

稳定 component id：

| id | 能力 |
|---|---|
| `chat.ribbon` | Ribbon 与现有命令入口 |
| `chat.header` | 对话标题、头像、状态和偏好入口 |
| `chat.transcript` | 消息流、历史加载、右键与流式呈现 |
| `chat.composer` | 输入、附件、语音、发送和回复预览 |
| `chat.sidebar.flow` | 动向 / NOW / timeline |
| `chat.sidebar.garden` | 陪伴花园 |
| `chat.sidebar.diary` | 日记列表与详情入口 |
| `chat.sidebar.status` | sensor / mood / presence 状态面板 |

### Sidebar presenter 与视觉区域

Sidebar 的四个能力由 `src/shared/design-mod/presenters/` 统一提供 presenter。设计 Mod 只能消费
快照、订阅变化、取得消费者租约并调用已声明命令；不能自己请求 HTTP、Tauri command 或建立 WS。
宿主通过 `host.presenters.status|flow|garden|diary` 暴露同一份数据源，并在 Mod disposer / 切换时
回收订阅和租约。

| presenter | 快照核心字段 | 命令 |
|---|---|---|
| `status` | `mood`、`activity`、`presence`、`telemetry`、60 格带 `sampledAt` 的 timeline、三类错误 | `retryMood` / `retryActivity` / `retrySensor` |
| `flow` | NOW narrative、mood/focus/presence、tool overlay、按角色隔离的 8 小时 timeline | `refresh` |
| `garden` | 后端 garden slots、stage/progress、loading/error/lastUpdated | `refresh` |
| `diary` | characters、active character、entries 元数据、loading/error/selection | `refresh` / `selectCharacter` / `openEntry` |

所有 presenter 都实现 `get()`、`subscribe()`、`acquire(consumerId)` 和诊断读取。共享状态轮询以
最短活动 cadence 合并，ChatWindow 的后台 owner 与 Sidebar/Mod consumer 共用同一计时器；覆盖或
隐藏时由 Host 统一 pause。状态 presenter 的官方 renderer 保留原有信号公式与 60×2 秒轨迹，
session elapsed ticker 和 native window motion 在无事件后都会 settle，moving/velocity 回到零。

父能力和子区域不可同时声明所有权；注册表会明确拒绝冲突。当前子区域目录为：

| 能力 | 可挂载子区域 |
|---|---|
| flow | `chat.sidebar.flow.now`、`chat.sidebar.flow.timeline` |
| garden | `chat.sidebar.garden.visual`、`chat.sidebar.garden.summary`、`chat.sidebar.garden.controls` |
| diary | `chat.sidebar.diary.characters`、`chat.sidebar.diary.entries` |

官方 renderer 会保留 `data-sidebar-capability` 与 `data-<capability>-region` 语义钩子。Status 额外
提供 `data-status-element="mood-glow|mood-indicator"` 和 `--status-mood-hue`、
`--status-aura`、`--status-breath`、`--status-gaze-lock`、`--status-rhythm`、
`--status-indicator-size`、`--status-glow-x`、`--status-glow-y` CSS variables。挂载父能力时由
官方 renderer 承担整块 fallback；只挂子区域时只替换对应视觉区域。

## 舞台与信号

舞台覆盖当前 Chat Webview viewport，不覆盖 Tauri 原生窗口外的桌面区域。它有独立的
`underlay`、`components`、`overlay` 三层，均为固定 viewport 坐标系；共同祖先不设置裁剪或 flatten 3D
的 transform。根层默认不接管指针，Mod 自己创建的 mount 或 `[data-design-interactive="true"]` 节点才接管。

ChatWindow → `DesignModHost` → default shell → `LayoutHost` → layout slot → Ribbon/Sidebar/Main
保持明确的 viewport 尺寸链：宿主根、default shell、LayoutHost、slot 和 ChatPanel 子项必须提供
`width/height: 100%`、`min-width/min-height: 0`。active Mod 只改变 default shell 与 Mod layer 的
可见性/事件接管，不得改变这份尺寸语义；加载中、激活失败或 fallback 时标准布局继续可见。

宿主另有一个 click-through 的 system overlay，层级高于 Mod 舞台，提供打开 Preferences 和恢复
`builtin-default` 的轻量入口。它不是强制系统栏，不遮挡正常聊天或 Mod 交互；Mod 不得成为唯一恢复路径。

`host.signals` 提供同步读取 + 订阅：

- `state`：StateEngine 的 mood / activity / focus / presence 镜像。
- `chat`：`startedAt`、`elapsedMs`、本次会话新增 entry、turn、历史 entry、typing/loading；历史数量与会话生长数量分开。
- `navigation`：现实 / 群聊 / Dream、Sidebar tab 和可见性。
- `theme`：当前主题 id、日夜槽和 token。
- `viewport`：CSS 像素尺寸、DPR、visible/covered/paused。
- `pointer`：viewport 坐标、buttons、pressed、dragging。
- `nativeWindow`：Tauri `onMoved()` 的物理位置、按 DPR 换算的 CSS delta、velocity 和 moving。

`host.geometry.get(id)` 返回 mount 的 viewport 矩形和变换版本；`observe()` 使用 ResizeObserver 与宿主的
逐帧 dirty-set 批处理。矩形不等于透视后的四边形，homography、连线和碰撞体由 Mod 自己计算。

`host.commands` 只复用宿主动作：收起 Sidebar、切 tab、打开偏好和恢复默认设计。业务 HTTP 仍只能走
现有 shared API → Tauri command → Presence 链。`host.assets.url(path)` 解析当前 design-mod 的 `assets/`
资源；Tauri 模式通过本地读取命令生成 Blob URL，开发浏览器模式使用同包静态 URL。

## 生命周期和恢复

每次启用都会生成新的 `AbortSignal` 和 activation generation。切换、刷新、窗口卸载或 activate 抛错时，
宿主按顺序 abort、调用 disposer、清空 component/geometry/subscription ledger、停止宿主 rAF、移除 style 和
Blob URL。旧异步 activate 不能污染新一代 Mod。

偏好键是 `chat.designMod`。选择、刷新和恢复默认入口在「偏好 → 界面」；恢复默认会重新应用用户原先的
theme/layout 选择。Host diagnostics 额外记录 `builtin-default` / loading / active / error-fallback、
default shell 与 Mod layer 可见性、component attachment、viewport 尺寸和恢复入口状态，用于区分
未挂载、被裁切、被推出 viewport 和层被隐藏。Activity、Toy、Room 覆盖 Chat 时会暂停高频设计循环，
返回后恢复。

仓库附带 `public/design-mods/freeform-capability-fixture/`，只用于验收基础设施：它挂载 flow/garden/diary
官方能力，同时故意不挂载 `chat.sidebar.status`，改用 `host.presenters.status` 自绘一个非矩形
Status renderer，覆盖 telemetry、timeline、错误重试和切换/清理路径。fixture 还保留
clip-path / perspective / matrix3d、SVG 连接几何、session 驱动装饰、内部拖拽与原生窗口运动信号；
Ribbon 由 viewport 的 top/bottom 约束决定高度，非关键项可滚动，底部偏好/帮助/日夜控制不随窗口
高度或异步内容被推出可视区。
它不是产品视觉方案。
