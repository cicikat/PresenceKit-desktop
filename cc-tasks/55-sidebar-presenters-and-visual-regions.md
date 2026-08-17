# cc-tasks/55 - Sidebar Presenter 与内部视觉 Region 自由化

> 状态：部分完成（实现已提交；真实窗口 fixture 验收仍为 `open`）。前置依赖中的 54 号实现已独立
> 提交，但真实窗口验收尚未具备可核验的完成证据，因此不能把本单标成完整验收。本单不制作最终视觉，
> 只把现有 Sidebar 的数据、动作与固定渲染解耦，使设计 Mod 能稳定地重新设计内部结构。

> 实现提交：`5cd516f feat(design-mod): unify sidebar presenters and visual regions`。静态与纯逻辑验证：
> `npx.cmd tsc --noEmit`、`npm.cmd test -- --run`（35 files / 167 tests）、`npm.cmd run build`、
> `git diff --check` 均通过。待补：真实 Tauri 窗口中的 fixture、宽窄窗口/拖动/resize/原生移动、20 次
> 切换和 release `resource_dir/design-mods` 验证；详见 `docs/known-issues.md`。

## 0. 目标

当前 Design Mod 能移动八个顶层 capability，但 `chat.sidebar.status` 的内部结构仍全部固定在
`SubStatus.tsx`：MOOD 主卡、ACTIVITY/PRESENCE 双卡、四条 telemetry、两分钟轨迹以及错误重试都是
同一个 React 渲染树。Mod 能移动整个状态面板，却拿不到完整状态 presenter，也不能稳定地把主卡、
轨迹或信号区换成其他结构。

本单建立两层作者能力：

1. **完整官方 capability**：继续通过 `host.components.attach('chat.sidebar.status', mount)` 挂载原面板，
   保证现成功能不丢。
2. **只读 presenter + host commands**：Mod 可取得同一业务 owner 产出的数据和动作，自行用 DOM、SVG、
   Canvas 或 WebGL 画完全不同的卡片、仪表、透视格子和连接关系。

第一优先级是 Status；同一契约随后覆盖 Flow、Garden、Diary。不要把每个文字 span 都注册成 React
component id，也不要让 Mod 复制轮询、时间轴或后端请求。

## 1. 当前限制与必须保留的语义

### 1.1 Status 现状

`src/windows/chat/components/SubStatus.tsx` 当前同时拥有：

- sensor realtime 10 秒轮询与 stale 判断；
- `breath / gaze_lock / mood_aura / rhythm` 派生；
- mood spike / interval 生命周期；
- 60 格、2 秒一格的本地 ring buffer；
- mood/activity 后端轮询错误与 retry；
- MOOD、ACTIVITY、PRESENCE、SignalBar、轨迹的固定 inline style。

深绿背景只有 `--forest-1` / `--forest-2` 受主题控制；右上 glow 的位置、alpha 公式、圆点尺寸与
`statusPulse` 动画仍写死。glow/圆点的 hue 实际来自 `MOOD_HUE[state.mood]`，不是固定红色。

### 1.2 不能破坏的 owner

- mood/activity/presence 真值仍只来自现有 StateEngine / backend polling。
- sensor 请求仍走现有 Tauri/shared API，不允许设计 Mod 直接 fetch。
- 同一个 presenter 无论有官方面板、设计 Mod 订阅或两者同时存在，都只能有一个 polling/timer owner。
- Activity/Toy/Room/Dream 覆盖、document hidden 和设计 runtime paused 时继续暂停高频工作。
- 切换设计 Mod、切 Sidebar tab 或重新挂载 region 不得清空 ring buffer、重复 timeline 写入或增加
  interval 数。

## 2. Presenter Runtime

在 `src/shared/design-mod/presenters/`（或职责等价的 shared 目录）建立可测试的 presenter 契约与
controller。Presenter 是可序列化、只读 view model；React 官方渲染器和 Design Mod 读取同一实例。

### 2.1 通用接口

```ts
interface DesignPresenter<TSnapshot, TCommands> {
  get(): TSnapshot;
  subscribe(listener: () => void): () => void;
  commands: TCommands;
  acquire(consumerId: string): () => void;
}
```

`acquire/release` 负责惰性启停请求和 timer。默认 UI 只有当前 tab 时保持原有生命周期；Design Mod
自定义绘制但未挂载官方组件时，订阅 presenter 仍能启动必要数据链。重复 acquire 只增加引用计数，
不能复制 owner。

`host.presenters` 第一版：

```ts
host.presenters.status.get()
host.presenters.status.subscribe(cb)
host.presenters.status.commands.retryMood()
host.presenters.status.commands.retryActivity()

host.presenters.flow.get()
host.presenters.garden.get()
host.presenters.diary.get()
```

所有 subscribe/acquire 必须登记到现有 Design Mod lifecycle ledger，切换 Mod 后自动释放。

