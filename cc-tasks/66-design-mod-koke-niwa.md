# 苔庭（koke-niwa）Design Mod 施工单

> 状态：proposal（尚未动工）。动工后各分期的未完成验收项须同步 `docs/known-issues.md`。
> 上游契约以 `docs/design-mod-authoring.md` 为准；本文不重复契约，只记录设计决策与施工规格。
> 视觉灵感参考 PlantStudio（GPLv3+，https://github.com/pdfernhout/PlantStudio）的参数化植物
> 生长思想；**只借鉴算法思想，不复制其任何代码**，像素植物引擎为本仓自研 TypeScript 实现。

## 1. 概念与气质

- **一句话**：主窗口是一座夜里的苔庭。对话是庭中汀步，Sidebar 四种能力是庭园景物，
  陪伴时长化作沿窗缘真实生长的像素苔藓。
- **气质关键词**：幽玄、安静、有生命体征；粗粝像素 × 细宋排版的反差是记忆点。
- **像素尺度决议**：大颗粒像素。**1 像素单元 = 3 CSS px**（下文记作 `PX=3`），
  所有自绘 Canvas 关闭 `imageSmoothingEnabled`，所有像素坐标按 3px 网格量化。
- **不做的事**：不使用 SVG 矢量藤蔓/曲线装饰；不复制 PlantStudio 代码；不新建
  WS/HTTP/StateEngine；不让 Mod 成为唯一设置入口。

## 2. 包结构

```text
public/design-mods/koke-niwa/
├── mod.json            # schemaVersion 2，见 §9 manifest 草案
├── entry.js            # 打包后单文件 ESM，只导出 activate(host, context)
├── style.css           # Mod 舞台与自绘节点样式
├── assets/
│   ├── washi.png       # 和纸纤维纹理（underlay 平铺）
│   └── lantern.png     # 石灯笼线稿（可选，优先 Canvas 自绘）
├── theme/
│   └── theme.json      # 苔庭色板，见 §3
├── layout/
│   └── layout.json     # 默认收起 Sidebar，见 §4
└── surfaces/
    ├── halo.js / halo.css      # 越窗落叶与流萤，passthrough
    └── island.js / island.css  # 风铃 Island，interactive
```

开发期源码可放 `src/design-mods/koke-niwa/`（自拟，打包脚本输出单文件 `entry.js` 到
`public/design-mods/koke-niwa/`）；具体打包方式在 M1 动工时确定，要求输出无裸 import。

## 3. 色板与字体（theme/theme.json）

`base: "dark"`，颜色一律 `oklch()`。必填 CORE / GAME / SHAPE 组全集按
`src/shared/theme/contract.ts` 填齐，下表只列关键取值意图：

| token | 取值意图 | 角色 |
|---|---|---|
| `--paper` | `oklch(0.16 0.020 150)` | 夜墨绿底，接近黑 |
| `--paper-2` 等表面 | 同色相逐级 +0.03 L | 卡片=庭中石板 |
| `--ink` | `oklch(0.88 0.020 120)` | 宣纸白正文 |
| `--ink-soft` | 降 L 至 0.62 左右 | 次要文字 |
| `--forest` | `oklch(0.42 0.060 150)` | 苔绿主色面 |
| `--accent` | `oklch(0.78 0.120 90)` | 萤火金 / 灯笼暖光 |
| `--danger` | 朱红 `oklch(0.58 0.16 40)` | 印章红兼错误态 |
| `--radius-*` | 偏小（2~4px） | 直线条、纸本气质 |
| `--font-serif` | 细宋/明朝体系 | 标题与短冊竖排 |
| `--font-sans` | 现代无衬线 | 正文与输入 |

**像素调色板（自绘 Canvas 专用，写死在引擎内，非 theme token）**：

- 苔绿 4 阶：`#1d3320 / #2e4f2c / #4a7a3a / #6fa352`
- 石色 2 阶：`#3a3f3b / #565c55`
- 花色 2 种：苔花白 `#e8e4d0`、杜若紫 `#7a6a9e`
- 灯光：`#f2c46d`（暖）随 mood hue 偏移

**风险**：moodReactive 开启时会偏移 `--accent`/`--forest`，苔庭的自绘像素色不走 token，
不受影响；但官方子区 renderer 的气泡色会漂。M2 验收时需在 moodReactive 开/关两态各看一遍。

