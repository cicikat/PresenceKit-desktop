# 60：运行时性能与架构解耦

> 状态：partial/open。已完成本地采样/合帧、卫星暂停边界、资源优先加载、请求去重和窗口生命周期纯逻辑闭环；2026-08-17 完成 Windows debug fixture 的窗口创建、20Hz 边界相关生命周期、move/resize/minimize/restore/close 真实验证，但 debug/release 的 frame p95、click-to-ack、私有字节和 20 次压力基线仍待验收。目标是恢复聊天窗口的交互流畅度，并为后续窗外视觉、物理漂浮和复杂 Design Mod
> 提供可扩展的运行时边界。本单不负责 Ribbon tooltip、桌宠开关和 Activity onboarding 的具体回归修复，
> 这些问题必须另行修复或在本单开始前确认已不再阻塞主窗口操作。

## 1. 背景与证据

当前 native satellite fixture 启用后，主窗口在每个约 50ms 的 snapshot tick 中，为每个 surface 重复执行
`outerPosition`、`outerSize`、`scaleFactor`、`isVisible`、`isFocused`、`isMaximized` 等窗口查询，随后分别广播
整份 snapshot。3 个 surface 时约为每秒 360 次窗口查询和 60 次跨 WebView 事件；宿主 diagnostics 又把每次发布
转成 React state 更新，宿主和 fixture 各自还有独立的 requestAnimationFrame。

同时，头像 store 串行加载多个大资源并在全部完成后才 emit，ChatWindow 启动阶段重复请求 prompt assets；
窗口控制、Design Mod host、presenter 生命周期和业务 UI 仍集中在少数大组件中。结果表现为按钮延迟、拖动卡顿、
头像长时间显示默认值，以及切换窗口后后台工作仍然持续。

## 2. 目标与非目标

### 2.1 目标

- 将高频数据从“每个 surface 查询一次、每次都触发 React”改为单一采样、缓存和合帧广播。
- 让窗口移动/resize、pointer、presenter 业务状态和 diagnostics 使用不同频率，不相互拖慢。
- 让 covered/hidden/minimized/builtin-default 状态停止不必要的网络轮询、rAF、IPC 和跨窗事件。
- 头像和角色资源先提供可用结果，再后台补齐低优先级背景资源。
- 将窗口生命周期、运行时资源 disposer、snapshot transport 和宿主 UI 解耦，使后续自由视觉可以增加
  surface、连接线和物理层而不把业务组件拖进高频循环。
- 建立可量化的性能预算和诊断，避免“感觉变卡”只能靠猜。

### 2.2 非目标

- 不在本单实现新的透视四边形、桌面背景、物理漂浮或 Scene Graph authoring API。
- 不删除 ChatWindow 保持挂载的产品约束；聊天历史、草稿和唯一 WS owner 必须继续存活。
- 不把业务 presenter 真值复制进 satellite 或第二份 StateEngine。
- 不为了性能静默减少用户可见功能；降频、暂停和采样策略必须记录在 diagnostics。

## 3. 实施范围

### 3.1 建立运行时性能基线

新增可关闭的本地 diagnostics，至少记录：

- 主线程长任务、最近 1 秒平均/95 分位 frame time；
- Tauri command 次数与耗时，按 command 名称聚合；
- satellite snapshot 采样率、发送率、丢弃率、payload bytes；
- React host/ChatWindow 关键 render 次数；
- 头像/角色/背景资源的首次可用时间与完整加载时间；
- JS heap 使用量（浏览器可用时）和 Blob URL/监听器 disposer 数量。

基线必须能够分别对比 builtin-default、普通 v1 Design Mod、native fixture 三种状态，并记录窗口 hidden、
covered、Activity overlay、偏好打开等场景。不得只凭生产 build 成功宣称性能改善。

### 3.2 Native snapshot transport

- 主窗口 geometry/status/focus/DPI 只采样一次，生成共享的主窗口快照；同一 tick 的多个 surface 只复用该快照。
- 移动、resize、scale factor 改变和窗口可见性使用事件更新缓存；没有变化时不重复调用 Tauri window API。
- 高频 snapshot 只携带 pointer、motion、bounds、anchors 和必要的 sequence/timestamp；state、chat、navigation、
  presenter 使用事件驱动或独立低频版本号，不得每帧深拷贝整份对象。
- 多 surface 在一个合帧批次内发送，限制跨 WebView emit 次数和 payload 大小；接收方保留 stale frame 丢弃。
- 设置明确预算：默认 fixture 不超过 20Hz 采样，非交互/后台状态自动降到低频或停止；interactive surface 不得
  通过提升主窗口 IPC 频率解决视觉平滑问题。
- diagnostics 更新与渲染帧解耦，不能在每个 snapshot 发布中触发宿主 React state；FPS/序号采用 1 秒或显式事件
  更新。

### 3.3 宿主与 presenter 生命周期

- 将 `DesignSatelliteBridge`、geometry sampler、diagnostics publisher 和 UI presenter 从 `DesignModHost` 的单一
  高频 render 路径拆出，使用稳定 controller/store 接口。
- `builtin-default` 没有 native surface 时不启动 satellite/geometry 高频 loop。
- `covered`、`document.hidden`、Dream overlay、Activity/Toy/Room overlay、最小化时暂停可暂停的 polling、rAF、
  snapshot 和跨窗事件；恢复时只补发一份最新快照。