### 2.2 Status snapshot

至少包含：

```ts
interface StatusPresenterSnapshot {
  mood: {
    id: string;
    label: string;
    hue: number;
    aura: number;
  };
  activity: {
    id: string | null;
    text: string;
    arc?: string | null;
  } | null;
  presence: {
    id: string;
    active: boolean;
  };
  telemetry: {
    breath: number;
    gazeLock: number;
    moodAura: number;
    rhythm: number;
    source: 'sensor' | 'derived';
    sensorAvailable: boolean;
    sensorStaleSeconds?: number;
  };
  timeline: Array<{
    mood: string;
    hue: number;
    aura: number;
    sampledAt: number;
  }>;
  errors: {
    mood: string | null;
    activity: string | null;
    sensor: string | null;
  };
  updatedAt: number;
}
```

精确字段可按现有 API 类型调整，但必须保留 source、availability、error 与 timestamp，不能把失败
伪装成 0 或默认值。ring buffer 每格必须带 `sampledAt`，避免跨 WebView 或暂停恢复后只能猜时间。

把 telemetry 计算拆成纯函数并单测；React hook 只负责订阅 controller。MOOD_AURA_BASE、mood 映射和
sensor/derived 两条算法只能有一份权威实现。

### 2.3 Flow / Garden / Diary snapshot

本单不能只修 Status 后留下另三套组件私有数据。按实际现状提供最低完整度：

- **Flow**：NOW narrative、mood/focus/presence tags、tool status、按角色隔离的 8 小时 timeline、
  loading/error/source；timeline 写入仍只有一个 owner。
- **Garden**：当前 garden state、花/阶段/进度等现有展示字段、loading/error/lastUpdated、现有刷新动作。
- **Diary**：角色列表、当前角色、条目轻量元数据、loading/error/selection，以及调用现有独立详情窗口的
  `openEntry(entryId)` command。Presenter 不暴露文件路径或绕过现有后端接口。

字段以各 `Sub*` 的真实调用链为准，不脑补后端不存在的数据。无法本单迁出的字段必须记录到
`docs/known-issues.md`，不能在文档中宣称该 presenter 完整。

## 3. 官方渲染器的视觉自由度

Presenter 解决“完全重画”；官方组件还需要一条稳定的轻量换皮路径。

### 3.1 语义钩子

移除决定主要结构/视觉的匿名 inline style，或把它们下沉到稳定 class。至少提供：

```text
[data-sidebar-capability="status"]
[data-status-region="mood"]
[data-status-region="activity"]
[data-status-region="presence"]
[data-status-region="telemetry"]
[data-status-region="timeline"]
[data-status-element="mood-glow"]
[data-status-element="mood-indicator"]
```

Flow/Garden/Diary 同样使用 `data-<capability>-region`，region 名写入 `docs/design-mods.md` 后视为作者
契约。不要暴露依赖 DOM 层级的 `nth-child` 配方。

### 3.2 动态 CSS 变量

动态计算值写到 capability root：

```text
--status-mood-hue
--status-aura
--status-breath
--status-gaze-lock
--status-rhythm
--status-indicator-size
--status-glow-x
--status-glow-y
```

官方 CSS 用这些变量渲染当前样式；theme/design CSS 可以改布局、形状、位置和动画。动态业务值只由
presenter 写，Mod 可以在自己的作用域覆盖视觉变量，但不能回写 StateEngine。

不要强制所有设计继续使用 forest 色系。官方 fallback 可以保留深绿，但自定义 CSS 或 presenter
renderer 必须能做透明、亮色、单色、Canvas 或完全无卡片结构。

## 4. Region 与 Component Catalog

不要把 component catalog 扩成细碎 DOM 清单。只为“保留官方交互和内部状态仍有价值”的大 region
增加 portal capability；纯展示优先由 presenter 重画。

实施前只读审计四个面板并冻结第一批 region。最低要求：

- Status：完整面板保留；内部区域主要通过 presenter + semantic hooks 开放，不强制拆 portal。
- Flow：NOW 与 timeline 若各自包含有价值的交互/局部状态，可注册为两个 singleton region。
- Garden：花园主可视区域和摘要/控制区按真实组件边界拆分。
- Diary：角色选择与条目列表可以作为独立 region；打开详情仍走 host command。

命名统一为 `chat.sidebar.<capability>.<region>`。每个新增 id 都要进入 descriptor、最小尺寸、singleton、
suspend policy、文档与重复 attach 测试。父 capability 与其子 region 不能同时 attach；registry 必须返回
明确的 ownership conflict，而不是渲染两份组件。

## 5. Design Host 扩展

`TrustedDesignHost` 增加：

```ts
host.presenters.status
host.presenters.flow
host.presenters.garden
host.presenters.diary
```

要求：