## 4. 布局（layout/layout.json）

```json
{
  "id": "koke-niwa",
  "name": "苔庭",
  "author": "PresenceKit",
  "version": "0.1.0",
  "direction": "row",
  "slots": {
    "ribbon": { "order": 0, "size": 52 },
    "main": { "order": 1 },
    "sidebar": { "order": 2, "size": 280, "hidden": true }
  }
}
```

理由：Sidebar 四能力全部拆上舞台后，默认收起官方 Sidebar 避免双份信息；用户手动展开时
官方 fallback 仍可用（subregions 被 Mod 占有的 tab 会空，这是 composition 契约的预期行为，
在偏好说明文案层面不做额外承诺）。`mainLayout` 保持 `stack`，消息流即汀步，不做模板重排。

## 5. 逐能力 composition 决策

| 能力 | mode | attach 的 id | 呈现物 |
|---|---|---|---|
| status | `subregions` | `.mood` / `.activity` / `.timeline` | 石灯笼 / 青苔席 / 水文卷物 |
| flow | `subregions` | `.now` / `.timeline` | 短冊（竖排诗笺）/ 曲水带 |
| garden | `subregions` | `.visual` / `.summary` / `.controls` | 石组主株座 / 木札 / 手水钵 |
| diary | `subregions` | `.identity` / `.entries` | 署名印 / 信笺匣 |

决策理由：

- 全部 `subregions`、零 `presenter-only`：官方子区 DOM 保留，Mod 只做 Scene 摆位 +
  外壳装饰 + 自绘增量（苔、花、灯、雾），工作量与回归面最小。
- **代价与义务**（契约规定）：根级错误/重试条只属于父 renderer，subregions 模式下
  官方错误条不会出现。Mod 必须从 `host.presenters.status.get().errors`（flow/garden/diary
  同理）读取错误态并自绘呈现——设计为「灯笼熄灯 + 朱红小木牌」，点击木牌调用
  `retryMood` / `retryActivity` / `retrySensor` / `refresh*`。这是硬性验收项。
- mood 的呼吸/色相：自绘灯笼光晕读 `host.presenters.status.get()` 的
  `mood.hue`、`telemetry.moodAura`、`telemetry.breath`、`telemetry.moodRhythm`，
  不读取其他节点上的 `--status-*` 变量（契约禁止顺手读 hooks）。

## 6. Scene 布局（初始坐标，M2 实窗调优）

viewport 比例锚点，`PX=3` 网格吸附（坐标实际落点量化到 12px 倍数，保持像素对齐）：

```text
┌──────────────────────────────────────────────────────────┐
│   [署名印            [短冊 flow.now]             [木札    │
│    diary.identity]    竖排                      garden.  │
│  [石灯笼                                          summary]│
│   status.mood]                                  [石组+主株│
│                                              garden.visual]│
│   [青苔席                                     [手水钵     │
│    status.activity]                            garden.ctrl]│
│        [信笺匣 diary.entries]   [曲水带 flow.timeline]    │
│   [水文卷物 status.timeline]                              │
└──────────────────────────────────────────────────────────┘
```

| Scene node id | sourcePrimitive | anchor (viewport) | size (px) | visualTransform |
|---|---|---|---|---|
| `lantern` | status.mood | (0.14, 0.28) | 220×150 | 无（正对，灯要稳） |
| `moss-mat` | status.activity | (0.14, 0.60) | 264×108 | `rotate(-0.6deg)` |
| `sutra-scroll` | status.timeline | (0.16, 0.88) | 264×190 | `rotate(0.5deg)` |
| `tanzaku` | flow.now | (0.50, 0.06) | 120×230 | 无，竖排 |
| `stream` | flow.timeline | (0.50, 0.93) | 420×110 | 无 |
| `seal` | diary.identity | (0.30, 0.10) | 150×64 | `rotate(-1.5deg)` |
| `letter-box` | diary.entries | (0.33, 0.70) | 250×170 | `perspective(720px) rotateY(2deg)` |
| `stone-group` | garden.visual | (0.85, 0.50) | 220×240 | 无（主株要正） |
| `tag` | garden.summary | (0.85, 0.22) | 190×84 | `rotate(2deg)` |
| `basin` | garden.controls | (0.86, 0.82) | 190×90 | 无 |

