# cc-tasks/54 - 可信设计 Mod 运行时与自由合成宿主

> 状态：部分已实施（代码与静态验证通过；真实窗口 fixture 交互和 release 资源包验收待完成）。本单取代 `proposal-freeform-canvas-mod.md` 中“iframe + `postMessage` +
> `elementSpec` 白名单”作为第一版实现路线。第一版按本地可信代码处理，优先建立足够宽的设计能力；
> 不可信第三方沙箱是后续独立信任等级，不能反过来限制本单的创作上限。

## 0. 目标

建立一套 Chat 窗口的可信设计 Mod 运行时，使 Mod 作者能够：

1. 在全窗口设计舞台内自由使用 DOM、CSS、SVG、Canvas、WebGL、`requestAnimationFrame`、Pointer
   Events 和自行打包的运行时依赖，不被宿主 `elementSpec` 或 CSS 变量白名单限制。
2. 把客户端已有的真实可视功能作为组件能力拉出并重新合成，而不只是读取 mood / activity 等状态。
   第一批至少包括 Ribbon、Chat header / transcript / composer，以及 Sidebar 的动向、花园、日记、
   状态四个独立面板。
3. 让真实组件离开原来的三槽布局，挂载到 Mod 创建的任意容器中；允许同时显示四个 Sidebar 功能，
   允许绝对定位、重叠、旋转、缩放、`clip-path`、CSS 透视和 `matrix3d()`。
4. 在应用窗口内部跨越栏框、面板框和布局槽边界渲染装饰、连线与交互元素，不被现有
   `overflow: hidden` 的 ChatPanel / Sidebar 容器裁剪。
5. 订阅聊天会话指标、组件几何、鼠标、滚动、视口和 Tauri 原生窗口移动信号，从而支持随会话增长的
   视觉、连接不同面板的动态图形，以及拖动时带惯性/弹簧/约束的漂浮效果。

本单创造能力和工程条件，不规定任何具体美术方案。像素花朵、红色连线、透视四边形、花朵生长规则
均由后续设计 Mod 自己实现。

## 1. 必须先承认的渲染边界

### 1.1 本单必须支持的“应用内出框”

设计舞台覆盖 Chat 原生 Webview 的完整 viewport。Mod 元素可以越过 Ribbon、Sidebar、ChatPanel、
卡片、气泡或自定义框线的边界，只要仍在原生窗口矩形内，就应完整显示并按 z 层参与交互。

不能用给现有三槽容器补一条 `overflow: visible` 代替设计舞台。舞台必须是 Chat 编排根节点的同级层，
拥有独立的 underlay / component / overlay 层，不受 ChatPanel 根节点当前 `overflow: hidden` 影响。

### 1.2 本单不虚假承诺的“原生窗口外溢”

Web 内容无法绘制到 Tauri 原生窗口矩形之外。若最终设计要求花朵或透视面板真正覆盖 Windows 桌面、
越过主窗口物理边界，必须另开“透明伴随窗口 / satellite surface”工单，创建透明、无边框的辅助
Webview，并处理多显示器坐标、DPI、点击穿透、z-order、主窗移动同步和关闭生命周期。

本单只预留 `surface: 'main' | 'satellite'` 的目标类型与不可用诊断；不创建伴随窗口，也不得把
viewport 内的视觉错位宣传成原生窗口外溢。

## 2. 已拍板的第一版运行模型

### 2.1 可信同域 ESM

- `entry.js` 作为已经打包好的单文件 ESM，通过 Blob URL `import()` 或等价的同域模块加载方式运行。
- 不使用 sandboxed iframe，不逐帧通过 `postMessage` 搬运鼠标、几何或样式更新。
- Mod 与前端处于同一 JavaScript realm，明确标记为“可信本地代码”。第一版只允许同时启用一个运行时
  设计 Mod，避免尚未定义的多 Mod 合成顺序。
