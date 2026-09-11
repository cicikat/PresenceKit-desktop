# 可信设计 Mod

## 自由合成样架 1.2（2026-09-11）

同日导航补充：进入活动/群聊时，宿主 nativePage 临时显示标准 LayoutHost，并以
DesignMountsSuspended context 让该 React 子树返回本地挂载；Mod 图层暂停显示，
退出后恢复原 portal。Mod 保持已激活状态，不修改公开 attach/Host API，不重建 ChatPanel。
标准壳和自由合成样架的导航/草稿往返已通过 Chromium IPC 夹具；原生验证仍 open。

`freeform-capability-fixture` 默认改为单窗口视觉小说式聊天舞台：叠层细边框、浅阴影、
虚实连线和 hover/focus 反馈。主聊天与所有侧栏能力保留；Flow/Status 拆分为子区，
Garden/Diary 使用完整 renderer 保留失败重试。窄屏信息卡置于主舞台下方，减少动态
效果偏好禁用过渡。manifest 与 index 均不再声明窗外 Halo/Island；`surfaces/` 旧资源
保留作作者参考但不会加载。本次没有修改 native surface/Scene/Host API 契约。
真实 Windows 验收仍为 open，见 `ui-polish-2026-09-11.md`。

> 创建或修改 Mod 请先读 `docs/design-mod-authoring.md`。本文记录宿主实现、运行时边界和历史兼容；
> 作者可用 API、manifest 字段、最小示例和验收清单以作者说明书为准。

可信设计 Mod 是 Chat 窗口内的本地设计运行时。它与主题 Mod、布局 Mod 分开校验，但可以在一个包里
可选地携带 `theme` 和 `layout`。第一版只允许一个运行时 Mod，按“可信本地代码”执行；没有 iframe
沙箱、签名、网络权限或自动下载。设计错误会恢复 `builtin-default`；偏好面板和管理面板入口始终由宿主保留，默认设计恢复仍位于偏好中的 Design Mod 设置。

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

`mod.json` 兼容 `schemaVersion: 1` 和 `schemaVersion: 2`，必须包含 `id`、`name`、`author`、
`version` 和 `.js` 的 `entry`。`id` 必须是单级安全目录名并与目录名一致；`style`、`theme`、`layout`
只能是包内相对路径。v2 可选声明 `nativeSurfaces`；不声明时仍按 v1 的单 WebView 行为运行。
`entry.js` 不能依赖运行时裸相对 import，依赖应由作者预先打包进单文件。

原生 surface 仍属于同一个 Mod 包，不增加第二个包根：

```text
├── surfaces/
│   ├── halo.js            # kind=halo，必须 passthrough
│   ├── halo.css
│   └── island.js          # kind=island，可 interactive
```

每个 surface 声明 `id`、`kind`、`entry`、`size`、`pointerMode`、`zOrder`；需要视觉外伸时声明
`visualBleed`，island 声明 `anchor`（`main.top|right|bottom|left`）和可选 `offset`。旧 `margin` 仅为
外扩兼容别名。surface id、label、资源路径
都由前端和 Rust 双重校验；禁止 `hybrid`、绝对路径、重复 id 和跨包资源。`always-on-top` 只有在 manifest
明确声明时才可使用，诊断会显示该 z-order。

内含 theme/layout 在启用前分别复用现有 validator 与 CSS 安检；任一失败都不会应用其中任何一半。
它们不会被复制到 `public/themes/` 或 `public/layouts/`。独立主题/布局仍使用原有 registry，来源标记
为 `design-mod` 只表示本次应用来源。

包内 `layout` 的 `mainLayout` 仍遵循布局 Mod 契约：`hud` 在宽窗口（包括全屏）会将聊天记录与发送栏分成左右两列，只有主区低于 760px 才回退为 `stack`。需要常规上下聊天时应明确使用 `stack`，不能依赖主题 CSS 修正。

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
| `diary` | active character、entries 元数据、loading/error/selection | `refresh` / `openEntry`；`selectCharacter` 仅旧包兼容 |

所有 presenter 都实现 `get()`、`subscribe()`、`acquire(consumerId)` 和诊断读取。共享状态轮询以
最短活动 cadence 合并，ChatWindow 的后台 owner 与 Sidebar/Mod consumer 共用同一计时器；覆盖或
隐藏时由 Host 统一 pause。状态 presenter 的官方 renderer 保留原有信号公式与 60×2 秒轨迹，
session elapsed ticker 和 native window motion 在无事件后都会 settle，moving/velocity 回到零。

