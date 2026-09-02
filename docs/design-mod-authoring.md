# Design Mod 作者说明书

> 本文是创建、修改和审查可信 Design Mod 的施工入口。运行时内部结构与历史约束见
> `docs/design-mods.md`；可运行示例见 `public/design-mods/freeform-capability-fixture/`。
> 若本文与代码不一致，以 `src/shared/design-mod/contract.ts`、`types.ts` 和
> `src/windows/chat/components/DesignModHost.tsx` 为准，并在同一改动中修正文档。

## 1. 先选正确的扩展层

| 需求 | 使用 |
|---|---|
| 只改颜色、字体、背景、现有组件外观 | Theme Mod，见 `docs/ui-mods.md` |
| 只重排 Ribbon / Sidebar / Main 固定槽位 | Layout Mod，见 `docs/layout-mods.md` |
| 拆散官方能力、自绘数据、自由定位、边缘装饰、窗口外 Halo/Island | Design Mod（本文） |

编写 Design Mod 中可选的 `layout` 时，注意不要把 `mainLayout: "hud"` 当作普通聊天布局：在宽窗口或全屏下它会将聊天记录与发送栏分成左右两列。需要记录和发送栏上下排列时使用 `stack`；窄窗口低于 760px 的自动回退不能替代这个选择。

Design Mod 是**可信本地代码**，不是插件沙箱。它可以执行 DOM/Canvas/WebGL 代码，但不得自行建立
后端 HTTP、WebSocket、第二份 StateEngine 或 Tauri window owner。业务数据来自 `host.signals` 和
`host.presenters`；业务动作来自 `host.commands`、presenter commands 或 satellite 命令白名单。

## 2. 最短开工路径

1. 复制 `public/design-mods/freeform-capability-fixture/` 到新的单级目录。
2. 修改 `mod.json` 的 `id`、`name`、`author`、`version`，保证目录名与 `id` 一致。
3. 将入口及依赖打包为单文件 ESM `entry.js`，只导出 `activate(host, context?)`。
4. 先决定每个 Sidebar 能力的 composition mode，再 attach 官方 renderer 或订阅 presenter。
5. 所有 listener、timer、observer、asset URL 和自建节点都进入返回的幂等 disposer。
6. 在「偏好 → 界面 → Design Mod」选择新 Mod；失败时查看同页 diagnostics。

开发根固定为 `public/design-mods/<id>/`。release 只读取 Tauri `resource_dir/design-mods/<id>/`，不会
回退到 `public/`。不要向源码或文档写盘符绝对路径。

## 3. 包与 Manifest

```text
public/design-mods/<id>/
├── mod.json
├── entry.js
├── style.css                 # 可选
├── assets/                   # 可选；图片、字体、纹理、shader
├── theme/                    # 可选；内含 Theme Mod
├── layout/                   # 可选；内含 Layout Mod
└── surfaces/                 # 可选；schemaVersion 2 native surface
    ├── halo.js
    ├── halo.css
    ├── island.js
    └── island.css
```

最小 manifest：

```json
{
  "schemaVersion": 2,
  "id": "my-design",
  "name": "My Design",
  "author": "Author",
  "version": "0.1.0",
  "entry": "entry.js",
  "style": "style.css"
}
```

路径必须是包内 `/` 分隔的相对路径，禁止绝对路径、`..`、反斜杠和跨包资源。`entry` 必须是 `.js`；
运行时入口不能含裸 `import` 或动态 `import()`，依赖必须预先打包。

### Native surface manifest

```json
{
  "id": "right-island",
  "kind": "island",
  "entry": "surfaces/island.js",
  "style": "surfaces/island.css",
  "pointerMode": "interactive",
  "zOrder": "owned",
  "anchor": "main.right",
  "offset": { "x": 18, "y": 0 },
  "size": { "width": 236, "height": 164 },
  "visualBleed": 24,
  "contentInset": { "top": 4, "right": 4, "bottom": 4, "left": 4 },
  "requires": ["navigation", "presenters"]
}
```

| 字段 | 契约 |
|---|---|
| `kind` | `halo` 或 `island` |
| `pointerMode` | Halo 必须 `passthrough`；Island 可用 `interactive` |
| `zOrder` | `owned` 或显式 `always-on-top` |
| `anchor` | Island 必填：`main.top/right/bottom/left`；Halo 禁止设置 |
| `size` / `offset` | logical/CSS px；Rust 按当前 DPI 转为物理 px |
| `visualBleed` | 外扩透明窗口，不属于内容矩形；数字或四边非负数 |
| `contentInset` | 从未外扩的内容矩形向内缩；数字或四边非负数 |
| `margin` | 旧包兼容别名；新包使用 `visualBleed` |
| `requires` | 能力门控；未知或不可用能力会阻止整个 Mod 激活 |

