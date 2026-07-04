# Brief 09 · Live2D 模式（视频通话 + 桌宠，与 3D 平行）

> 目标：在现有 3D 角色（GLB + Three.js）之外，新增一套 **Live2D（Cubism 4/5）渲染模式**。
> 与 3D 模式**平行且等价**：同一套 mood 情绪映射、同一个 `avatar_directive` WS 指令、同一个 VN 气泡 UI。
> 切换入口在 Chat 偏好：**4 桌宠**（粒子风格里已有 `live2d` 占位）与 **6 视频通话**（新增「渲染模式」选择）。
> 本仓库只做渲染与本地设置，不动后端、不动 WS 协议、不动 `useVnPresenter` / `turnIngest`。

施工顺序建议：§1 → §2 → §3（核心驱动层，最大头）→ §4 → §5 → §6 → §7。§3 完成前 §4/§6 无法开工，§5 可与 §4 并行。

---

## 0 · 技术选型（定死，不要自选）

| 项 | 决定 | 理由 |
|---|---|---|
| 渲染库 | `pixi.js@6.5.10` + `pixi-live2d-display@0.4.0` | 0.4.0 只兼容 PIXI v6，锁死版本避免踩 v7 兼容坑 |
| 导入方式 | **必须动态 import**：`await import('pixi-live2d-display/cubism4')`，且严格在 `ensureCubismCore()` resolve 之后 | ⚠️ 该包在**模块求值时**就检查 `window.Live2DCubismCore`，缺失直接 throw；静态 import 会经 main.tsx → RoomWindow 链在启动时炸掉整个 bundle（米黄白屏事故，已踩过）。只支持 Cubism 4/5，不引 Cubism 2 runtime |
| Cubism Core | `live2dcubismcore.min.js`，放 `public/live2d/core/`，运行时动态注入 `<script>` | Live2D 官方专有许可，**不能进 npm 依赖、不能进 git**（`.gitignore` 加一条）；由茶茶手动下载放置 |
| Ticker | `Live2DModel.registerTicker(PIXI.Ticker)` 一次性注册 | 库要求 |

`tauri.conf.json` 的 `csp` 为 `null`，本地 script 注入无 CSP 障碍，不需要改配置。

> **注（Brief 10）**：渲染库已由 Brief 10 升级为 `pixi.js@7.4.3` + `pixi-live2d-display-lipsyncpatch@0.5.0-ls-8`（支持 Cubism 3–5），上表「渲染库」「Ticker」两行为历史版本记录，当前实际版本见 `package.json`；铁律（动态 import、Cubism Core 独立注入）不变。

**茶茶侧 checklist（资产，代码开工前就能做）**：
1. 从 Live2D 官网（Cubism SDK for Web）下载 `live2dcubismcore.min.js`，放到 `public/live2d/core/live2dcubismcore.min.js`。
2. 模型按目录放置：`public/live2d/models/<模型名>/`，目录内含 `*.model3.json` 及其贴图/moc3/motions/expressions。每个模型一个目录。
3. 模型若带表情（`.exp3.json`），命名尽量对齐后端 token：`neutral / gentle / thinking / happy / sad / surprised / angry / sleepy / yandere`（缺了不要紧，有 fallback，见 §3.2）。
4. 待机动作组命名 `Idle`（Cubism 默认约定）。

---

## 1 · 依赖与 Core 加载器

**施工**
1. `npm i pixi.js@6.5.10 pixi-live2d-display@0.4.0`（锁 exact 版本，package.json 里去掉 `^`）。
2. 新文件 `src/shared/live2d/cubismCore.ts`：
   - `export async function ensureCubismCore(): Promise<void>`——若 `window.Live2DCubismCore` 已存在直接返回；否则注入 `<script src="/live2d/core/live2dcubismcore.min.js">`，onload resolve / onerror reject。模块级 Promise 缓存，保证只注入一次、并发调用共享同一 Promise。
   - reject 的错误信息要人话：`Cubism Core 未找到：请将 live2dcubismcore.min.js 放到 public/live2d/core/`。
3. `.gitignore` 追加 `public/live2d/core/`。

