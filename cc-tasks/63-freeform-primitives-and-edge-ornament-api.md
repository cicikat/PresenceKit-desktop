# 63：自由组合 Primitive 与边缘装饰 API

> 状态：partial/open。代码闭环已落地，但拖动、裁切、透明合成和恢复默认的 Windows debug 实窗验收仍未完成。
> 本单只创造设计条件和 authoring contract；具体游鱼、灯泡、花朵、透视 HUD 的美术方案由用户与设计实现者决定。

## 1. 背景

现有 Design Mod 已支持 portal 挂载和 `host.presenters`，并声明了部分子区域：

- `chat.sidebar.flow.now` / `chat.sidebar.flow.timeline`
- `chat.sidebar.garden.visual` / `summary` / `controls`
- `chat.sidebar.diary.characters` / `entries`

但当前 fixture 仍挂载 `chat.sidebar.flow/garden/diary` 三个父级，因此表现为“把整页换位置”。Status 只有整页 component id，Garden/Diary 虽有 presenter snapshot，fixture 也没有证明 Mod 能以数据 primitive 自绘。组件 attachment registry 又禁止父子区域同时占用，缺少清晰的 composition mode、边缘路径和统一节点 transform API。

目标不是继续堆更多固定页面组件，而是让 Mod 能选择：复用官方 renderer、只挂一个官方子区域、或消费稳定 presenter 数据完全自绘。

## 2. 目标

- Sidebar/Chat 能力拆为可独立定位、旋转、缩放、隐藏和替换 renderer 的 primitive，不要求保留传统侧边栏列布局。
- 支持把 Flow 当前状态、时间轴、Garden visual/summary、Diary 当前角色目录、Status mood/timeline 等节点排列在页面顶部、边缘或任意 Scene 层，例如游鱼/灯泡式离散排列。
- 提供页面边缘和组件边缘 ornament anchor/path，使像素花朵等装饰可沿页面、组件或自定义路径生长。
- 动画和生长可由本地 session/chat/state 信号驱动，但不把业务真值复制进 Mod，也不提高 Tauri IPC/snapshot 频率。
- renderer、data presenter、geometry、transform、interaction 和 disposer 有明确所有权，Mod 切换后不残留节点、监听器或 rAF。

## 3. Authoring contract

### 3.1 Renderer primitive 与 data primitive 分层

- 保留 `host.components.attach(id, mount)` 作为官方 React renderer portal，补齐 Status 等仍只有整页 id 的子区域。
- 至少新增或冻结以下语义 primitive（最终命名可调整，但需版本化）：
  - `chat.sidebar.status.mood`
  - `chat.sidebar.status.activity`
  - `chat.sidebar.status.timeline`
  - `chat.sidebar.flow.now`
  - `chat.sidebar.flow.timeline`
  - `chat.sidebar.garden.visual`
  - `chat.sidebar.garden.summary`
  - `chat.sidebar.garden.controls`
  - `chat.sidebar.diary.identity`
  - `chat.sidebar.diary.entries`
- 日记 primitive 只围绕当前激活角色；角色管理器仍属于偏好设置，不重新放回日记面板。
- `host.presenters.*` 是稳定数据层，允许 Mod 不挂官方 renderer 而自绘。每个 snapshot 必须有 schemaVersion、updatedAt、source、loading/error 和最小 command 集。
- 为高频字段提供 selector/subscription 或版本号，避免任一 mood/pointer 变化导致整份 Garden/Diary renderer 重画。

### 3.2 Composition mode 与所有权

- manifest/host API 明确每个 capability 选择 `official-renderer`、`subregions` 或 `presenter-only`；不能靠“先 attach 父级，失败后猜测子级”决定。
- 父级与子级冲突继续被校验，但错误必须说明冲突节点和可选模式；允许同一 capability 的不同子区域分别挂到不同 layer/位置。
- 未挂载的官方区域不应在隐藏父页面中继续占据布局、轮询或交互命中。
- builtin-default 保持现有完整页面 renderer，不因 primitive 化改变默认产品体验。

### 3.3 Scene node 与 transform API

- 在工单 62 的 transform controller 上提供轻量 Scene node API，而不是让 Mod 直接同时写 `left/top/translate/transform`。
- 节点至少拥有：稳定 id、source primitive、layer、anchor、size constraint、base position、visual transform、z-order、pointer mode、visibility 和 disposer。
- 支持绝对/相对 viewport、相对组件、沿 path 三类定位；支持 rotate/perspective/scale，但字体不随 viewport 宽度自动缩放。
- physics 只写 controller 的 physics channel；drag 只写 drag channel；最终 DOM 每帧一次提交。
- 主 WebView 动画可本地 60fps，但不得每帧触发 React root render、Tauri window query 或跨 WebView snapshot。