`contentRect` 永远不含 `visualBleed`。DOM 无法越过主 WebView 物理边界；需要越窗时必须声明 native surface。
若只是做贴边、悬浮或“像要越界”的视觉错觉，请使用主 WebView 的
`host.layers.underlay/components/overlay`、`host.scene` 和 `host.edges`，不需要声明 native
surface。Native satellite 的平台状态由宿主报告：Windows 为 `supported`，macOS/Linux 为
`experimental`（尚无真人窗口验收），其他平台为 `unavailable`；不要把真实越窗效果当成跨平台
默认能力。

## 4. 主窗口入口与生命周期

```js
export async function activate(host, context) {
  if (host.version !== 2 || host.surface !== 'main') throw new Error('Host API v2 required');
  const cleanups = [];
  const add = cleanup => { cleanups.push(cleanup); return cleanup; };

  // 创建节点、attach、subscribe、acquire……

  context?.signal.addEventListener('abort', () => {}, { once: true });
  return () => cleanups.splice(0).reverse().forEach(cleanup => cleanup());
}
```

`host.trust` 当前为 `trusted-local-code`。`context` 含递增 `generation` 与 `AbortSignal`；每个异步
await 后都应检查 `context.signal.aborted`。返回 disposer 必须可重复调用。宿主会兜底回收通过 Host API
登记的 portal、订阅、Scene node 和 asset Blob URL，但 Mod 自建的 timer、observer、canvas loop 和 DOM
listener 仍必须自行释放。

## 5. Host API v2 快查

| API | 用途与所有权 |
|---|---|
| `host.root` | 主舞台根，只读引用 |
| `host.layers.underlay/components/overlay` | 三层固定 viewport 容器 |
| `host.components` | 挂载宿主官方 React renderer |
| `host.presenters.status/flow/garden/diary` | 读取稳定快照、订阅、命令 |
| `host.signals` | 读取宿主状态镜像，不可写回 |
| `host.scene` | 自由节点的统一定位、transform 与 rAF owner |
| `host.geometry` / `host.edges` | 官方 mount 的矩形与有方向边缘 |
| `host.transforms` | 不使用 Scene node 时的单一 transform controller |
| `host.commands` | 主窗口白名单动作 |
| `host.surfaces` | native surface 诊断/生命周期；普通 Mod 不自行创建窗口 |
| `host.assets.url(path)` | 获取 `assets/` 内资源 URL |
| `host.diagnostics.add(message)` | 向 Design Mod diagnostics 写一条状态 |

### Components 与 composition mode

先调用：

```js
host.components.setComposition('flow', 'subregions');
host.components.setComposition('garden', 'official-renderer');
host.components.setComposition('status', 'presenter-only');
```

| mode | 允许行为 |
|---|---|
| `official-renderer` | 只 attach 父能力，如 `chat.sidebar.garden` |
| `subregions` | 只 attach 语义子区域，可分散到不同 Scene node |
| `presenter-only` | 不 attach 官方 renderer，完全消费 presenter 自绘 |

父能力与其子区域不能同时 attach；每个 component id 是 singleton。`attach(id, mount)` 将真实 React
能力 portal 到 mount；`detach(id)` 释放它；`list()` 返回当前所有权。不要复制官方 DOM 或 import React 组件。

稳定 renderer id：

| 区域 | id |
|---|---|
| Chat | `chat.ribbon`、`chat.header`、`chat.transcript`、`chat.composer` |
| Status | `chat.sidebar.status`、`.mood`、`.activity`、`.timeline` |
| Flow | `chat.sidebar.flow`、`.now`、`.timeline` |
| Garden | `chat.sidebar.garden`、`.visual`、`.summary`、`.controls` |
| Diary | `chat.sidebar.diary`、`.identity`、`.entries` |

`chat.sidebar.diary.characters` 只是旧 schema v2 兼容别名，新 Mod 禁止使用。Diary 只表示当前激活角色；
角色管理属于 Preferences。

Status 的三个子 id 已进入 v2 contract/registry，内置官方 renderer 现在为三者都提供
`DesignAwareRegion` portal。官方 DOM 归属固定为：`mood` 只包含 mood 卡和
`mood-glow` / `mood-indicator`；`activity` 包含 activity 与 presence；`timeline` 包含
telemetry 与 mood timeline。根级错误 / 重试条属于父 `chat.sidebar.status`，不属于任何
子区。子区未 attach 时只在官方 React fallback 中保留；active Mod 的默认 shell 会隐藏，
所以 `subregions` Mod 应 attach 或自绘所有需要显示的子区。