**验证**：core 文件不存在时调用 reject 且信息正确；存在时二次调用不再注入第二个 script 标签。

---

## 2 · Rust：扫描 Live2D 模型

**施工（`src-tauri/src/lib.rs`）**
1. 新 command `list_live2d_models`，目录解析逻辑复刻 `room_assets_dir`（resource_dir 优先、dev 回退源码 `public/`），根为 `live2d/models`。
2. 遍历一级子目录，在每个子目录内找第一个 `*.model3.json` 文件；返回 `[{ "dirName": "<目录名>", "modelJson": "<文件名>", "label": "<目录名>" }]`，按 dirName 排序。找不到 model3.json 的目录跳过。
3. 注册到 invoke_handler；`models` 目录不存在时返回空数组（不报错，前端显示空态），但 `live2d` 根目录定位失败时报错信息要列出已检查路径（同 `room_assets_dir` 风格）。
4. 前端封装 `src/shared/live2d/live2dAssets.ts`：`listLive2DModels(): Promise<Live2DModelAsset[]>`，模式抄 `roomAssets.ts`。

**验证**：放两个模型目录 + 一个空目录，返回恰好两项且排序稳定；无 `public/live2d/models` 时返回 `[]`。

---

## 3 · 共享驱动层 `src/shared/live2d/`（核心）

与 3D 侧 `useCharacterRig` 对位：一套「加载 + 每帧驱动」逻辑，视频通话和桌宠两处复用，**禁止两处各写一套**。

### 3.1 设置 `live2dSettings.ts`

模式完全抄 `roomSettings.ts`（localStorage + validate + CustomEvent + subscribe）：

```ts
export interface Live2DSettings {
  modelDir: string;            // public/live2d/models/ 下目录名，默认 ''
  scaleMul: number;            // 0.2–3，默认 1
  offset: [number, number];    // 画布尺寸比例 -1–1，默认 [0, 0]
  bgKind: 'transparent' | 'color' | 'image';  // 通话默认 'color'，桌宠强制 transparent
  bgColor: string;             // hex，默认 '#1a1d26'
  bgImage: string | null;      // public 路径，如 /live2d/backgrounds/xx.jpg
  lipsyncStrength: number;     // 0–1，默认 0.8
  idleMotionGroup: string;     // 默认 'Idle'
  mouthParam: string;          // 默认 'ParamMouthOpenY'
}
```

STORAGE_KEY `live2d.settings`，CHANGE_EVENT `emerald:live2d-settings`。桌宠侧缩放独立走 uiPref `pet.live2d.zoom`（对齐现有 `pet.model3d.zoom`），不进本结构。

另外 `roomSettings.ts` 的 `RoomSettings` 增加字段 `renderMode?: 'model3d' | 'live2d'`（validate：非法值回落 `'model3d'`；DEFAULT 里为 `'model3d'`）。**渲染模式属于「视频通话」的设置，放 RoomSettings；Live2D 自身参数放 Live2DSettings**——这样 3D/Live2D 各自的构图参数互不污染。

### 3.2 情绪映射 `live2dExpressions.ts`（与 `morphExpressions.ts` 对位）

两层策略：

1. **表情层（优先）**：`MOOD_TO_EXPRESSION: Record<Mood, string>`：
   `平静→neutral · 开心→happy · 低落→sad · 病娇→yandere · 分心→thinking · 生气→angry · 惊讶→surprised`。
   模型的 expressions 列表里存在同名表情（比对 `.exp3.json` 的 Name，大小写不敏感、忽略扩展名）→ `model.expression(name)`。
2. **参数 fallback（模型无该表情时）**：直接写核心参数，表结构对齐 `MOOD_MORPHS`：