全部 `layer: 'components'`、`pointerMode: 'auto'`，拖拽走 fixture 同款的
`beginDrag/moveDrag/endDrag` 统一 transform。zIndex：主株与灯笼 5，其余 3~4。
窄窗口（<900px）降级方案：M2 实窗验收时定，预案是隐藏 `stream`/`letter-box`，
由 Island 与系统 overlay 保底入口。

## 7. 像素植物引擎（自研，PlantStudio 思想 2D 简化版）

引擎是 entry.js 内的纯函数模块，单 `requestAnimationFrame` 由 `host.scene` 统一调度，
`viewport.paused` 时停帧。

### 7.1 参数模型（灵感来源，非代码移植）

```ts
type PlantParams = {
  internode: number;      // 节间长度（像素单元数）
  branchAngle: number;    // 分枝角（量化到 45° 的 8 方向）
  branchChance: number;   // 每节分枝概率
  leafScale: number;      // 叶片像素尺寸
  petalCount: number;     // 花瓣数 5~8，辐射对称
  petalLen: number;
  stem: string; leaf: string; bloom: string;  // 取自 §3 像素调色板
  maxTicks: number;       // 生长总步数（决定最终体量）
  seed: number;           // 确定性随机，同一 growth 状态重绘结果一致
};
```

生长规则：像素网格上的量化 turtle——每 tick 前进 1 单元，方向 ∈ 8 向，按
`branchChance` 分叉，到达 `maxTicks` 在顶端开一朵 `petalCount` 瓣像素花。
渲染 = 往离屏 Canvas `fillRect(x*PX, y*PX, PX, PX)`，主 Canvas 用
`drawImage` + 关闭平滑放大贴出。

### 7.2 三个尺度

| 尺度 | 位置 | 体量 | 驱动源 |
|---|---|---|---|
| 缘苔（1D 蔓延） | edge Canvas，§8 | 单格苔点/小叶芽 | `chat.sessionEntryCount` + 会话时长 |
| 角花（单朵） | 组件 corner、木札旁 | 12~24px | garden stage 推进、新日记 entry |
| 主株（完整植株） | `stone-group` 节点内联 Canvas | ≤96×96 单元 | `garden.stage/progress` 映射 maxTicks |

确定性要求：同一 (seed, ticks) 必须渲染同一株，避免重绘闪变；growth 只增不减
（切换 Mod 由 disposer 全清，属预期）。

## 8. Edge 苔藓生长规格

- **几何**：`host.edges.observeEdge('page', …)` + 对 `lantern`、`stone-group`、
  `tanzaku` 三个关键节点 `observeEdge`，拿有向边、外法线、corner。
- **画布**：一块 overlay 层 Canvas 全 viewport（fixture 同款 DPR 处理），
  一个 controller，上限 `cap = 512` 个苔格。
- **生长前沿**：每条边维护游标（已蔓延单元数）。驱动公式
  `target = clamp(sessionEntryCount * 4 + floor(elapsedMs / 30000), prev, cap)`，
  只在订阅回调里步进，不常驻 rAF。
- **元胞规则**（每格一次掷骰）：65% 苔点（2 阶绿随机）、20% 留白、10% 小叶芽
  （沿外法线方向探出 1~2 格）、5% 蓄蕾标记——蓄蕾格在 garden stage 变化时开花。
- **角花**：corner 坐标直接由 edges 提供，stage 推进时在最近的蓄蕾格/corner
  生成一朵 7.1 参数花，花色按角色轮换（苔花白 ↔ 杜若紫）。
- fixture 已验证 `fillRect` 沿边打点路径可行，本规格只是把随机点换成有状态的
  元胞自动机，复杂度同阶。

## 9. Native surface 草案（M4，第二阶段）