父能力和子区域不可同时声明所有权；注册表会明确拒绝冲突。当前子区域目录为：

| 能力 | 可挂载子区域 |
|---|---|
| status | `chat.sidebar.status.mood`、`chat.sidebar.status.activity`、`chat.sidebar.status.timeline` |
| flow | `chat.sidebar.flow.now`、`chat.sidebar.flow.timeline` |
| garden | `chat.sidebar.garden.visual`、`chat.sidebar.garden.summary`、`chat.sidebar.garden.controls` |
| diary | `chat.sidebar.diary.identity`、`chat.sidebar.diary.entries`（`.characters` 仅旧包兼容） |

上表是 v2 contract/registry 的可挂载目录。工单 65 起，内置 `SubStatus` 的三个 Status
子区均有正式 `DesignAwareRegion` 出口，边界固定如下：

| 子区 | 官方 DOM | 未单独开放时的归属 |
|---|---|---|
| `mood` | `data-status-region="mood"`、`mood-glow`、`mood-indicator` | mood 子区 |
| `activity` | `data-status-region="activity"` 与 `data-status-region="presence"` | activity 子区 |
| `timeline` | `data-status-region="telemetry"` 与 `data-status-region="timeline"` | timeline 子区 |

根级错误 / 重试条不属于任何子区，只由父 `chat.sidebar.status` 的官方 renderer 负责。
因此，`subregions` 或 `presenter-only` 的 Mod 需要从 `host.presenters.status` 读取
`errors` 并自行决定错误呈现；它不会从 hidden fallback tree 得到一份重复的官方错误条。

官方 renderer 会保留 `data-sidebar-capability` 与 `data-<capability>-region` 语义钩子。Status
额外提供 `data-status-element="mood-glow|mood-indicator"` 和 `--status-mood-hue`、
`--status-aura`、`--status-breath`、`--status-gaze-lock`、`--status-rhythm`、
`--status-indicator-size`、`--status-glow-x`、`--status-glow-y` CSS variables。
`SubStatus` 将完整变量集同时写在 Status root 和每个三块官方子区的 portal 根上；因此官方
子区脱离 root 继承树后仍有明确的 mount-local 来源。Mod 自绘 renderer 仍应从
`host.presenters.status` 读取稳定值并自行设置变量，不能从其他节点“顺手读取” hooks。

composition 行为固定为：`official-renderer` 只能挂父 id，由父 portal 承担整块官方内容；
`subregions` 只能挂三个子 id，每个挂载只替换对应子区，fixture 会同时挂载三块以避免
官方 fallback 留在 hidden tree；`presenter-only` 不挂官方 id，由 Mod 完全从 presenter 自绘。
注册表拒绝父子混挂，切换和卸载时 portal 只保留当前 ownership，因此不会重复渲染。

## 舞台与信号

主 WebView 舞台覆盖当前 Chat viewport；v2 的 native surface 才能在主原生窗口外绘制。它有独立的
`underlay`、`components`、`overlay` 三层，均为固定 viewport 坐标系；共同祖先不设置裁剪或 flatten 3D
的 transform。根层默认不接管指针，Mod 自己创建的 mount 或 `[data-design-interactive="true"]` 节点才接管。
如果目标只是“贴着边缘、看起来要飘出去”的视觉效果，应优先在这三层内使用 `host.scene` 与
`host.edges`；这条 WebView 路径不依赖 native satellite，跨平台约束更小。只有确实要越过
Tauri 主窗口物理边界时才声明 Halo/Island native surface。

ChatWindow → `DesignModHost` → default shell → `LayoutHost` → layout slot → Ribbon/Sidebar/Main
保持明确的 viewport 尺寸链：宿主根、default shell、LayoutHost、slot 和 ChatPanel 子项必须提供
`width/height: 100%`、`min-width/min-height: 0`。active Mod 只改变 default shell 与 Mod layer 的
可见性/事件接管，不得改变这份尺寸语义；加载中、激活失败或 fallback 时标准布局继续可见。

宿主另有一个 click-through 的 system overlay，层级高于 Mod 舞台，提供打开 Preferences 和管理面板的轻量入口。
它不是强制系统栏，不遮挡正常聊天或 Mod 交互；Mod 不得成为唯一的设置入口。

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
现有 shared API → Tauri command → Presence 链。`host.assets.url(path)` 只接受当前包 `assets/` 下的相对路径，
并始终返回可加载 URL：Tauri 模式经 `read_design_mod_asset` 的 MIME/base64 生成 Blob URL，宿主 disposer
负责回收；开发浏览器模式返回同包静态 URL。`host.assets.url()` 不返回资源正文，`host` 的文本 `read()`
只用于 UTF-8 manifest/style/entry。