```ts
export const MOOD_PARAMS: Record<Mood, Record<string, number>> = {
  '平静': {},
  '开心': { ParamMouthForm: 1,  ParamEyeLSmile: 1, ParamEyeRSmile: 1 },
  '低落': { ParamMouthForm: -1, ParamBrowLY: -0.6, ParamBrowRY: -0.6 },
  '病娇': { ParamMouthForm: 0.6, ParamCheek: 1 },
  '分心': { ParamEyeBallX: 0.6, ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7 },
  '生气': { ParamBrowLAngle: -1, ParamBrowRAngle: -1, ParamMouthForm: -0.8 },
  '惊讶': { ParamEyeLOpen: 1.4, ParamEyeROpen: 1.4, ParamMouthOpenY: 0.5 },
};
```

   写参数前用 `coreModel.getParameterIndex(id)` 检查存在性（-1 跳过），与 3D 侧 `morph.has()` 同思路。数值按 directive `intensity` / 常态 0.85 缩放，并用 lerp 平滑过渡（速度对齐 3D 侧 0.1/帧 的手感）。
3. 情绪切换时若模型带同名 motion group（如 `happy`），一次性播放该组随机一条（priority NORMAL）——P2 甜点，做不动可跳过，不阻塞验收。

### 3.3 模型加载与驱动 `useLive2DStage.ts`

`useLive2DStage(mountRef, opts)`，opts：`{ getMood(): Mood; getTalking(): boolean; getVolume?(): number; transparent: boolean; zoom?: number }`。职责：

1. **初始化**：`await ensureCubismCore()` → `new PIXI.Application({ backgroundAlpha: transparent ? 0 : 1, resizeTo: mount, autoStart: true })` → `Live2DModel.from('/live2d/models/<dir>/<modelJson>')`。加载失败渲染错误文案（模型缺失/core 缺失分开提示），不白屏。
2. **布局**：anchor(0.5, 0.5)，按画布高度与模型原始高度比例 fit（模型高 ≈ 画布高 × 0.95 × scaleMul × zoom），offset 按画布尺寸比例平移。ResizeObserver 里重算（`resizeTo` 只管 renderer，布局要自己算）。
3. **每帧驱动（关键坑）**：pixi-live2d-display 的 MotionManager 每帧会覆写参数，**直接在 ticker 里 set 参数会被 motion 冲掉**。定死方案：加载完成后 monkey-patch `model.internalModel.motionManager.update`——先调原始实现，再依次叠加我们的层。每帧顺序：
   1. motion（原始 update，idle 循环底座）
   2. 表情/参数层：directive.expression 优先（经 `backendMoodToFrontend` 转 Mood 后查表，同 3D），否则当前 mood
   3. 眨眼：**禁用库的自动眨眼**（`model.internalModel.eyeBlink = undefined`），移植 `useCharacterRig` 的 BlinkState（MOOD_TABLE 的 blinkInterval/blinkJitter 驱动，60ms 半程三角脉冲）写 `ParamEyeLOpen/ParamEyeROpen`（脉冲=1 时闭眼，即写 `1 - pulse` 与表情层取 min）
   4. 口型：`talking = directive?.speaking ?? getTalking()`；talking 时 `mouthParam = (0.5 + 0.5·sin(t·12)) · lipsyncStrength`，否则 lerp 回 0；若有 `getVolume`（桌宠），直接 `volume · lipsyncStrength` 优先
   5. gaze：directive.gaze → `ParamAngleX/Y`（±30 缩放）、`ParamEyeBallX/Y`（±1）；无 directive 时 lerp 回 0 + 轻微 microNoise 呼吸感（`ParamAngleZ` 或 `ParamBodyAngleZ` 小幅正弦）
   6. gesture：nod→`ParamAngleY` 脉冲、shake→`ParamAngleX` 左右两次、tilt→`ParamAngleZ`、lean_in→整体 scale 1.03 缓入缓出；时长/衰减手感对齐 `useRoomScene` 现有 gesture（600ms 量级，用 directive.receivedAt 计算相位）
   7. directive TTL 复用 `getActiveDirective(now)`（`src/windows/room/avatarDirective.ts` 原样 import，**不复制代码**）
