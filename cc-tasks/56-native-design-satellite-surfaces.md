# cc-tasks/56 - Native Design Satellite Surface 与窗外 UI

> 状态：partial/open。代码与 Windows debug fixture 的单显示器生命周期验收已完成；release、100%/125% DPI、双屏负坐标、20 次切换和完整视觉/交互目检仍待完成。纯装饰 halo 可与
> cc-tasks/55 并行；窗外真实功能面板依赖 55 的 structured-clone presenter/command contract，因为
> React portal 不能跨两个独立 Tauri WebView。

## 0. 目标

让特殊 Design Mod 可以在主 Tauri 窗口物理边界之外显示桌面视觉，同时保持主窗口是唯一业务 owner。
目标效果包括但不限于：

- 包围主窗口的大型圆环、滚轮、光带、粒子、红线和背景场；
- 鼠标进入主窗口时在窗口外围出现/增强，离开后衰减；
- 位于主窗口外侧的透视四边形功能格子或 HUD 组；
- 外置元素随主窗口移动、resize、DPI/显示器切换保持正确对齐；
- 装饰窗口不挡桌面鼠标，交互面板能够点击但不复制 WS/HTTP/StateEngine owner。

它是一种显式声明原生窗口能力的 `native-surface design mod`，不是在 main viewport 中继续增加
`overflow: visible`。

## 1. 为什么必须是多窗口

Web 内容不能绘制到所属原生窗口矩形之外。扩大一张透明主窗口只能制造“视觉上越过聊天框”，实际
原生窗口边界也被扩大，并会改变 snap、maximize、resize、点击区域和标题栏语义；它不满足本单的
“保持主窗口边界，同时绘制到桌面”的目标。

本单使用 Tauri 透明伴随 Webview。现有 `src-tauri/src/window_lifecycle.rs` 的 Pet / Presence Nag
创建、锁和销毁模式可以复用，但 Satellite 必须有自己的 coordinator，不能把 Pet 窗口改造成通用
画布。

## 2. 两类 Surface

### 2.1 Decorative Halo

用于圆环、红线、粒子和不接管输入的大背景：

- 一张或按显示器切分的透明无边框 Webview；
- `transparent=true`、`decorations=false`、`shadow=false`、`skip_taskbar=true`；
- 默认 `focusable=false` 且整窗 `set_ignore_cursor_events(true)`；
- 以 main 为 parent/owner，跟随主窗 show/hide/minimize/destroy；
- 默认 owned z-order，只高于主窗，不无条件压住其他应用；
- manifest 可显式请求 `always-on-top`，设置面和 diagnostics 必须显示该行为。

Halo 可以覆盖主窗口外的较大 margin。中心透明区域仍允许 main 显示；因为整窗点击穿透，不会阻挡
主窗口或桌面操作。

### 2.2 Interactive Island

用于窗外可点击的透视功能格子：

- 每个 island 是紧贴实际交互区域的透明小窗口，或由少数邻近格子共享一个紧凑窗口；
- 不能用一张覆盖大半桌面的透明可交互 Webview，再以 CSS `pointer-events:none` 假装系统级穿透；
  操作系统仍可能把透明区域命中该窗口。
- 第一版支持 `pointerMode: 'passthrough' | 'interactive'`。真正同一窗口逐像素混合穿透属于平台级
  hit-test 扩展，未实现前不得宣称 `hybrid` 可用。
- interactive island 渲染 presenter snapshot 并向 main 发 command；不连接 WebSocket、不直接调用
  Presence HTTP、不创建第二份业务 store。
- 点击按钮后是否把焦点还给 main 由 surface contract 声明；普通 HUD 命令不应无故夺走聊天输入焦点。

Manifest 静态声明窗口集合，第一版不允许 Mod 运行时代码无限创建 Webview。不要为审美规定过小的硬
数量上限；diagnostics 记录窗口数、内存/帧率，作者指南建议一个 halo + 少量 island，性能证据不足时
再制定预算。

## 3. Mod Manifest 扩展

升级 design-mod schema，兼容没有 `nativeSurfaces` 的 v1 包：