### Freeform primitives and edge ornaments (Host API v2)

For each sidebar capability, call `host.components.setComposition(capability,
mode)` before attaching renderer portals. `official-renderer` permits only the
parent capability id, `subregions` permits independent semantic child ids, and
`presenter-only` permits no official portal. Existing unconfigured Mods keep
the v1 compatibility behavior; new Mods must declare their intended strategy.

The frozen semantic primitive ids are:

| Capability | Child primitives |
|---|---|
| status | `chat.sidebar.status.mood`, `chat.sidebar.status.activity`, `chat.sidebar.status.timeline` |
| flow | `chat.sidebar.flow.now`, `chat.sidebar.flow.timeline` |
| garden | `chat.sidebar.garden.visual`, `chat.sidebar.garden.summary`, `chat.sidebar.garden.controls` |
| diary | `chat.sidebar.diary.identity`, `chat.sidebar.diary.entries` |

`chat.sidebar.diary.characters` remains accepted as a schema-v2 compatibility
alias. New packages must migrate to `diary.identity`; it is restricted to the
active character and does not restore preference-level character management.

`host.presenters.*.select(selector, listener, equal?)` narrows a subscription
to the selected immutable value. `host.scene.create(element, options)` owns
placement, transform composition, pointer capture and disposal through one
on-demand scheduler. Scene anchors support relative viewport, component and
custom path positions. Do not independently write `left`, `top` or `transform`.

`host.edges.get(target)` and `host.edges.observeEdge(target, listener)` expose
read-only page or component rects, directed edges, normals, corners, visibility,
DPR and geometry version. Equal geometry is deduplicated; hidden/covered host
state pauses delivery. Ornament growth must remain local to the Mod session and
bounded; the fixture demonstrates page and component edge canvas ornaments.

### Native satellite surfaces

只有主窗口可以通过 `DesignSatelliteBridge` 请求 surface 生命周期；Mod 本身拿到的 `host.surfaces` 是只读
诊断与可见性/布局请求接口，不能创建 `WebviewWindow`。Rust `DesignSatelliteState` 保持当前
`mod_id + generation + surface_id` 注册表：切换、加载失败、主窗口隐藏/最小化、关闭和退出都会隐藏或销毁
整组 surface，旧 generation 的 create/move/ready/command 不会进入当前主窗口。

Halo 使用透明、无装饰、无阴影、跳过任务栏、不可聚焦、全窗 click-through 的 owned window；island 只创建
manifest 声明的紧凑尺寸，`interactive` 才可接收指针。窗口内部以物理屏幕 px 布局，logical/CSS 尺寸乘当前
display factor；负坐标、多显示器和 DPI 变化由 Rust 主窗口 move/resize/scale 事件重新计算。主窗口仍是
唯一 WS/HTTP/history/TTS/StateEngine/presenter owner；surface 只接收裁剪 snapshot，按钮通过白名单 command
bridge 回主窗口并等待 correlation ack。

bridge 初始 JS 状态与 Rust 新建窗口都为 hidden。`start()` 成功后会无条件同步一次 `visible`，宿主未暂停时
立即 show 并启动单一 snapshot rAF loop；重复 show 不创建第二个 loop，hide/pause 会取消 rAF，resume 可幂等恢复。
ready、首次 snapshot、visible 和 FPS 都进入 diagnostics。快照含 `generation`、单调 `sequence`、主窗口屏幕 bounds/DPI、visible/focused/maximized、pointer、theme、
裁剪后的 StateEngine/chat/status/flow presenter 和 screen-space anchors。卫星 ready 后主窗口回放当前 generation
的最新快照；卫星丢弃旧 generation/sequence。`DesignModSettings` 诊断显示每个 surface 的 bounds、pointer mode、
ready、FPS、snapshot/command sequence 和最近错误。

## 生命周期和恢复

### Runtime snapshot budget (Brief 60)

The transport uses a 20 Hz foreground budget, a zero-rate background budget,
one shared sampler for main-window state, and one batched emit per tick. It
records sampled/sent/dropped/payload bytes and retains the newest frame per
surface. Surface consumers must tolerate stale-frame drops and must not create
their own geometry or animation loop. Lifecycle pause/resume is controlled by
host visibility and emits one recovery snapshot after resume.