4. **待机**：加载后播放 `idleMotionGroup` 循环（MotionPriority.IDLE）；模型无该组则跳过（呼吸 microNoise 兜底，不报错）。
5. **热切换**：订阅 `live2dSettings` 变化；modelDir 变化 → destroy 旧模型重载；scale/offset/bg 变化 → 只重算布局/背景，不重载。
6. **清理**：unmount 时 `model.destroy()`、`app.destroy(true, { children: true, texture: true, baseTexture: true })`，patch 还原不必做（模型一起销毁）。
7. 背景：bgKind color → renderer backgroundColor；image → 模型层下方铺一个 PIXI.Sprite（cover 布局）；transparent → alpha 0。

**验证（§3 整体，可在 §4 完成后一起验）**
- mood 七态切换：有表情模型走 expression、无表情模型走参数 fallback，过渡平滑无跳变。
- WS 发 `avatar_directive`（expression/gaze/gesture/speaking 各来一发）：表现与 3D 模式语义一致，TTL 过期回落 mood 常态。
- talking 期间嘴动、结束闭合；眨眼间隔随 mood 变化（病娇/低落慢、惊讶快，对照 MOOD_TABLE）。
- 切模型 / 改缩放偏移即时生效；窗口 resize 不糊不偏。
- 反复进出窗口 10 次无 WebGL context 泄漏警告、内存稳定。

---

## 4 · 视频通话 Live2D 模式（`src/windows/room/`）

**施工**
1. 新文件 `src/windows/room/Live2DCallStage.tsx`：一个 div 容器 + `useLive2DStage`，props `{ mood, talking }`。背景按 Live2DSettings（通话侧默认深色）。
2. `RoomWindow.tsx`：读 `roomSettings.renderMode`。
   - `live2d` → 中部画布区渲染 `<Live2DCallStage mood={mood} talking={presenter.talking} />`，**不调用** `useRoomScene`（注意：不能条件调用 hook——把现有 Three.js 部分抽成 `<ThreeCallStage>` 子组件内调 `useRoomScene`，RoomWindow 按 renderMode 二选一挂载）。
   - 顶栏、VN 气泡、用户回声气泡、输入栏、麦克风、挂断全部不动（两模式共用）。
   - 底部「摆放模式 🛠」「自由视角」「保存视角」按钮仅 3D 模式渲染；Live2D 模式下这三个位置留空即可。
   - `setupAvatarDirectiveListener` 保持在 RoomWindow 层挂（两模式共用）。
3. 通话中切换 renderMode（设置面板改动触发 subscribeRoomSettings）→ 直接卸旧挂新，允许黑一帧，不做过渡动画。

**验证**
- 3D 模式回归：现状无任何变化（构图/灯光/物理/道具/摆放/自由视角全在）。
- Live2D 模式：发消息 → VN 气泡逐段 reveal 同时嘴动；mood 变化表情跟随；挂断/重进正常。
- 模型或 core 缺失时画布区显示指引文案（放什么文件到哪个目录），窗口其余功能可用。

---

## 5 · 设置 UI（Chat 偏好 4 桌宠 / 6 视频通话）

**施工**
1. 新文件 `src/windows/chat/components/Live2DSettingsSection.tsx`（复用 CallSettingsPage 的 Row/SliderNum/selectStyle 风格；这几个原语如果方便就从 CallSettingsPage 导出复用，不方便就本地复制——二选一，别搞第三个 UIKit）。内容：
   - 模型选择：`listLive2DModels()` 下拉（空态提示放置路径 `public/live2d/models/<名>/`）。
   - 缩放（0.2–3）、X/Y 偏移（-1–1）。
   - 背景：transparent（叫「跟随窗口」）/ 纯色（color picker）/ 图片（文本框填 public 路径，hint 同外观页视频路径的写法）。
   - 口型强度（0–1）、待机动作组（文本框，默认 Idle）、口型参数名（文本框，默认 ParamMouthOpenY，hint：模型参数名不标准时改这里）。
2. `CallSettingsPage.tsx` 顶部新增「渲染模式」区块：
   - `<Row label="渲染模式" hint="3D 模型 · Live2D，即时切换">` select：`model3d → 3D 模型`、`live2d → Live2D`，写 `roomSettings.renderMode`。
   - `renderMode === 'live2d'` 时：渲染 `<Live2DSettingsSection />`，**隐藏**所有 3D 专属区块（模型与场景 / 构图参数 / 灯光 / 物理骨骼 / 预设 / 道具 / 底部提示语）。3D 模式时反之，Live2D 区块不显示。预设系统只服务 3D，本期不给 Live2D 做预设。