### 3.4 Edge ornament API

- 提供只读的 page edge 和 component edge geometry：至少能返回 rect、四条有方向边、corner、可见性、DPI/scale 与 geometry version。
- 提供 `observeEdge(target, listener)` 或等价接口；geometry 未变化时不重复通知，covered/hidden 时暂停。
- Ornament node 可以沿边缘按进度采样位置/法线，支持 page edge、component edge 和 Mod 自定义 path。
- 生长状态由 Mod 自己的 session-local controller 管理，可读取 `host.signals.chat.elapsedMs`、mood/version 等信号；不得写回 StateEngine、后端或长期记忆。
- 页面/组件边缘是本单必做；Tauri 原生窗口外框边缘是 optional adapter，不得阻塞主交付。
- 提供像素/DOM/canvas 三种 renderer 中至少一种正式示例；大量装饰优先 canvas，避免生成无界 DOM 节点。

### 3.5 Fixture 必须证明真实自由度

- 重写 `freeform-capability-fixture`，不得再挂 Flow/Garden/Diary 整页作为主要证明。
- 最少演示：Flow now 与 timeline 分离、Garden visual 与 summary 分离、Diary 当前角色目录独立、Status mood 自绘、三个以上节点在页面顶部非栏式排列。
- 演示一个沿页面边缘生长、一个沿组件边缘生长的像素 ornament；session 增长有上限并能在 cleanup 完全释放。
- 演示透视/旋转节点无矩形裁切、拖动与窗口惯性不竞争；B/G/R 等 diagnostics 不出现在产品视觉。
- 示例只是能力 fixture，不作为最终产品美术，也不得把固定坐标写成 API 唯一用法。

## 4. 性能与生命周期约束

- 沿用工单 60 的 native snapshot 上限和暂停边界；native surface 默认不超过 20Hz snapshot。
- geometry/edge 通知事件驱动；本地 animation loop 按 scene 统一调度，不允许每个 node 各开永久 rAF。
- presenter acquire/release 绑定真实 consumer；关闭/隐藏节点后对应 polling 回到基线。
- Scene、ornament、asset Blob URL、pointer capture、ResizeObserver 和事件订阅全部进入同一 disposer ledger。
- 20 次 Mod/布局切换后 DOM node、listener、timer、rAF、WebView 和 Blob URL 回到基线。

## 5. 测试与验收

### 5.1 纯逻辑

- component ownership 与三种 composition mode。
- scene transform 合成、anchor/path 采样、edge direction/normal、DPI 与负坐标。
- geometry version 去重、hidden pause/resume、ornament growth 上限与 cleanup。
- presenter selector 不因无关字段变化通知 consumer。
- parent/child attachment、StrictMode、异步 activate 和快速切换不串代。

### 5.2 自动检查

- `npm test -- --run`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `cd src-tauri && cargo test && cargo check`
- `git diff --check`

### 5.3 真实窗口

- 在宽、窄主窗口中将至少五个 primitive 排列于页面顶部/边缘，布局不退化成传统整页侧边栏。
- 页面边缘和组件边缘像素装饰随 session 生长，resize/移动/切 tab 后仍贴合目标且不遮挡关键输入。
- 连续拖动节点并移动主窗口，无抽搐、裁切、异常光晕或点击命中漂移。
- builtin-default、fixture、另一个普通 Design Mod 来回切换 20 次，默认 UI 和 native surface 均可完整恢复。
- 100%/125%/175% DPI 与双屏负坐标至少各验证一次；外框 native ornament 未实现时明确记为 optional/open，不影响页面/组件边缘验收。

## 6. 文档、三面闭环与版本

- 更新 `ARCHITECTURE.md`、`docs/frontend-structure.md`、`docs/design-mods.md` 和 `docs/known-issues.md`。
- component/presenter/manifest schema 变化必须记录版本迁移和 fixture 示例；新增 Tauri IPC 时同步 `docs/backend-integration.md`。
- 后端管理面和手机端不新增对应设置；本单只消费现有桌面状态，不创建后端配置或跨端真值。
- 未完成真实 Windows fixture 验收时保持 `partial/open`。
- 本单独立提交，不与工单 62 或此前未提交工作区改动混成一个提交。

## 7. 非目标

- 不决定最终视觉主题、颜色、游鱼造型、花朵图案或 HUD 文案。
- 不实现完整设计器、拖拽编辑器或可视化导出工具。
- 不承诺主 WebView DOM 越过 Tauri 物理窗口；越窗仍使用 native satellite。
