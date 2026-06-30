# 房间灯光系统 + 保存视角修复 + 人物位置 规格 v7（交付 Claude Code 一次性执行）

> 接 v6（房间设置面板/预设/自由视角已落地）。本轮解决用户反馈的三个问题 + 一个 Phase 3 准备附录：
> A. 「保存当前视角」只保存了部分参数（旋转/俯仰角度丢失，退出即变）—— **修复**
> B. 灯光系统重做：场景灯与角色灯冲突、突兀；要可开关/可调、角色单独打光、前端控制位置强度
> C. 人物位置：半身插在地面里，无法自然摆放 —— 加锚定模式 + 更顺手的位置控制
> D.（附录，给用户）Phase 3 视线追踪所需的**绑骨/形态键命名规范**
>
> 关键现状（`src/windows/room/useRoomScene.ts`）：
> - 灯光：第 369–373 行只有 `AmbientLight(0.45)` + `DirectionalLight(0.9)` 加在 scene 根；room.glb 经 GLTFLoader 可能**自带 KHR_lights_punctual 灯光**，与之叠加 → 突兀。
> - 保存视角：`saveCurrentView()`（第 579 行）存 `camera.position` + `controls.target`，理论完整。**但渲染循环第 511–515 行的"相机呼吸"在锁定模式每帧强制 `camera.position.x = sin()*0.012`（≈0）、`y = camBaseY + ...`**，把自定义视角的水平角度/X 抹回正面 → 这就是"旋转角度没保存"的真因。
> - 人物：`normalizeAndPosition`（第 46 行）把 `model.position.y += -box.min.y`（底边踩 y=0），半身 bust 的腰部切口就贴在地面 → 插在地里。
> - 设置：`RoomSettings`（`src/shared/room/roomSettings.ts`）；设置面板 `CallSettingsPage`（v6）。
>
> 原则：graceful、不破坏 v4 refs 顺序与 v5 形态键，卸载 dispose 完整。

---

## A. 修复「保存当前视角」（旋转/俯仰丢失）

### A.1 根因
渲染循环锁定模式的相机呼吸**绝对赋值** `camera.position.x = Math.sin(t*0.18)*0.012`，把 X 抹成 ~0；`camera.position.y = refs.camBaseY + ...` 只保了 Y。于是自定义视角里任何水平环绕（X≠0）与由此决定的方位角被每帧抹掉，画面塌回正面。

### A.2 修法：呼吸改为绕"完整基准位姿"的微小偏移
1. `SceneRefs` 把 `camBaseY: number` 换成 `camBase: THREE.Vector3`（完整基准相机位置）。
2. `applyView` 里设 `refs.camBase.copy(refs.camera.position)`（在 `applyCustomView`/`applyFraming` 之后，相机已就位时）。
3. 渲染循环呼吸改为（保留生命感但不破坏角度）：
   ```ts
   if (!freeLookRef.current) {
     camera.position.set(
       refs.camBase.x + Math.sin(t * 0.18) * 0.010,
       refs.camBase.y + Math.sin(t * 0.24) * 0.008,
       refs.camBase.z,                       // ← 不再抹平 X，保留完整位姿
     );
   }
   ```
4. 自由视角期间（`freeLookRef.current === true`）不跑呼吸（已是如此），用户拖完点保存读取的就是真实位姿。
> 这样 `customView{pos,target}` 已足够表达任意机位（OrbitControls 中 pos+target 完整决定朝向）；问题只在呼吸覆盖，修掉即可。无需扩展存储字段。

### A.3 验收
- [ ] 自由视角转到侧面/俯仰任意角度 → 保存 → 关自由视角/重开窗口，画面停在所保存角度，X 与俯仰都在。
- [ ] 锁定模式仍有极轻微呼吸，但不改变构图角度。

---

## B. 灯光系统重做

### B.1 设计目标
- 可选**剥离 room.glb 自带灯光**（避免叠加突兀）。
- 一套**全局灯**（环境 + 主光）照亮全场。
- 一盏**角色专属补光**（只照角色、不照场景）——用 Three.js layers 实现。
- 全部**前端可调**：开关、强度、颜色、位置；存进 `RoomSettings`。
- mood 调色作为**可选叠加**（默认可关），不再强制。