- Presenter snapshot 是 structured-clone friendly；不得包含 HTMLElement、ReactNode、函数或 API token。
- Commands 与 snapshot 分离，便于下一张 Native Satellite 工单跨 WebView 转发。
- Presenter 有 schema/version；新增字段向后兼容，删除/改义需要升级版本。
- diagnostics 显示每个 presenter 的 consumer count、polling/timer active 状态与 lastUpdated。
- 54 中的 `chat.session.elapsedMs` 增加 ticker 或明确的 `host.clock` rAF 读取契约；诊断样架在无新消息时
  也必须持续更新基于会话时间的装饰。
- `nativeWindow` store 在移动结束后必须归零 `moving/velocity`，不能永久停留在最后一帧速度。

## 6. 非美术验收样架

扩展或新增 presenter fixture，只证明自由度，不制作正式设计：

1. 不挂载 `chat.sidebar.status` 官方组件，仅用 `host.presenters.status` 重画一套非 forest、非矩形的
   status UI。
2. mood、presence、telemetry、timeline 和 error/retry 全部可见且来自 presenter；不 query/clone
   `SubStatus` DOM。
3. 同一运行期再切换为官方 Status capability，数据、ring buffer 和 polling owner 连续，不重新从零
   开始，也不增加请求频率。
4. 用 CSS semantic hooks 把官方 MOOD 卡的 glow 移到另一个角、改为非圆形 indicator，证明无需
   `!important` 覆盖匿名 inline style。
5. Flow/Garden/Diary 至少各用一次 snapshot；Diary `openEntry` 仍打开现有独立详情窗口。
6. 停用 Mod 后 consumer ledger、interval 和 presenter subscription 回到基线。

## 7. 测试与验收

### 7.1 纯逻辑测试

- Status sensor/derived telemetry 的所有分支、clamp、stale 与 source。
- ring buffer 采样、暂停、恢复、容量和 timestamp。
- presenter acquire/release 引用计数、幂等 dispose 和最后消费者释放后停止 timer。
- 官方组件 + Mod 同时消费时仍只有一个 owner。
- error 与 retry command，不把失败归零。
- Flow timeline 去重、角色隔离与 8 小时清理。
- Garden/Diary loading/error/empty 明确区分。
- parent/child component attach ownership conflict。
- session ticker 与 native motion settle。

### 7.2 调用链回归

- 默认 UI 的 Status/Flow/Garden/Diary 外观与功能保持现状。
- Sidebar tab 切换、设计 Mod 切换、covered/paused、角色切换均不产生重复请求或 interval。
- StateEngine 仍是 mood/activity/presence 唯一真值；presenter 全部只读。
- Diary 详情窗口、Garden API、sensor Tauri command、tool status overlay 沿用原调用链。
- 现有 `chat.sidebar.*` 顶层 component id 兼容，不强迫旧 Design Mod 修改。

### 7.3 真实窗口

在 800x600、宽桌面、窄窗口验证官方和自定义 presenter renderer；连续切换 tab/Mod 20 次，观察
diagnostics 中 presenter consumer、polling、interval 不递增。Status 自定义 renderer 必须能完全避开
深绿卡片和右上圆点，证明自由来自 contract，不是 DOM hack。

## 8. 文档与三面闭环

同步更新：

- `ARCHITECTURE.md`
- `docs/frontend-structure.md`
- `docs/design-mods.md`
- `docs/ui-mods.md`（说明主题 token 与 presenter renderer 的边界）
- `docs/known-issues.md`（关闭已完成项，记录未迁 presenter）

本单不新增 Tauri command 或后端 endpoint，按计划无需修改 `docs/backend-integration.md`；若实际迁移
改变 IPC/API 形状，则必须同步文档并更新三仓接口总账。

三面检查：

- 后端管理面：没有新配置/状态/trace；Presenter 只解释现有桌面展示数据。
- 桌面与手机：Presenter 是桌面本地 UI contract，不给手机增加伪入口；设置面保留当前 Design Mod
  选择和诊断。
- 原调用链：逐项核对 sensor、garden、diary、StateEngine、tool status、polling cadence、pause 和 retry，
  确认 controller 上移没有复制 owner。

## 9. 不在范围内

- 不制作最终状态卡、花朵、HUD、红线或透视美术。
- 不把后端原始响应、聊天正文或 sensor 原始隐私字段无条件暴露给 Mod。
- 不允许 Presenter 写 StateEngine 或直接请求后端。
- 不把每个 span、label、进度条都注册成 component id。
- 不实现跨 Tauri 原生窗口；由 cc-tasks/56 承接。

## 10. 验证命令

执行构建和真实窗口验证前先读相邻 `Emerald-presence/docs/dev-environment.md`，然后运行：

```bash
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run check:naming
cd src-tauri
cargo check
```

最后执行 `git diff --check`。本单应在 Status presenter 闭环后先形成小提交，再继续 Flow/Garden/Diary，
不要把四个面板压成一次无法定位回归的大提交。