- Mod 可以在分配给它的舞台根中创建任意 DOM / SVG / Canvas；可将 Matter.js、动画库或其他依赖
  打包进自己的 `entry.js`。宿主不为具体物理或美术效果重新发明引擎。
- “可信”不改变仓库通信规则：业务 HTTP 仍走现有 shared API -> Tauri command，设计 Mod 不新增
  浏览器 `fetch` 直连 Presence 后端的旁路。

同域执行意味着 Mod 理论上能影响宿主；这是本阶段接受的信任选择，不要在本单里投入权限白名单、
网络拦截、代码签名或 iframe RPC。工程上仍必须有明确的 `activate()` / `dispose()` 生命周期，因为
热切换、重复监听和残留动画不是安全问题，而是基本正确性问题。

### 2.2 包格式与唯一资源真值

```text
public/design-mods/<id>/
├── mod.json
├── entry.js              # 已打包单文件 ESM，不允许运行时裸相对 import
├── style.css             # 可选，设计 Mod 自己的完整 CSS
├── assets/               # 可选，本地图片、纹理、着色器、字体等
├── theme/                # 可选，仍按现有 theme 契约独立校验
│   ├── theme.json
│   └── theme.css
└── layout/               # 可选，仍按现有 layout 契约独立校验
    ├── layout.json
    └── layout.css
```

`mod.json` 第一版字段：

```json
{
  "schemaVersion": 1,
  "id": "example-design",
  "name": "Example Design",
  "author": "author",
  "version": "1.0.0",
  "entry": "entry.js",
  "style": "style.css",
  "theme": "theme/theme.json",
  "layout": "layout/layout.json"
}
```

`theme` / `layout` 均可省略。用户从设计 Mod 入口启用完整包时，宿主先分别调用现有 theme/layout
validator，再激活 runtime；任一已声明部分非法则整次“一键应用”不落半套状态。校验实现保持独立，
不能为了打包方便把 token、layout 和 JS 混成一份无法单独诊断的 schema。启用成功后仍允许用户在
ThemePicker 或布局预览器里单独改选，runtime 必须实时接受新的 token 与组件几何，而不是强制锁定
配套外观。

内含 theme/layout 不能再复制到 `public/themes/` 或 `public/layouts/` 形成第二份源码。现有 registry
需要增加 `design-mod` source，并通过当前 design-mod asset resolver 读取其 CSS；独立主题/布局 Mod
继续使用原目录，二者共享 validator 而不共享物理根目录。

沿用 cc-tasks/53 已建立的互斥资源语义：debug 只读 `public/design-mods/`，release 只读
`resource_dir/design-mods/`。`target/` 和 `dist/` 只是构建副本。同步添加 Tauri bundle resource、
manifest 列表、文本入口读取和本地 asset URL 解析；所有读取必须共用同一个已解析根目录。

入口加载失败、manifest 非法或 `activate()` 抛错时，保持内置默认布局可用并提供明确诊断。这里的
fallback 是运行时恢复，不是跨资源根 fallback。

## 3. 设计宿主的三层结构

在 `ChatWindow` 编排根下新增 `DesignModHost`，目标结构为：

```text
Chat viewport
├── design-underlay       # 背景纹理、全局 Canvas；默认不接管指针
├── design-components     # 宿主真实 React 组件的自由挂载容器
├── design-overlay        # 花、线、HUD、透视装饰、拖拽物；允许局部接管指针
└── system-overlays       # Preferences / Dream / 错误恢复入口等，仍由宿主保底置顶
```

要求：

- 三个设计层均为 `position: fixed; inset: 0` 的 viewport 坐标系，根层不裁剪应用内越界内容。
- 根层默认 `pointer-events: none`；只有 Mod 声明的交互节点和真实组件挂载容器使用
  `pointer-events: auto`，避免透明画布吞掉聊天操作。