```json
{
  "schemaVersion": 2,
  "id": "example-native-design",
  "entry": "entry.js",
  "requires": ["native-surface-v1"],
  "nativeSurfaces": [
    {
      "id": "halo",
      "kind": "halo",
      "entry": "surfaces/halo.js",
      "style": "surfaces/halo.css",
      "pointerMode": "passthrough",
      "zOrder": "owned",
      "margin": { "top": 320, "right": 320, "bottom": 320, "left": 320 }
    },
    {
      "id": "right-hud",
      "kind": "island",
      "entry": "surfaces/right-hud.js",
      "pointerMode": "interactive",
      "anchor": "main.right",
      "size": { "width": 360, "height": 520 }
    }
  ]
}
```

字段名可在实施前微调，但必须表达：surface id/kind、entry/style、pointer mode、z-order、相对主窗的
anchor/offset/size 或 halo margin，以及平台/能力要求。路径沿用 design-mod 包根和 cc-tasks/53/54 的
debug/release 单一真值，不新增第二套 satellite mod 目录。

未支持的 OS、透明窗口或能力必须在选择器中显示 unavailable reason；不能静默退化为 main viewport
装饰后仍显示“原生窗外效果已启用”。

## 4. Rust Window Coordinator

在 `src-tauri/src/window_lifecycle.rs` 或职责独立的新模块建立 `DesignSatelliteCoordinator`：

1. 只有 main 能请求创建、更新、隐藏和销毁 manifest 已声明的 surface。
2. label 由 `mod_id + activation_generation + surface_id` 经安全函数生成；拒绝路径字符、重复和未声明 id。
3. 创建过程有 Mutex/状态机，重复 ensure 幂等；旧 generation 的 create/move/event 不能污染当前 Mod。
4. main hide/minimize/close、Mod 切换、activate 失败和应用退出时销毁全部 satellite。
5. Windows 使用 main 作为 owner window；验证 owner 自动最小化/销毁和 z-order。macOS/Linux 行为不同，
   未真实验收的平台标 experimental。
6. 所有位置/尺寸以 physical pixel 为内部权威；manifest logical/CSS 尺寸按目标显示器 scale factor 转换，
   避免 125% DPI 漂移。
7. surface 移动/resize 由 Rust coordinator 批处理，不允许每个 WebView 用 JS 高频轮询自己的位置。
8. Halo 的点击穿透和 island 的交互模式在创建时明确设置；切换模式需显式 command 和诊断记录。

新增 Tauri commands 的建议边界：

```text
ensure_design_satellites(mod_id, generation, surface_specs)
update_design_satellite_bounds(generation, bounds[])
set_design_satellites_visible(generation, visible)
destroy_design_satellites(generation)
```

Rust 侧必须重新校验 spec，而不是相信 entry.js 传入任意 URL、label 或无限尺寸。窗口 URL 只能指向
应用内固定入口，例如 `index.html?window=design-satellite&surface=<safe-id>&generation=<n>`。

## 5. 跨 WebView Bridge

### 5.1 Single owner

Satellite 是 renderer，不是第二个客户端：

- main 保持唯一 WS、HTTP/history/TTS、StateEngine、presenter controller 和 Design Mod activation owner。
- satellite 不 import `src/shared/api/backend.ts`，不自行连接 `/ws/desktop`。
- satellite ready 后向 main 发握手；main 立即重放当前 generation 的最新 snapshot。
- Mod 切换时 generation 变化，所有旧 snapshot/command 自动丢弃。

### 5.2 Serializable scene snapshot

main 通过 Tauri event 或 Rust shared coordinator 发送：

```ts
interface DesignSatelliteSnapshot {
  generation: number;
  modId: string;
  surfaceId: string;
  mainWindow: {
    outerBoundsPhysical: Rect;
    contentBoundsPhysical: Rect;
    scaleFactor: number;
    visible: boolean;
    focused: boolean;
    maximized: boolean;
  };
  pointer: { screenPhysical: Point; insideMain: boolean; buttons: number };
  theme: { id: string; mode: string; tokens: Record<string, string> };
  state: SerializableStateSnapshot;
  chat: ChatSessionMetrics;
  presenters: {
    status?: StatusPresenterSnapshot;
    flow?: FlowPresenterSnapshot;
    garden?: GardenPresenterSnapshot;
    diary?: DiaryPresenterSnapshot;
  };
  anchors: Record<string, ScreenGeometrySnapshot>;
  updatedAt: number;
}
```