### Status renderer hooks

官方 `SubStatus` 提供 `data-status-element="mood-glow|mood-indicator"`，以及
`--status-mood-hue`、`--status-aura`、`--status-breath`、`--status-gaze-lock`、
`--status-rhythm`、`--status-indicator-size`、`--status-glow-x`、`--status-glow-y`。
这些变量由官方 renderer 以 inline style 同时写在 Status root 和每个官方子区的 portal 根上。
它们是 mount-local scoped hooks，不是全局 CSS token；自定义 renderer 仍应从
`host.presenters.status.get()` 读取 `mood.hue`、`telemetry.moodAura`、`telemetry.breath` 等
值并自行设置样式，不要依赖其他节点上的变量或 hooks。作者可以参考官方 renderer 的纯映射
规则，但 `src/shared/design-mod/statusRendererContract.ts` 是仓库内部实现，不是 Mod 的公开
import API；entry 必须把需要的逻辑预先打包进自己的单文件，且不得复制 StateEngine 或 sensor 真值。

三种 composition 的固定行为：

- `official-renderer`：只 attach `chat.sidebar.status`，官方父 renderer portal 整块 Status。
- `subregions`：只 attach `.mood`、`.activity`、`.timeline`，每个 mount 只得到对应边界。
- `presenter-only`：不 attach Status id，Mod 从 `host.presenters.status` 自绘完整内容和错误态。

注册表拒绝父子同时 ownership；切换时旧 portal 先由 disposer 清理，避免默认布局、Mod layer
和快速切换产生重复 renderer。

### Presenters

每个 presenter 提供：

```js
const release = host.presenters.garden.acquire('main-garden');
const unsubscribe = host.presenters.garden.subscribe(() => render(host.presenters.garden.get()));
const unselect = host.presenters.garden.select(
  snapshot => snapshot.garden?.stage,
  () => renderStage(host.presenters.garden.get()),
);
host.presenters.garden.commands.refresh();
```

`acquire(consumerId)` 表示真实消费者存在并驱动共享 polling；隐藏/删除消费者时必须 release。`select` 用于
避免无关字段变化触发重绘。Mod 不应调用 presenter 的诊断/暂停方法控制宿主生命周期。

| presenter | 主要字段 | 正式命令 |
|---|---|---|
| `status` | `mood/activity/presence/telemetry/timeline/errors/updatedAt` | `retryMood/Activity/Sensor` |
| `flow` | `narrative/mood/focus/presence/toolStatus/timeline/loading/error/characterId` | `refresh` |
| `garden` | `garden/loading/error/lastUpdated/source` | `refresh` |
| `diary` | `activeCharacterId/entries/loading/error/selectedEntryId/lastUpdated` | `refresh/openEntry` |

Diary snapshot 中的 `characters` 和 `selectCharacter` 仅为旧 Mod 兼容，不应出现在新设计中。

### Signals

所有 signal 都是 `{ get(), subscribe(listener) }`：

| signal | 快照 |
|---|---|
| `state` | StateEngine mood/activity/focus/presence 镜像 |
| `chat` | `startedAt/elapsedMs/sessionEntryCount/turnCount/historyEntryCount/typing/loading` |
| `navigation` | 当前空间、Sidebar tab 与可见性 |
| `theme` | theme id、日夜槽、当前 token |
| `viewport` | `width/height/devicePixelRatio/visible/covered/paused` |
| `pointer` | viewport `x/y/buttons/pressed/dragging/updatedAt` |
| `nativeWindow` | 物理位置、CSS delta、velocity、moving、updatedAt |

订阅回调不携带快照；回调内重新 `get()`。`viewport.paused` 为 true 时停止非必要动画，不另开后台 ticker。

### Scene、geometry 与 edge

```js
const element = document.createElement('section');
const node = host.scene.create(element, {
  id: 'garden-summary',
  sourcePrimitive: 'chat.sidebar.garden.summary',
  layer: 'components',
  anchor: { kind: 'viewport', x: 0.5, y: 0.1 },
  basePosition: { x: -100, y: 0 },
  size: { width: 200, height: 80 },
  visualTransform: 'perspective(720px) rotateY(-4deg)',
  zIndex: 4,
  pointerMode: 'auto'
});
host.components.attach('chat.sidebar.garden.summary', element);
```

Anchor 支持 viewport 比例、component 比例和 `{ kind: 'path', points, progress }`。拖拽使用
`node.beginDrag()`、`moveDrag({x,y})`、`endDrag()`；运动/物理只写 `setMotionOffset` / `setPhysicsOffset`。
不要同时写 `left/top/translate/transform`。`node.dispose()` 会释放 pointer capture、DOM、transform 和空闲 rAF，
之后同 id 可重建。