- component / overlay 层必须允许 `perspective`、`transform-style: preserve-3d`、`matrix3d()`、
  `clip-path` 和自定义 stacking context。宿主不得在共同祖先上用会意外 flatten 3D 的 transform、
  filter 或裁剪规则。
- Mod 可取得舞台真实 HTMLElement，直接创建 SVG / Canvas 并运行自己的 rAF 循环。连线、任意
  四边形的 homography、物理模拟和具体绘制算法属于 Mod，而不是宿主白名单 API。
- Preferences、Dream、Yandere 和错误恢复入口的 z 层必须高于 Mod，保证设计错误不会遮死唯一恢复
  路径。这是可用性底线，不是第三方安全沙箱。

## 4. 可视组件能力目录

### 4.1 不是“复制一份组件”

新增 `src/shared/design-mod/`（或与现有结构一致的等价目录）作为运行时与契约边界。宿主注册真实
React 可视能力，Mod 创建挂载点并调用类似接口：

```ts
host.components.attach('chat.sidebar.garden', mountElement)
host.components.detach('chat.sidebar.garden')
host.components.list()
```

`attach()` 由宿主通过 React portal 或等价的 React 所有权机制把真实组件渲染到目标容器。Mod 不得
从源码路径 import `SubGarden`，也不得 clone DOM 后冒充真实组件。

第一批稳定 component id：

| component id | 对应真实能力 | 第一版策略 |
|---|---|---|
| `chat.ribbon` | Ribbon 及现有命令入口 | singleton |
| `chat.header` | 当前对话标题、头像、状态与入口 | singleton |
| `chat.transcript` | 消息流、历史加载、右键和流式呈现 | singleton |
| `chat.composer` | 输入、附件、语音、发送与回复预览 | singleton |
| `chat.sidebar.flow` | 动向 / NOW / timeline | singleton |
| `chat.sidebar.garden` | 陪伴花园 | singleton |
| `chat.sidebar.diary` | 日记列表与详情入口 | singleton |
| `chat.sidebar.status` | sensor / mood / presence 状态面板 | singleton |

每个 descriptor 至少包含 `id`、`singleton`、默认尺寸、最小尺寸、当前挂载状态、suspend policy、
可用性与错误状态。未知 id 返回显式错误，不静默渲染空框。

### 4.2 必要的组件拆分

当前 `SidebarPanel` 只条件渲染活动 tab，`ChatPanel` 则在同一大组件里直接渲染 header / transcript /
composer。为支持自由合成，必须完成以下最小重构：

1. 把 Sidebar 的标题壳与 `SubFlow` / `SubGarden` / `SubDiary` / `SubStatus` 内容能力分开注册；默认
   布局仍可用同一个 sidebar shell 呈现当前 tab。
2. 允许四个 Sidebar 能力同时挂载，每个能力只存在一个真实 React 实例。
3. 保持 ChatPanel 的消息、输入、WS 对账、history 和 TTS controller 单实例；header / transcript /
   composer 只拆渲染出口，不复制 controller、消息数组或订阅。
4. 设计 Mod 切换挂载点时不得创建第二套聊天状态或第二条 WS / HTTP 链。组件的业务 owner 仍是
   ChatWindow / ChatPanel / shared controller，Mod 只拥有空间编排。
5. 默认未启用设计 Mod 时，外观、布局、侧栏 tab、拖拽宽度、输入焦点、滚动加载与 overlay 行为必须
   和当前实现一致。

`SubFlow` 的 timeline 持久化、`SubStatus` 的轮询、Garden / Diary 的请求都必须审计生命周期。多面板
同时显示时允许各自的既有请求工作，但同一 capability 不得因重新挂载或镜像显示产生重复 interval、
重复写入或并发轮询。必要时把数据 controller 从渲染组件上移，不要让 Mod 接管请求。

## 5. 信号、几何与命令契约

可信 Mod 不只读取 `StateEngine`。`host` 至少提供以下四类能力，接口使用直接订阅/同步读取，不走
逐帧序列化：

