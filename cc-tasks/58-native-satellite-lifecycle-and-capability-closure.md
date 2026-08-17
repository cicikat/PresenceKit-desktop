# 58：Native Satellite 生命周期、资源与能力闭环修复

> 状态：partial/open。代码层已实施并通过静态/纯逻辑验证；2026-08-17 已完成 Windows debug fixture 的单显示器生命周期验收，但 release、100%/125% DPI、双屏与 20 次切换仍保持 open。
> 本单先修复代码层阻断，再把可验证的状态交给真实窗口验收；不在本单扩展新的视觉组件或物理效果。

## 1. 背景

最近的静态审查发现，native Halo/Island 的基础设施虽然能够编译并通过现有纯函数测试，仍有四个未闭环点：

1. Rust 创建 satellite 时使用 `visible(false)`，而 `DesignSatelliteBridge` 的初始状态是 `visible = true`。
   主窗口首次启用正常 Mod 时调用 `setVisible(true)` 会被短路，因此窗口可能永远不显示，且首次启动不会进入
   snapshot 帧循环。
2. `DesignSatelliteWindow` 的 `host.assets.url()` 返回文本文件内容，不是可被 `img/src`、字体或 Canvas 加载的 URL。
   主窗口已有 `designModReadApi.assetUrl()` 的 Blob URL 语义，satellite 必须保持同一契约。
3. satellite 在异步读取 manifest/style/entry、注册 listener 或动态 import 期间卸载时，cleanup 可能先于资源创建完成。
   后续创建的 listener、style 和 Blob URL 没有可靠的回收路径，多次切换 Mod 可能泄漏。
4. `nativeSurfaces[*].requires` 目前只做名称格式校验，没有实际能力检测、平台可用性和 unavailable reason。
   不支持的平台或窗口能力不能静默尝试激活，也不能伪装成已经启用窗外效果。

## 2. 目标

- 正常激活 v2 Design Mod 后，所有声明的 satellite 在首个 ready 流程内显示，并持续发布快照。
- pause/hide/resume/destroy 和 Mod 切换具有幂等、可观察、无泄漏的生命周期。
- satellite 与主窗口使用一致的资源加载语义，支持图片、字体、SVG、纹理和其他二进制素材。
- 能力或平台不满足时，在设计 Mod 选择器与 diagnostics 中明确显示 unavailable reason，不静默降级到主 WebView。
- 保留 v1 Mod 兼容；没有 `nativeSurfaces` 的 Mod 不进入 satellite 流程。

## 3. 实施范围

### 3.1 首次可见与帧循环

- 修复 `DesignSatelliteBridge.start()` / `setVisible()` 的状态初始化，使 Rust 的实际窗口状态与 JS 状态一致。
- `start()` 成功后，若宿主未暂停，应明确执行一次 show，并启动后续合帧 snapshot loop；不可依赖一次
  `setVisible(true)` 的状态变化才能启动。
- `setVisible(false)` 必须停止 rAF；`setVisible(true)` 必须可重复调用且只保持一个 loop。
- 增加 diagnostics 的首次 snapshot、ready、visible、fps 状态更新，避免“已 active 但窗口隐藏”的假状态。

### 3.2 Satellite 资源 API

- 将 satellite `host.assets.url(relativePath)` 改为真正的可加载 URL API。
- 通过现有 Tauri `read_design_mod_asset` 获取 mime/base64，创建 Blob URL，并在 host dispose 时回收。
- 保持路径限制：只能读取当前 Mod 包内相对路径；不得开放任意文件路径。
- 明确文本 API 与二进制资源 API 的边界：`read()` 只读 UTF-8 文本，`assets.url()` 负责二进制/可加载资源。
- dev fallback 必须与主窗口一致，不能因为开发环境而把资源内容直接返回给 DOM `src`。

### 3.3 异步销毁与资源账本

- 为 `DesignSatelliteWindow` 的异步 `run()` 增加取消/失效检查，覆盖 `listen()`、文件读取、Blob URL 创建和动态 import。
- 所有 listener、style 节点、Blob URL、entry cleanup、pending command timer 都进入统一 disposer；无论资源在卸载前还是
  卸载后创建，都只能被释放一次。
- `request()` 在 Tauri invoke 失败、超时和窗口卸载时必须清理 pending map 与 timer，并给调用方稳定的错误 ack。
- Mod 切换和 React StrictMode 重复 mount 不得留下旧 generation 的事件监听或 command 回调。

### 3.4 requires / capability 可用性

- 定义 native surface 能力检查的最小集合，至少覆盖：平台、透明窗口、原生 satellite v1、interactive/passthrough、
  presenter/navigation snapshot 能力。