3. 桌宠 tab（ChatWindow.tsx pet 分支）：
   - 「粒子风格」option 文案 `Live2D（实验）` 改为 `Live2D`。
   - `petVisualStyle === 'live2d'` 时追加：「Live2D 缩放」滑条（uiPref `pet.live2d.zoom`，0.3–4，抄 model3d 缩放那段）+ 一行 hint「模型与表情映射与视频通话共用，去 6 视频通话 页配置」。不在桌宠页重复放模型选择。

**验证**：两个 tab 切换流畅；渲染模式切换后 CallSettingsPage 区块显隐正确；所有设置改动即时反映到已打开的通话窗/桌宠（走各自 subscribe，不需要重开）。

---

## 6 · 桌宠 Live2DStage 实装（`src/windows/pet/components/Live2DStage.tsx`）

**施工**：整体替换现占位组件。
1. `useLive2DStage` 接入：`transparent: true` 强制（无视 bgKind——桌宠窗口是透明置顶窗）；`zoom` 取 uiPref `pet.live2d.zoom` 并订阅变化（抄 Model3DStage 的 zoom 订阅）；`getMood` 来自 snapshot；`getTalking`：`snapshot.thinking` 不算说话，用 `volume` prop（已有）驱动口型即可，`getVolume: () => volume ?? 0`。
2. reaction 映射（对位 ParticleCanvas 的交互脉冲）：
   - `shy` → 播一次 `惊讶` 参数脉冲（ParamEyeLOpen/ParamEyeROpen 1.3 + ParamAngleZ 偏转，600ms 衰减）。
   - `nuzzle` → `ParamCheek` 1 + ParamAngleZ 轻晃，800ms 衰减。
   - 用 reaction.id 变化触发（同现有组件消费方式），实现放 driver 的一个 `pulse(kind)` 接口里。
3. 加载失败/缺资产时保留现在这种居中小字提示（文案指向放置路径），不崩桌宠窗口。

**验证**：桌宠切 live2d 风格 → 模型透明背景渲染；鼠标接近触发 shy 表现；助手说话时（volume > 0）嘴动；拖动/漫游/涟漪等窗口行为不受影响（那些在 PetWindow 层，不该被触碰）。

---

## 7 · 文档

1. `ARCHITECTURE.md`：视频通话/桌宠段落补 renderMode 与 `src/shared/live2d/` 驱动层一句话说明。
2. 新 `docs/live2d-model-import-guide.md`：core 下载放置、模型目录结构、表情命名对照表（§0/§3.2 的约定）、常见坑（参数名不标准改 mouthParam、无 Idle 组、Cubism 2 模型不支持）。

---

## 总验收清单

- [ ] 3D 模式零回归（构图/灯光/物理/道具/预设/摆放/视角保存）。
- [ ] 通话 Live2D：mood 七态 + directive 四类 + 口型 + 眨眼 + VN 气泡完整链路。
- [ ] 桌宠 Live2D：透明渲染 + volume 口型 + shy/nuzzle 反应 + 缩放设置。
- [ ] 设置：6 视频通话 渲染模式切换 + Live2D 分区；4 桌宠 live2d 缩放行。
- [ ] 缺 core / 缺模型的降级提示均为可读中文指引，无白屏无崩溃。
- [ ] `npm run build` 通过；pixi 相关依赖锁 exact 版本；`public/live2d/core/` 已 gitignore。

## 边界（本期不做）

- 不做音频驱动口型（无 TTS 音频流，volume/talking 正弦即可）。
- 不做 Live2D 命中区域交互（tap 身体部位触发 motion）——后续单。
- 不支持 Cubism 2（.model.json）模型。
- 不做 Live2D 预设系统、不做通话背景 3D 场景混排。
- 后端 / WS 协议 / `avatar_directive` 字段零改动。