字段按订阅需求裁剪，不能每帧广播整份 diary/garden 大对象。低频业务 snapshot 事件驱动；窗口/pointer/
anchor 高频数据使用合并后的帧消息或 Rust 共享快照，带序号和 timestamp，接收方丢弃旧帧。

### 5.3 Commands back to main

Interactive island 发送 `{generation, surfaceId, command, params, correlationId}`。main 只 dispatch 已登记的
host command/presenter command，并返回 success/error ack。业务命令复用现有 controller；不能让
satellite 直接 invoke 任意后端 Tauri command。

第一版优先覆盖导航、Sidebar/Presenter retry、打开 Diary 详情、打开偏好和恢复默认设计。跨窗输入框、
完整 Composer 或 Transcript 迁移需要独立共享 controller，不在本单中用复制 ChatPanel 解决。

## 6. Satellite Runtime

`src/main.tsx` 增加 lazy `DesignSatelliteWindow` 路由。它负责：

- 读取 safe surface id/generation，不从 query 接受任意文件路径；
- 通过现有 `read_design_mod_file/asset` 从同一 design-mod 包加载该 surface 的单文件 ESM/CSS/assets；
- 使用透明根和 `underlay/content/overlay` 本地层；
- 接收 snapshot、运行 Canvas/SVG/WebGL/CSS 3D 和自己的 rAF；
- covered/hidden/minimized 时暂停；
- dispose 时释放 Blob URL、asset URL、listener、observer、rAF 与 GPU context；
- 不挂载 main React component catalog。跨 WebView 没有可用 React portal，功能 UI 必须基于 presenter
  snapshot + command bridge 绘制。

主 runtime 的 `host.surfaces` 提供只读状态与显隐/布局请求，不把原始 `WebviewWindow` 构造器直接交给
Mod。Diagnostics 展示每个 surface 的 label、kind、bounds、DPI、pointer mode、ready/visible/FPS、
最后 snapshot/command 序号和异常。

## 7. 坐标、布局与物理

建立统一 Screen Scene Graph：

```text
monitor physical space
  -> main outer bounds
  -> main content origin
  -> main Design Mod anchor rects
  -> halo/island native bounds
  -> satellite local CSS coordinates
```

要求：

- 支持显示器原点为负数、主窗跨屏、不同 scale factor、任务栏 work area 和显示器热插拔。
- 主窗 resize/move 期间对 native bounds 更新做合帧；视觉内部再用 timestamp 插值，避免 Rust/JS 双重
  高频抖动。
- 红线端点使用 screen-space anchor，halo 将其转换到自己的 local space。
- 透视四边形在 island 内由 Mod 的 CSS `matrix3d` / Canvas/WebGL 实现；host 不限制形状。
- 主窗拖动期间若 WebView2 的 JS `onMoved` 节流，Rust window event 是权威输入；松手后必须产生正确
  位移/速度并让物理系统收敛。
- Surface 不得永久漂移到无显示器区域；恢复默认设计和“将窗外 UI 拉回当前显示器”是宿主级命令。

## 8. 非美术诊断样架

新增一个 native-surface fixture，不使用最终圆环/红线/四边形设计，只验能力：

1. 一个比 main 四边各大 240px 的 passthrough halo，绘制明显测试环；主窗中心可正常点击。
2. 鼠标进入 main 时环增强，离开后按时间衰减；切换其他应用后 owned halo 不压住前台应用。
3. main 右侧和上方各一个 interactive island，使用 presenter snapshot 显示 Status/Flow 简化视图，按钮
   通过 command bridge 切 tab或重试，不建立后端连接。
4. halo 用 screen anchor 画线连接两个 island 和 main 内一个 component；移动/resize/跨 DPI 显示器后
   连接保持正确。
5. main 最小化、隐藏、关闭、Mod 切换和 activate 失败时所有 satellite 同步隐藏/销毁；任务栏没有
   残留窗口。
6. 反复启停 20 次后窗口数、listener、event bridge、rAF、Blob URL 和 GPU context 不递增。

## 9. 测试与验收

### 9.1 纯逻辑 / Rust 测试