### 5.1 Read-only signals

- `state.snapshot`：现有 StateEngine 的 mood / activity / focus / presence 镜像。
- `chat.session`：当前 ChatPanel 会话的 `startedAt`、`elapsedMs`、本次挂载后新增 entry 数、turn 数、
  当前可见历史 entry 数、typing / loading 状态。必须区分“加载了多少历史”与“这次聊了多久/新增
  多少”，不能用 `messages.length` 混成一个生长指标。
- `chat.navigation`：当前现实 / 群聊 / Dream 覆盖态、Sidebar tab 与可见性，只读镜像。
- `theme`：当前 day/night、主题 id 和 token 读取。
- `viewport`：CSS 像素尺寸、devicePixelRatio、可见/covered/paused 状态。
- `pointer`：viewport 坐标、按键、按下/拖动状态。
- `nativeWindow.motion`：通过 Tauri `getCurrentWindow().onMoved()` 取得物理位置，统一换算坐标与 DPI，
  派生 `delta` / `velocity` / `moving`，供拖动整个原生窗口时的惯性效果使用。

不能假设所有平台在系统标题栏 live move 期间都以稳定帧率投递 `onMoved`。实现必须记录真实事件时间戳
并插值；若 Windows/WebView2 实测在系统 move loop 中暂停渲染，则第一版至少在恢复事件时给出正确的
位移冲量并稳定收敛。若最终设计必须在标题栏拖动期间逐帧运动，再单独评估自绘标题栏拖动或 Rust
`WM_MOVING` 事件流，不能靠提高 JavaScript 轮询频率伪造。

`elapsedMs` 与窗口运动速度可以按 animation frame 派生，但不得用 React state 每帧重渲染整个
ChatWindow。高频值采用外部 store / mutable snapshot + subscribe，渲染器自行在 rAF 内读取。

### 5.2 Component geometry

- `host.geometry.get(componentId)` 返回 mount container 的 viewport rect、可见性与变换版本。
- `host.geometry.observe(componentId, callback)` 使用 `ResizeObserver`、scroll/resize 与 Mod 布局变更
  统一失效几何缓存。
- 对透视面板，宿主只保证容器和基础矩形；变换后的四角、连线路径与碰撞体由拥有变换矩阵的 Mod
  自己计算，避免 `getBoundingClientRect()` 被误当作任意四边形。
- 几何更新与连线绘制在同一帧批处理，不允许每条线分别触发布局测量，避免 layout thrashing。

### 5.3 Host commands

只为复用现有 UI 动作提供稳定命令，例如打开/关闭 Sidebar、切 tab、打开偏好、恢复默认设计。命令
调用现有 controller，不复制 `setUIPref`、navigation state 或 Tauri IPC 细节。第一版不要求把所有
后端业务 API 暴露给 Mod；真实面板本身已经持有其完整交互能力。

### 5.4 Assets

提供 `host.assets.url(relativePath)`，只负责把当前 Mod 的 `assets/` 相对路径转换为 Webview 可加载
URL。它必须支持图片、字体、纹理、shader 文本和二进制资源，且 debug/release 指向同一个当前模式
资源根。禁止要求作者把资源转成 data URL 塞进 manifest。

## 6. 生命周期、开发体验与恢复

设计 Mod 模块导出：

```ts
export function activate(host: TrustedDesignHost): void | (() => void) | Promise<void | (() => void)>
```

宿主负责：

1. 每次启用分配新的 abort signal、舞台根和资源 resolver。
2. 切换、刷新、窗口卸载或激活失败时依次 abort、调用 disposer、取消宿主代注册的订阅/observer、
   停止宿主代管 rAF，再移除 DOM、style 与 Blob URL。
3. 提供开发态“刷新设计 Mod”和诊断区，展示 manifest、加载阶段、最近异常、已挂载 component id、
   活跃订阅数和当前 FPS/long-task 提示。