```jsonc
// mod.json 关键字段
{
  "schemaVersion": 2,
  "id": "koke-niwa",
  "name": "苔庭",
  "author": "PresenceKit",
  "version": "0.1.0",
  "entry": "entry.js",
  "style": "style.css",
  "theme": "theme/theme.json",
  "layout": "layout/layout.json",
  "nativeSurfaces": [
    {
      "id": "halo", "kind": "halo",
      "entry": "surfaces/halo.js", "style": "surfaces/halo.css",
      "pointerMode": "passthrough", "zOrder": "owned",
      "visualBleed": 240, "size": { "width": 1, "height": 1 }
    },
    {
      "id": "wind-bell", "kind": "island",
      "entry": "surfaces/island.js", "style": "surfaces/island.css",
      "pointerMode": "interactive", "zOrder": "owned",
      "anchor": "main.right", "offset": { "x": 18, "y": 0 },
      "size": { "width": 96, "height": 160 },
      "requires": ["navigation", "presenters"]
    }
  ]
}
```

- **Halo「落叶」**：passthrough，主窗口上缘外缓慢飘落 3~5 枚像素落叶/流萤，
  本地动画在 surface 内完成；snapshot 只用于对齐主窗口 bounds 与 theme。
  流萤亮度映射 `status.telemetry.moodAura`。
- **Island「风铃」**：挂在主窗右缘外，像素风铃 + 短冊坠子；`nativeWindow.velocity`
  驱动摆幅（拖窗时风铃晃）；点击坠子 = `commands.request('setSidebarTab', …)` 或
  `closeSidebar`。岛不接受输入焦点以外的指针行为，命令走白名单 + ack。
- 平台口径：Windows `supported` 才默认启用；macOS/Linux `experimental` 时在诊断里
  标注，不作为默认体验承诺。

## 10. 信号 → 动效映射

| 信号 | 消费点 | 表现 |
|---|---|---|
| `presenters.status` mood.hue | 灯笼光晕 | 灯光色温偏移 |
| `telemetry.breath` | 灯笼光晕 | 烛火明灭周期 |
| `telemetry.moodAura` | Halo 流萤 + underlay 雾 | 亮度/雾浓度 |
| `telemetry.moodRhythm` | 缘苔微闪 | 苔点明暗节奏 |
| `chat.sessionEntryCount/elapsedMs` | 缘苔游标 | §8 公式 |
| `chat.typing` | 短冊 | 纸面微颤 |
| `garden.stage/progress` | 主株 + 角花 | maxTicks、开花事件 |
| `diary.entries` 新增 | 信笺匣 | 一格新信笺 + 角花 |
| `nativeWindow.velocity` | 风铃摆幅、灯笼光偏移 | setMotionOffset（fixture 同款） |
| `pointer` | 灯笼 | 高光微视差（≤4px） |
| `viewport.paused` | 全部自绘 | 停帧，不另开 ticker |

## 11. 性能与清理红线（自查表）

- 全 Mod 只有：1 块 edge Canvas + 1 块主株离屏 Canvas + Scene 统一 scheduler；无常驻 rAF。
- 苔格上限 512、落叶上限 5、主株 ≤96×96 单元；所有增长有 cap。
- disposer 幂等，覆盖：edge 订阅退订、signals 退订、presenter acquire 全部 release、
  Scene node dispose、components detach、Canvas/Blob URL 移除、style 移除。
- 无 SVG 装饰、无 CSS 渐变假 bleed；透明像素接近零 alpha。
- 用户可见文案一律走 `src/shared/i18n/` 语义 key；Mod 名称「苔庭」写 manifest。

## 12. 施工分期

| 期 | 内容 | 出口标准 |
|---|---|---|
| M1 | theme/theme.json + layout/layout.json + 空 entry 包骨架 | 偏好里可选、可切换、回退 builtin 无损 |
| M2 | 十个 Scene node 摆位 + 外壳样式 + 错误木牌自绘 | §5 义务全部落地，窄窗降级生效 |
| M3 | 像素植物引擎 + edge 苔 + 角花 + 主株 | 生长确定性、cap、DPR 正确 |
| M4 | Halo 落叶 + 风铃 Island | Windows 实窗验收清单全过 |

每期独立 commit；未完成实窗验收的项写 `docs/known-issues.md` 并保持 open/partial。
M4 涉及 native surface，验收按 `docs/design-mod-authoring.md` §8：宽/窄窗、
100%/125%/175% DPI、双屏负坐标、拖动同框、hide/restore、Mod A→B→builtin ×20、
Halo click-through、Island command ack、恢复默认后 surface 归零。