- 对不满足的 surface 或 Mod 生成结构化 unavailable reason，并在选择器、宿主 diagnostics 和恢复入口中可见。
- 不满足能力时不得创建部分 satellite 后再静默回退；要么整体保持 builtin/default，要么明确显示 partial/unavailable
  状态并允许恢复默认设计。
- macOS/Linux 尚未真人验收时标记 experimental；不能用 Windows 通过来宣称跨平台可用。
- `requires` 的语义写入 `docs/design-mods.md`，并同步 `docs/frontend-structure.md`、`docs/backend-integration.md` 的
  satellite 生命周期说明。

## 4. 测试要求

### 4.1 前端纯逻辑测试

- bridge 初始状态为 hidden 时，`start -> setVisible(true)` 必须产生 show 和帧循环；重复 show 不得创建第二个 rAF。
- pause/hide/resume/destroy 的状态转换、generation 失效和重复 destroy。
- `assets.url()` 的 mime/base64 到 Blob URL 转换、回收 callback 和 dev fallback。
- satellite async run 在每个 await 点失效后的 disposer 行为；listener/style/Blob URL 只能释放一次。
- invoke 失败、ack 超时、卸载时 pending command 的清理。
- capability 检查的 supported/unavailable/experimental/partial 分支和用户可见 reason。

### 4.2 Rust 测试

- 保持现有 manifest、路径、DPI、负坐标和 generation 测试通过。
- 补充 surface visible 状态、重复 ensure/destroy、旧 generation 不污染新 generation 的状态断言。
- 若 capability 判断落在 Rust，补充平台与窗口能力结果的纯逻辑测试。

## 5. 验收标准

### 5.1 静态验收

- `npm test`、`npx.cmd tsc --noEmit`、`npm.cmd run build`、`cargo test` 和 `cargo check` 通过。
- `git diff --check` 通过。
- 工单、实现提交和 docs 状态一致；不能把未跟踪工单或未验证的窗口行为写成完成。

### 5.2 Windows 真实窗口验收

使用 `freeform-capability-fixture`，至少完成：

- 首次启用后 Halo/Island 可见，Halo 点击穿透，Island 可点击并收到 command ack。
- 主窗口移动、resize、maximize、minimize、restore、关闭时 satellite 正确跟随、暂停或销毁。
- 100% 与 125% DPI；双显示器含负坐标；Alt-Tab 后 owned z-order 正常。
- 20 次 Mod 切换与应用重开，无旧窗口、旧事件、旧 Blob 资源残留。
- fixture 使用图片/字体等资源时，release 包从 `resource_dir/design-mods` 正常加载。
- 不支持的平台或能力在选择器中显示明确 unavailable/experimental reason。

未完成真实窗口或 release 验收的项目必须保留 `open`/`partial`，记录到 `docs/known-issues.md`，不能以纯逻辑测试替代。

## 6. 非本单范围

- 不新增新的 sidebar presenter、组件种类或业务命令。
- 不实现自由曲线 Scene Graph、透视四边形编辑器、物理漂浮参数面板或桌面级背景效果。
- 不修改 Emerald-presence、Emerald-desktop 或 Emerald-desktopUI。

## 7. 完成后下一步

本单和真实窗口验收关闭后，另开工单实现 Scene Graph/连接线/透视与物理参数的 Mod authoring contract；届时再扩展
surface 数量预算、性能采样和作者工具，不把基础生命周期问题继续带入视觉扩展。

## 8. 本次施工记录

- 已修复 bridge 初始 hidden、首次 show、snapshot 帧循环、hide/resume 幂等和 diagnostics 更新。
- 已将 satellite 文本/二进制资源 API 分离；二进制通过 MIME/base64 Blob URL 返回，并纳入 host disposer 回收。
- 已覆盖异步卸载后的 listener、style、entry/asset Blob URL、pending command timer 和旧 generation 清理。
- 已增加 native capability report 与 `requires` 评估；选择器禁用 unavailable Mod，diagnostics 展示 experimental/partial reason。
- 已通过 `npm test`、`npx.cmd tsc --noEmit`、`npm.cmd run build`、`cargo test`、`cargo check` 和 `git diff --check`。
- Windows `freeform-capability-fixture` 真实窗口、DPI/多屏、20 次切换和 release 资源验收尚未执行，继续保持 `open`。
- 补充 2026-08-17 debug 实窗：三个 surface 均 page-load、activate 与 ready；Halo 透明穿透、Island owned
  interactivity、move/resize/minimize/restore/close 联动均已验证。实现同时修复了同步 `ensure_design_satellites`
  在 Windows WebView2 下死锁、satellite `invalidated` 函数对象被当作布尔值，以及 satellite 路由误执行主窗初始化的问题。