4. 保存 `chat.designMod` 本地 UI 偏好；找不到或加载失败时回退 `builtin-default`。恢复默认设计入口
   不能位于 Mod 可覆盖的层内。
5. 所有新增可见文案使用 `src/shared/i18n/` 语义 key。

不要为第一版实现权限弹窗、签名、网络许可、代码审查或多 Mod 冲突解决器。需要保留明确的“可信
本地代码”标签和一键恢复默认设计，但不要让安全工作吞掉组件自由合成、几何或动画能力。

## 7. 非美术诊断样架

本单必须附一个仅用于验收能力的 `public/design-mods/freeform-capability-fixture/`。它不是产品设计，
不决定最终审美，只证明基础设施没有缩水。样架至少完成：

1. 同时拉出 `flow`、`garden`、`diary`、`status` 四个真实面板。
2. 将其中两个容器做非矩形 `clip-path` 和明显 CSS perspective / `matrix3d()`，仍可滚动与点击。
3. 用单个 SVG overlay 连接至少三个真实组件，拖动/resize 后下一帧更新端点。
4. 在 Sidebar 或 Chat 主框边线上生成一组可越过该框线的占位像素装饰，证明不受原容器裁剪；装饰
   数量由 `chat.session.elapsedMs` 或 session entry 数驱动，证明会话信号可用。
5. 使用成熟物理库或 Mod 自带的约束实现让至少两个容器在内部拖动和原生窗口移动时产生可见惯性、
   弹簧回拉或连接约束；停止后稳定收敛，不持续抖动或漂出不可恢复区域。
6. 切回 `builtin-default` 后恢复当前标准 UI，输入内容、消息、当前 Sidebar 数据和滚动链不产生第二份
   owner；样架的 DOM、监听器、observer 和 rAF 全部释放。

样架不使用最终花朵、红线或用户指定构图，避免基础设施工单擅自替设计者拍板。

## 8. 实施拆分与依赖

### 前置串行：契约冻结

先落 `mod.json`、`TrustedDesignHost`、component id、signals 与三层 z-order 契约。后续并行项不得自行
发明第二套 id 或生命周期。

### 可并行 A：资源与加载器

- Tauri design-mod 根目录、manifest / entry / style / asset 读取。
- 前端 registry、Blob ESM loader、偏好、刷新与诊断。
- debug/release 单一真值测试。

### 可并行 B：组件能力化

- Sidebar 四能力独立注册与 polling/controller ownership 收口。
- Chat header / transcript / composer 渲染出口拆分。
- 默认布局兼容适配。

### 可并行 C：高频信号与几何

- session metrics 外部 store。
- pointer / viewport / native window motion store。
- geometry registry、ResizeObserver 与逐帧测量批处理。

### 汇合：DesignModHost 与诊断样架

只有 A/B/C 都验收后再接自由舞台与 capability fixture。不要先写一个只会生成装饰 DOM 的 loader 就
宣称设计 Mod 已完成。

## 9. 测试与验收

### 9.1 纯逻辑测试

按仓库约定把无 DOM 逻辑拆成同级 `.test.ts`，至少覆盖：

- manifest schema、id/entry/style/path 规则；
- debug/release 资源根互斥；
- registry 选择、缺失回退和刷新；
- 设计包 theme/layout/runtime 分别校验、一键应用的原子提交与失败回滚；
- activation generation：旧异步 activate 不能污染新 Mod；
- dispose/abort 幂等和宿主订阅账本归零；
- singleton component 重复 attach、detach、未知 id；
- session history count / session count / elapsed 语义；
- native window position + 时间采样到 CSS delta / velocity 的纯函数换算；
- geometry dirty-set 的同帧去重。

### 9.2 原路径回归

- 未启用设计 Mod时，内置 layout/theme、Ribbon、Sidebar tab、Divider、ChatPanel、Group view、Dream、
  Preferences 和 PaneHost 行为不变。