`host.geometry.get/observe/flush` 返回 `{ rect, visible, version }`。`host.edges.get('page' | componentId)` 与
`observeEdge` 返回 rect、四条有方向边、外法线、corner、DPR 和 version；geometry 未变化时不会重复通知，
covered/hidden 时暂停。大量边缘装饰用一个有上限的 Canvas controller，不为每个像素创建永久 DOM/rAF。

### 主窗口命令与资源

`host.commands` 正式提供 `closeSidebar()`、`setSidebarTab(tab)`、`openPreferences()`、
`restoreDefaultDesign()`。不要从 Mod 直接 `invoke()` Tauri command。

`host.assets.url('texture.png')` 返回 `Promise<string>`；路径自动限定在本包 `assets/`。宿主会回收返回的
Blob URL，Mod 仍应移除使用该 URL 的节点。

## 6. Native satellite Host API

Surface entry 同样只导出 `activate(host)`，但拿到的是独立的 Satellite Host v1：

```js
export function activate(host) {
  const node = document.createElement('button');
  host.layers.components.appendChild(node);
  const render = () => {
    const snapshot = host.snapshot.get();
    node.hidden = !snapshot;
  };
  const unsubscribe = host.snapshot.subscribe(render);
  node.onclick = () => void host.commands.request('openPreferences');
  render();
  return () => { unsubscribe(); node.remove(); };
}
```

Satellite Host 提供 `surfaceId`、`generation`、三层 DOM、`snapshot.get/subscribe`、
`commands.request(name, params?)` 和异步 `assets.url(path)`。snapshot 最多 20 Hz，含 sequence/generation、
surface bounds/contentRect、主窗口状态、pointer、`nativeWindow` 的位置/位移/速度、theme、裁剪后的
state/chat/navigation、Status/Flow presenter 及 screen-space anchors。必须丢弃对高频逐帧 IPC 的假设；本地动画在 surface 内完成。

命令白名单：`closeSidebar`、`setSidebarTab {tab}`、`openPreferences`、`restoreDefaultDesign`、
`retryMood`、`retryActivity`、`retrySensor`、`refreshFlow`、`refreshGarden`、`refreshDiary`、
`openDiaryEntry {entryId}`。`selectDiaryCharacter` 仅兼容旧包，新 Mod 禁止使用。请求有 3 秒超时和 generation ack。

## 7. 性能、交互和清理红线

- 一个 Scene 一个按需 scheduler；不要每个节点常驻 rAF。
- native snapshot 前台上限 20 Hz，后台 0 Hz；不要轮询 Tauri window geometry。
- pointer 只由 interactive mount/Scene node/Island 接管；Halo 必须 click-through。
- 不复制 mood/activity/presence 真值，不写回 presenter snapshot。
- 不在组件中写死新的用户可见文案；产品文案走 `src/shared/i18n/`。Mod 自有名称仍写 manifest。
- 不依赖矩形外透明 glow 掩饰 bleed；透明像素应保持接近零 alpha。
- disposer 清理 listener、timer、rAF、ResizeObserver、pointer capture、DOM、Canvas/WebGL 资源和 Blob URL。

## 8. 验收清单

自动检查：

```powershell
npm.cmd test -- --run
npx.cmd tsc --noEmit
npm.cmd run build
Set-Location src-tauri
cargo test
cargo check
```

同时执行 `git diff --check`。涉及真实视觉或 native surface 时，还必须在 Windows debug 检查：宽/窄窗口、
100%/125%/175% DPI、双屏负坐标、拖动与主窗口同时运动、hide/restore、Mod A→B→builtin、20 次切换、
Halo click-through、Island command ack 和恢复默认后 surface 数量归零。未完成的项目写入
`docs/known-issues.md` 并保持 `partial/open`，不能用 build 代替实窗验收。

## 9. 修改契约时必须同步

| 改动 | 同步位置 |
|---|---|
| manifest/component/presenter/Host API | 本文、`docs/design-mods.md`、相关测试、fixture |
| Tauri command/event/native snapshot | `docs/backend-integration.md`、Rust/TS contract tests |
| 窗口结构或状态流 | `ARCHITECTURE.md`、`docs/frontend-structure.md` |
| 未完成验收或新缺口 | `docs/known-issues.md` |

后端管理面和手机端默认不新增 Design Mod 设置；若引入后端配置、跨端状态或新接口，必须重新执行三面闭环，
不能把本地作者 API 扩展误写成跨端能力。