### Generation-safe payload cache (Brief 61)

The host cache key includes `generation`, `modId` and `sequence`. Cleanup clears
the cache before activation of a new Mod, so sequence `1` from a replacement
Mod cannot reuse a payload produced by the previous Mod.

### Visual bleed and teardown acknowledgement (Brief 62)

Native manifests can declare finite non-negative `visualBleed` and
`contentInset` values (a uniform number or four sides). Layout first computes
the unexpanded content bounds. `visualBleed` expands those bounds into the
native physical window; `contentInset` then shrinks the unexpanded content
bounds inward and is returned as the snapshot `contentRect`. Thus
`contentRect` never includes visual bleed, even when the two values differ.
The deprecated `margin` field remains an outer-bleed compatibility alias only.
Do not use a DOM transform to escape the WebView rectangle.

`host.transforms.create()` returns the sole transform owner for a freeform
placement node. Feed it drag, native motion and optional physics offsets, then
commit the composed transform. Do not write `left`, `top`, `translate` and
`transform` independently during a drag. `host.surfaces.destroy()` awaits the
main-owner `destroy_current_design_satellites` acknowledgement; host cleanup
waits for it before restoring the built-in layout.

每次启用都会生成新的 activation generation。切换、刷新、窗口卸载或 activate 抛错时，宿主按顺序调用
disposer、清空 component/geometry/subscription ledger、停止宿主 rAF、移除 style 和 Blob URL。satellite
异步 run 在每个 await 点检查 generation/disposed；listener、style、entry/asset Blob URL 与 pending command
timer 由同一个幂等 disposer 管理，资源即使在卸载后才创建也会立即释放。旧异步 activate 不能污染新一代 Mod。

### `requires` 与能力状态

surface 的 `requires` 是能力名，不是装饰性标签。当前最小集合为 `platform`、`transparent-window`、
`native-satellite-v1`、`interactive`、`passthrough`、`presenter-snapshot`、`navigation-snapshot`；
为兼容现有 fixture，`navigation` / `presenters` 分别映射到后两个 snapshot 能力。Rust 返回平台报告：
Windows 为 `supported`，macOS/Linux 为 `experimental`（尚无真人窗口验收），其他平台为 `unavailable`。
The Windows satellite ensure command is asynchronous to avoid the documented
WebView2 synchronous-command creation deadlock. Satellite renderer bootstrap
does not run main-window preference/theme/voice owners; it only mounts the
transparent renderer and bridge resources. The 2026-08-17 debug run validated
three owned fixture surfaces at 175% DPI, including pointer passthrough and
move/resize/minimize/restore/close. Release, 100%/125% DPI and multi-monitor
acceptance remain open.
未知能力、缺失能力或平台不满足时，选择器禁用该 Mod，diagnostics 给出 surface 与 reason；宿主不会先创建
部分 satellite 再静默回退。未声明 `nativeSurfaces` 的 v1 Mod 不参与能力判定，继续走单 WebView 兼容路径。

偏好键是 `chat.designMod`。选择、刷新和恢复默认入口在「偏好 → 界面」；恢复默认会重新应用用户原先的
theme/layout 选择。Host diagnostics 额外记录 `builtin-default` / loading / active / error-fallback、
default shell 与 Mod layer 可见性、component attachment、viewport 尺寸和恢复入口状态，用于区分
未挂载、被裁切、被推出 viewport 和层被隐藏。Activity、Toy、Room 覆盖 Chat 时会暂停高频设计循环，
返回后恢复。

仓库附带 `public/design-mods/freeform-capability-fixture/`，只用于验收基础设施：它将 flow/garden/diary
声明为 `subregions`，把六个官方子区域拆成独立 Scene node；Status 也声明为 `subregions`，
把 `mood`、`activity`、`timeline` 三个官方子区分别挂到独立 Scene node。需要验证
`presenter-only` 时应移除 Status attach 并保留 presenter 自绘，不应把官方 DOM 复制进 Mod。
fixture 还演示 viewport/component edge Canvas 装饰、perspective、统一拖拽 transform 与原生窗口运动信号；
它不代表产品最终视觉。
它还声明一个 passthrough Halo 和右/顶部 interactive islands：Halo 展示主窗口/组件到岛的 screen-space 连线，
岛消费 Status/Flow presenter 并通过 command bridge 操作 Sidebar/Preferences。它不是产品视觉方案。