- presenter 的 acquire/release 必须与实际 consumer 数量绑定，切换 Mod、切换 tab、卸载窗口后不重复 timer 或订阅。
- 任何高频外部 store 订阅不得直接导致 ChatWindow 大树重渲染；必要时使用 selector、独立订阅组件或
  `useSyncExternalStore` 等稳定边界。

### 3.4 窗口控制与架构解耦

建立轻量 Window Coordinator/Window Lifecycle API，至少统一：

- Pet、Activity、Toy、Room、Diary detail、Design satellite 的 open/show/hide/destroy 状态；
- generation、请求去重、窗口不存在/已销毁、show 失败和用户可见错误；
- covered/hidden/minimized 状态向各窗口消费者广播，而不是由 ChatWindow 直接管理每个副作用。

Coordinator 只拥有窗口生命周期，不拥有聊天业务真值；WS、HTTP、StateEngine 和 presenter 继续由主窗口 owner
持有。原生窗口失败必须有结构化错误和重试入口，不能只写 `console.warn` 后让按钮看起来失效。

### 3.5 头像与资源加载管线

- `avatarStore.init()` 先读取配置并并行加载 HER、YOU 和当前角色头像；首个可用头像到达就 emit。
- Dream 背景、聊天背景和其他低优先级素材后台加载，不能阻塞首屏头像或偏好面板。
- 合并 ChatWindow 中重复的 prompt-assets 请求；共享一次请求结果并更新 active character cache。
- active character 变化必须通过订阅或明确 controller 通知聊天头部、偏好和 presenter；不能依靠手动 remount
  整个 `ChatPanel`。
- 所有 Blob/Object URL 和请求取消都登记到资源 disposer；窗口卸载或角色切换不留下旧资源。

## 4. 测试要求

### 4.1 纯逻辑与前端测试

- snapshot sampler 在多个 surface 下只产生一次窗口状态采样，并能复用到所有 surface。
- snapshot 合帧、节流、降频、暂停/恢复、stale frame 丢弃和 payload 裁剪。
- diagnostics 采样不会按每帧触发 React listener；1 秒统计窗口和异常长任务记录稳定。
- controller 的 open/show/hide/destroy 幂等、并发请求去重、失败重试、旧 generation 隔离。
- covered/hidden/builtin-default 下所有高频 timer/rAF/订阅正确停止并在恢复时释放一次。
- avatar 首个可用资源优先 emit、后台资源迟到 emit、请求去重、角色切换取消旧请求。
- presenter acquire/release、Mod 切换和 StrictMode 重挂载不累积订阅或 timer。

### 4.2 Rust 测试

- 窗口状态缓存和 move/resize/scale event 的更新路径；无变化时不重复计算或应用 bounds。
- Coordinator 的 open/show/hide/destroy 幂等、旧 generation 拒绝、窗口缺失和关闭事件恢复。
- 现有 DPI、负坐标、透明/interactive/passthrough 和 native capability 测试继续通过。

### 4.3 真实窗口与性能验收

在 Windows debug fixture 和 release resource_dir 两种运行方式下记录前后对比：

- builtin-default：普通点击、滚动、输入和聊天收发无可感知延迟；不启动 native 高频循环。
- native fixture：3 个 surface 在移动/resize 时保持视觉跟随，主窗口 IPC 和 snapshot 频率在预算内。
- hidden、minimize、Activity overlay、Dream overlay、偏好打开、恢复和关闭后无后台高频任务残留。
- 头像首个可用时间、偏好打开到头像显示时间、按钮 click-to-ack、平均/95 分位 frame time 有记录。
- 20 次 Mod/窗口切换后，surface、listener、timer、Blob URL 和 WebView 数量回到预期基线。
- 100%/125% DPI、双屏负坐标、Alt-Tab、主窗口关闭和 release 资源加载继续通过。

## 5. 三面闭环与文档

- 后端管理面：本单不新增 Presence 配置或后端队列；若增加本地诊断字段，只记录客户端本地采样，不上传业务内容。
- 桌面设置面：性能/能力 diagnostics 只读展示；窗口失败、暂停和恢复要有明确入口。手机端不新增对应设置。
- 调用链：核对 WS/HTTP/StateEngine/presenter → snapshot/controller → Tauri window → satellite 的 owner、generation、
  ack、TTL 和销毁路径，确保降频不改变业务消息语义。
- 同步更新 `ARCHITECTURE.md`、`docs/frontend-structure.md`、`docs/design-mods.md`、`docs/backend-integration.md`
  和 `docs/known-issues.md`；真实窗口或性能基线未完成时保留 `open`/`partial`。

## 6. 完成标准

- 性能基线和前后对比数据已保存到工单或 diagnostics 记录，不能只写“感觉更流畅”。
- `npm test`、`npx.cmd tsc --noEmit`、`npm.cmd run build`、`cargo test`、`cargo check` 和 `git diff --check` 通过。
- 每个独立 controller/transport/resource 变更小步独立提交；不得把未跟踪工单或构建产物当成完成证据。
- Windows 真实窗口与性能验收完成前，本单保持 `partial/open`。

## 7. 后续依赖

本单关闭后，才进入 Scene Graph、透视连接线、物理漂浮、桌面边界外视觉和更高自由度的 Design Mod authoring
contract。后续视觉工单必须沿用本单的 snapshot budget、Window Coordinator 和 disposer 边界。