### B.2 扩展 `RoomSettings`（`roomSettings.ts`）
```ts
export interface LightCfg { on: boolean; intensity: number; color: string; pos?: [number,number,number]; }
export interface RoomLights {
  useSceneLights: boolean;     // 是否保留 glb 自带灯（默认 false = 剥离）
  ambient:  LightCfg;          // 环境光（无方向）
  key:      LightCfg;          // 主光（DirectionalLight，有 pos）
  charFill: LightCfg;          // 角色专属补光（只照角色，有 pos）
  moodTint: boolean;           // mood 调色叠加到 key 上（默认 false）
}
// RoomSettings 加 lights: RoomLights
```
默认值（迁移：旧设置无 `lights` 时填默认）：
```ts
lights: {
  useSceneLights: false,
  ambient:  { on: true, intensity: 0.5, color: '#ffffff' },
  key:      { on: true, intensity: 0.9, color: '#fff5e0', pos: [2, 4, 3] },
  charFill: { on: true, intensity: 0.6, color: '#ffffff', pos: [0.5, 1.6, 2] },
  moodTint: false,
}
```
`validate` 对每盏做 clamp（intensity 0–4、color 校验 hex、pos 数字三元组）。

### B.3 实现（`useRoomScene.ts`）
**层常量**：`const CHAR_LAYER = 1;`

**剥离/保留场景灯**：room.glb 加载完成后，若 `!lights.useSceneLights`，遍历 `roomGroup`，对 `obj.isLight` 的节点 `obj.parent.remove(obj)`（或收集后移除）。`useSceneLights` 切换需重载/重扫场景灯。

**角色入层**：`normalizeAndPosition` 后，遍历角色 model 的 mesh：`mesh.layers.enable(CHAR_LAYER)`（角色同时在 layer 0 与 1）。

**三盏灯**（替换现有 ambient+dir 固定灯，改为按配置创建/更新）：
- `ambient = new THREE.AmbientLight(color, intensity)`，layer 默认 0（照全场）。
- `key = new THREE.DirectionalLight(color, intensity)`，`key.position.set(...pos)`，layer 0。
- `charFill = new THREE.DirectionalLight(color, intensity)`（或 PointLight），`charFill.position.set(...pos)`，**`charFill.layers.set(CHAR_LAYER)`** → 只照 layer1 = 角色。
- `on=false` 的灯 `intensity=0` 或从 scene 移除（推荐保留对象、置 `visible=false` 便于热切换）。
> 原理：Three.js 中光是否照到物体取决于 `light.layers.test(object.layers)`。`charFill` 只在 layer1 → 只照角色；相机渲染不受影响（角色仍在 layer0，正常可见）。

**实时响应设置**：`lights` 变化时更新各灯的 on/intensity/color/pos（一个 effect 监听 `settings.lights`，就地改属性，无需重建场景）。

**mood 调色**：仅当 `lights.moodTint===true` 时，把 `MOOD_TABLE[mood].auraHue` 调制到 `key.color`（沿用现有 lerp 平滑）；否则 key 用配置的固定 color。

### B.4 设置面板「灯光」分区（`CallSettingsPage`）
加一个可折叠「灯光」小节：
- `useSceneLights` 开关、`moodTint` 开关。
- 三盏灯各一组：开关 + 强度滑块(0–4) + 颜色选择 + 位置 xyz 滑块（key/charFill 才有 pos，范围如 -8–8）。
- 复用 PrefRow/PrefRange + 颜色 input。所有改动即时写 `roomSettings`。

### B.5 验收
- [ ] 关 `useSceneLights` 后只剩自定义三盏灯，场景与角色亮度协调、不突兀。
- [ ] charFill 调强度/移位置只影响角色、不影响房间。
- [ ] 三盏灯开关/强度/颜色/位置实时生效。
- [ ] moodTint 关时灯色固定；开时随情绪轻微变化、仍可读。

---

## C. 人物位置（锚定模式）

### C.1 现状问题
`normalizeAndPosition` 强制底边踩 y=0，半身 bust 腰切口贴地 → 像插在地里；只能用 offset 硬怼。