- ChatPanel 仍只有一份 WS/HTTP/history/TTS owner；切换 Mod 不重复消息、不重复发送、不丢未发送输入。
- 四个 Sidebar 能力同时显示时请求频率符合原契约，同一能力重新定位不增加 polling/interval 数。
- Activity / Toy / Room 覆盖 ChatWindow 时正确 pause 高频设计循环，返回后恢复；后台窗口不持续满帧。
- 主题切换后 Mod 舞台和 portal 组件都能读到最新 token。

### 9.3 真实窗口验收

必须在 `npm run tauri dev` 的真实窗口完成 capability fixture 验收，不能只用静态截图或纯浏览器
fallback。至少检查：

- 800x600、宽桌面和窄窗口三种尺寸无不可恢复的遮挡；
- 应用内越过 panel 边框的装饰没有被 ChatPanel / Sidebar 裁剪；
- 透视容器中的按钮、滚动区和输入操作命中正确；
- 连线在 resize、内部拖动、Sidebar 变化和原生窗口移动后保持连接；
- 物理动画运动并收敛，未出现空白 canvas、持续 layout thrash 或明显输入延迟；
- 刷新/切换 20 次后活跃 rAF、observer、window listener 和 polling 数不递增；
- 恢复默认设计入口始终可点击。

执行构建、跨仓检查和真实窗口验证前先读相邻 `Emerald-presence/docs/dev-environment.md`，然后运行：

```bash
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run check:naming
cd src-tauri
cargo test
cargo check
```

最后执行 `git diff --check`。若未完成 release 包内 `resource_dir/design-mods` 验证，交付时必须明确
标为未验证，不能用 dev 根目录成功代替。

## 10. 文档与三面闭环

同步更新：

- `ARCHITECTURE.md`
- `docs/frontend-structure.md`
- `docs/layout-mods.md`
- `docs/ui-mods.md`
- `docs/backend-integration.md`（新增 Tauri design-mod commands）
- 新增 `docs/design-mods.md`，记录真实可用 component / signal / command / layer 契约与作者流程
- `proposal-freeform-canvas-mod.md` 标记为被本工单的可信运行路线取代，避免双轨实现

三面检查结论：

- 后端管理面：设计 Mod 是桌面本地呈现与本地偏好，不新增后端配置、业务真值、trace 或队列；不需要
  Presence 管理面开关。若未来给 Mod 开业务 API，再单独做 scope、effective state 与观测工单。
- 桌面设置面：在“界面”提供可信设计 Mod 选择、刷新、诊断和恢复默认入口；偏好是桌面本地
  `chat.designMod`。手机端不加载 Tauri 本地资源，不添加伪入口。
- 原调用链：真实组件继续走原 controller / shared API / Tauri / WS 链，Mod 仅改变渲染挂载点。
  必须核对鉴权、去重、ack、TTL、polling、pause/resume 和 fallback 没有因组件拆分产生第二份 owner。

本单新增 Tauri IPC command，必须更新本仓 `docs/backend-integration.md`；不改变 Presence HTTP/WS
协议，因此不修改 `docs/protocol-v0.md`。若实施发现需要新增后端 endpoint 或跨端协议，停止扩项并
另开跨仓工单，同时更新后端三仓接口总账。

## 11. 不在范围内

- 不制作最终花朵、红线、神经网络、监控 HUD 或其他正式视觉方案。
- 不实现不可信第三方 iframe 沙箱、权限模型、签名、市场分发或自动下载。
- 不支持多个运行时设计 Mod 同时合成。
- 不允许 Mod 复制 StateEngine 或直接建立第二条 WebSocket / 后端 HTTP 链。
- 不创建真正跨出 Tauri 原生窗口的透明伴随窗口，只保留未来 surface 类型。
- 不把 Activity、Toy、Room、Dream、Pet 的全部组件一起纳入第一版目录；先把 Chat 与 Sidebar 的
  自由合成闭环做实，再按同一 component contract 扩展。