- schema v1 兼容、v2 native surface manifest、safe id/path/label。
- logical/physical/CSS 坐标换算，覆盖 100%/125%/150%/200% DPI 和负数 monitor origin。
- halo margin、anchor/offset、work area 与跨屏 bounds。
- activation generation、ready replay、snapshot sequence、command correlation/ack。
- hide/minimize/destroy 状态机、重复 ensure/destroy 幂等。
- passthrough 与 interactive spec 选择，不把未知模式降级为可交互大窗。
- presenter snapshot 增量裁剪和 stale frame 丢弃。

### 9.2 Windows 真实验收

至少完成：

- 单显示器 100% 和 125% DPI；
- 双显示器含负坐标，主窗在两屏间移动；
- main move/resize/maximize/minimize/restore/close；
- halo 透明和点击穿透；
- island 点击、滚动、命令 ack、焦点回 main；
- Alt-Tab 到其他应用时 z-order 正常；
- 20 次 Mod 切换和应用重开；
- release 包从 `resource_dir/design-mods` 加载所有 surface entry/style/assets。

macOS/Linux 未真实验收时必须写入 `docs/known-issues.md` 并在 capability 检查中标 experimental，不以
Windows 成功宣称跨平台完成。

## 10. 文档、IPC 与三面闭环

同步更新：

- `ARCHITECTURE.md`
- `docs/frontend-structure.md`
- `docs/design-mods.md`
- `docs/backend-integration.md`（新增 window lifecycle commands 和跨窗 event）
- `docs/known-issues.md`
- 必要时更新 `docs/pet-window-reference.md`，只说明共享 WindowLifecycle 基础，不混合 Pet/Design 状态

新增 `src-tauri/capabilities/design-satellite.json`，label pattern 只匹配设计 satellite；main capability
只获得所需 ensure/update/destroy command，不扩大其他窗口权限。

三面检查：

- 后端管理面：不新增 Presence 配置或 endpoint；satellite 只消费 main 已有 snapshot。没有新后端落盘
  状态、trace 或队列。
- 桌面与手机：桌面设置显示 native-surface 能力、平台可用性、窗口数量、z-order/pointer mode 与一键
  恢复；手机端不创建对应入口。
- 原调用链：main 仍是 WS/HTTP/StateEngine/presenter owner；核对 command ack、generation、窗口关闭、
  pause、TTL/stale snapshot 和 fallback，satellite 不绕过鉴权或代理规则。

本单改变 Tauri IPC 和跨 WebView event contract，必须更新 `docs/backend-integration.md`。不改变
Presence HTTP/WS 协议，不修改 `docs/protocol-v0.md` 或后端仓；若实施需要新后端字段，停止扩项并另开
跨仓工单。

## 11. 不在范围内

- 不制作最终游戏主界面、圆环、红线、花朵或透视 HUD 美术。
- 不让 satellite 自行连接 WS/HTTP 或复制 ChatPanel。
- 不实现任意第三方 URL 窗口、运行时无限开窗或未声明 surface。
- 不用 CSS `pointer-events:none` 冒充操作系统点击穿透。
- 不实现跨窗完整 Composer/Transcript；先支持 presenter 视图和 host commands。
- 不承诺第一版逐像素 hybrid hit-test；需要时另立 Windows/macOS 平台实现工单。

## 12. 验证命令

执行 build、Rust 和真实窗口验证前先读相邻 `Emerald-presence/docs/dev-environment.md`，然后运行：

```bash
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run check:naming
cd src-tauri
cargo test
cargo check
```

最后执行 `git diff --check`。Rust lifecycle、前端 bridge、halo、interactive island 应分别小步提交；
不要把窗口创建、跨窗协议和最终诊断样架压成一个提交。

## 13. 2026-08-17 Windows Debug 验收记录

- 在单显示器 175% DPI 的 `freeform-capability-fixture` 中，Halo、right-island 与 top-island 均创建为
  独立 owned Tauri 窗口；三者 owner 都是 main。
- Halo 带 `WS_EX_TRANSPARENT`，Island 是可交互窗口；主窗移动和 resize 后，Halo margin、right/top anchor
  与 offset 均保持正确关系。
- 主窗最小化时三个 satellite 同步隐藏，恢复时同步显示；关闭 main 后三个 native handle 均被销毁。
- 实测暴露并修复 Windows 同步 command 创建 WebView 的 WebView2 deadlock、错误的 parent 语义，以及 satellite
  renderer 的初始化提前退出。剩余多屏、DPI、release 与 20 次压力验收继续保持 `partial/open`。