### C.2 设计：锚定模式
`RoomSettings` 加 `anchorMode: 'floor' | 'free'`（默认 `'free'` 更适合半身肖像）：
- `'floor'`：保持现状（底边 y=0 + offset），适合全身落地。
- `'free'`：**不贴地**——归一化后把模型**包围盒中心**移到 `offset`（即 offset 作为角色世界坐标，自由悬浮），适合半身 bust 摆到镜头前的视平线高度，背景房间只作衬景，不再露出腰部地面。
```ts
// normalizeAndPosition 末尾按 anchorMode 分支：
if (s.anchorMode === 'free') {
  const c = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  model.position.x += -c.x + s.offset[0];
  model.position.y += -c.y + s.offset[1];   // 中心对齐到 offset，不贴地
  model.position.z += -c.z + s.offset[2];
} else { /* floor: 现有逻辑 */ }
```
### C.3 设置面板
- 加「锚定方式」下拉：贴地 / 自由。
- offset 三轴滑块范围放宽（如 -2–2，步进 0.01）；自由模式下它就是角色摆位。
- 文案提示：半身建议「自由」+ 配合构图/自定义视角把切口移出画面。

### C.4 验收
- [ ] 半身模型选「自由」后可摆到镜头前合适高度，不再插在地面。
- [ ] 「贴地」对全身模型仍正确落地。
- [ ] offset 三轴实时移动角色。

---

## 合并验收 & 红线
- [ ] `npm run build` 通过。
- [ ] 保存视角后角度完整保留；锁定呼吸不破坏角度。
- [ ] 灯光三盏可调、角色专属光只照角色、可剥离场景灯。
- [ ] 半身不再插地；锚定模式可切。
- [ ] 多次改设置/切模型 dispose 正确不漏显存。

**红线**
- 不重新引入 v4 refs 顺序问题、不破坏 v5 形态键与归一化、不破坏 v6 自由视角/预设。
- 灯光/锚定/视角参数一律走 `RoomSettings` 持久化与订阅，实时响应。
- 缺字段（旧设置无 lights/anchorMode）一律迁移到默认，不崩。

## 建议顺序
A（修视角 bug，最快）→ C（锚定模式，小）→ B（灯光系统，大头）。同分支分 commit。

---

## 附录 D：Phase 3 视线追踪 —— 给用户的绑骨/形态键命名规范（现在就可以做）

> 你问"怎么确定头和眼是哪个 / 绑骨需要什么命名"。说明：**MediaPipe 读的是你(用户)摄像头里的脸**，算出你的头部朝向与视线；前端把它**镜像**成"她看向你"的目标，再驱动角色的头与眼转过去。所以 MediaPipe 不需要认识角色的骨骼——**需要规范命名的是角色这侧**，让代码能找到"头"和"眼"去转。

你的半身是纯形态键雕的，给两条路，**代码按名读取、缺啥跳啥**，可只做眼睛先跑起来：

### 路线 1（推荐，最省事）：眼睛用形态键，头用一根骨头
- **眼睛**（新建 4 个形态键，眼球/瞳孔朝对应方向偏移，各 0–1）：
  - `eyeLookLeft`、`eyeLookRight`、`eyeLookUp`、`eyeLookDown`
- **头部转动**（可选，想要更生动再做）：在 Blender 给脖子/头绑**一根骨头**，命名为 `Head`（大小写如此）。代码会把这根骨头朝目标小幅旋转（夹在约 ±25°）。
  - 没有 `Head` 骨也行——那就只用眼睛形态键，头不转。

### 路线 2（全形态键，不想碰骨骼）
头部转动也用形态键近似：`headYawLeft`、`headYawRight`、`headPitchUp`、`headPitchDown`（各 0–1）。效果不如骨头自然，但零绑骨。

### 命名汇总（大小写敏感，导出 glTF 勾选 Shape Keys / 骨骼名）
| 用途 | 名称 |
|---|---|
| 眼睛左右上下 | `eyeLookLeft` `eyeLookRight` `eyeLookUp` `eyeLookDown` |
| 头转(骨,推荐) | 骨骼 `Head`（可选加 `LeftEye`/`RightEye` 眼骨） |
| 头转(纯形态键,替代) | `headYawLeft` `headYawRight` `headPitchUp` `headPitchDown` |

> 最小可用：先做 `eyeLookLeft/Right/Up/Down` 四个，Phase 3 眼神就能跟着你动。头部转动和 `Head` 骨等有空再补。这些与 v5 的表情/口型形态键并存、互不冲突。
