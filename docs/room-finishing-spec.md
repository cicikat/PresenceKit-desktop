# 视频通话 前端收尾「小尾巴」规格（交付 Claude Code 一次性执行）

> 接 v7（灯光/视角/位置已落地）。这是**前端侧的最后一块**：把摆放从滑块升级为可视化 gizmo + 焦距 + 头发左右飘 + 道具库脚手架。做完前端基本完结，之后是 v8 自驱（跨仓）。
>
> 含：
> A. 焦距（FOV）设置
> B. 摆放可视化 gizmo（角色 + 灯光，点选→移动/旋转，Blender 快捷键）+ 灯光强度快捷调节
> C. 头发左/右飘双形态键
> D. 道具库脚手架（扫描分类 + 摆放，最小可用）
>
> 现状要点：`useRoomScene.ts` 中 `FOV=45`(常量)；OrbitControls 已用；**`TransformControls.js` 在 `three/examples/jsm/controls/` 可用**（无需装包）。头发由单条 `morph.set('hairSway', 0.5+0.5*sin(t*0.6))` 驱动。形态键标准集见 `morphExpressions.ts`（`IDLE_DRIVEN_KEYS`）。设置存 `RoomSettings`（`roomSettings.ts`）。
> 原则：graceful、dispose 完整、不破坏 v4–v7。

---

## A. 焦距（FOV）设置
- `RoomSettings` 加 `fovDeg: number`（默认 45，clamp 20–80）。`character.json` 可带 `fovDeg` 作模型默认。
- `useRoomScene`：用 `settings.fovDeg` 替代常量 `FOV`（`applyFraming` 里 `camera.fov = settings.fovDeg`；构图距离公式里的 `FOV` 也改用它）。设置变化即时 `camera.updateProjectionMatrix()`。
- 设置面板加「焦距」滑块（20–80）+ 数字框。
- 说明文案：小焦距=广角（脸会有透视夸张），大焦距=长焦（更平、更"上镜"）。
- 验收：拖焦距实时改变透视；与构图/自定义视角共存不冲突。

---

## B. 摆放可视化 gizmo（角色 + 灯光）

### B.1 目标
进入"摆放模式"后，像 Blender/UE 那样**点选物体 → 出现移动/旋转手柄 → 拖拽摆放**；可选对象：角色、key 灯、charFill 灯。结果写回 `RoomSettings`（offset/yawDeg、灯 pos）。这是 v6「自由视角」之外的**物体摆放**（自由视角动的是相机，gizmo 动的是物体）。

### B.2 实现（`TransformControls`）
```ts
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
```
- 新建 `transformCtl = new TransformControls(camera, renderer.domElement)`；`scene.add(transformCtl)`（注意：TransformControls 是 Object3D，需加进场景）。
- **与 OrbitControls 协调**：拖动 gizmo 时禁用 OrbitControls——`transformCtl.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; })`。
- **灯光代理**：灯没有可点几何体，给每盏可摆放的灯放一个小 helper 球（`Mesh(SphereGeometry(0.06), Basic)`，半透明，仅摆放模式可见）放在灯的位置；gizmo 吸附到该球，拖动时同步灯 `position`。
- **选择**：摆放模式下用 raycaster 点选角色根/灯代理球 → `transformCtl.attach(target)`。
- **写回**：`transformCtl` 的 `objectChange` 事件里把目标的 position/rotation 写回 `RoomSettings`（角色→offset(自由模式)/yawDeg；灯→对应 `lights.*.pos`），节流保存。

### B.3 Blender 风格快捷键（摆放模式激活时监听 keydown）
| 键 | 作用 |
|---|---|
| `G` | 移动模式 `transformCtl.setMode('translate')` |
| `R` | 旋转模式 `setMode('rotate')` |
| `S` | 缩放模式 `setMode('scale')`（角色＝改 scaleMul；灯一般不缩放） |
| `X`/`Y`/`Z` | 约束到对应轴 `transformCtl.showX/Y/Z` 或 `setMode` 后限制轴 |
| `Esc` | 取消选择 / 退出摆放模式 |
> 实现轴约束：按 X/Y/Z 时只显示对应轴句柄（设 `transformCtl.showX=true,showY=false,showZ=false` 等）；再次按同键或按其它键切换。

### B.4 灯光强度快捷调节
- 选中某盏灯（或全局快捷）时，**左右方向键 / 鼠标横向滑动**调强度：`←`/`→` 每次 ±0.1（clamp 0–4），实时写 `lights.*.intensity`。
- 顶部或角落显示当前调节对象与数值小标签（如 `key ▸ 1.2`）。
- 可选：滚轮在选中灯时也调强度。

### B.5 入口与退出
- RoomWindow 底部控制条加「🛠 摆放」按钮（与 v6「🔧 自由视角」并列）。开启进入摆放模式：显示灯代理球、启用 gizmo、监听快捷键、暂停相机呼吸。
- 退出：隐藏代理球、`transformCtl.detach()`、解绑快捷键。

### B.6 dispose
- 卸载时 `transformCtl.detach()`、`transformCtl.dispose()`、移除代理球几何/材质。

### B.7 验收
- [ ] 摆放模式下可点选角色/灯，出现手柄，拖拽移动/旋转，松手即保存。
- [ ] G/R/S 切模式、X/Y/Z 约束轴、Esc 退出，符合 Blender 直觉。
- [ ] 方向键调选中灯强度实时生效。
- [ ] 摆放模式与自由视角互不打架；退出后通话视角正常。

---

## C. 头发左/右飘双形态键
- 标准名改为 `hairSwayLeft` / `hairSwayRight`（见导入说明书 §3.2）。
- `IDLE_DRIVEN_KEYS`（`morphExpressions.ts`）把 `hairSway` 替换为这两个。
- 渲染循环驱动改为**反相交替**（一左一右来回飘）：
  ```ts
  const sway = Math.sin(t * 0.6);              // -1..1
  morph.set('hairSwayLeft',  Math.max(0,  sway)); // 右摆时为 0
  morph.set('hairSwayRight', Math.max(0, -sway));
  ```
- 向后兼容：若模型只有旧 `hairSway`，则退回单条驱动（`morph.has('hairSwayLeft')||...` 判断，否则 `morph.set('hairSway', 0.5+0.5*sin)`）。都没有则跳过。
- 预留（不实现）：`hairWindStrong`/`hairWindSoft` 大小风，留作扩展名。
- 验收：有左右形态键时头发自然来回飘；只有旧 `hairSway` 仍单向飘；无则静止、不报错。

---

## D. 道具库脚手架（最小可用）
> 采用"道具独立导入 + 分类"（见导入说明书 §5.2）。本期只做**扫描 + 摆放**，"角色与道具互动"留给 v8 自驱。
- Rust 加 `list_room_props(category?)`：扫 `public/room/props/`（无 category 列出类别目录；有则列该类别下 glb），仿 `list_room_assets`。`tauri.conf.json` 的 `room` 资源已涵盖（`public/room/` 整体）。
- `RoomSettings` 加 `props: { file: string; pos:[x,y,z]; rot:[x,y,z]; scale:number }[]`（已放置的道具列表）。
- RoomWindow 加载 props 列表里的 glb 到一个 `propsGroup`；可被 B 的 gizmo 选中摆放，写回 `props[i]`。
- 设置面板加「道具」分区：按类别浏览、加入场景、删除。
- **本期不做**互动逻辑（角色去摸/拿）——只摆放与显示。道具内可选 `anchor` 空节点留作将来交互锚点。
- 验收：能把 props 下的 glb 加入房间、用 gizmo 摆放、保存与恢复；删除生效。

---

## 合并验收 & 红线
- [ ] `npm run build` + `cargo check` 通过；`TransformControls` 正常、`list_room_props` 注册。
- [ ] 焦距/ gizmo 摆放 / 灯强度快捷 / 头发左右飘 / 道具摆放 全部可用且持久化。
- [ ] gizmo 与 OrbitControls/自由视角不冲突；dispose 完整不漏显存。
- [ ] 旧模型（无左右头发/无道具）全部 graceful 降级。

**红线**
- 摆放是"物体"，自由视角是"相机"，两者独立；同一时刻只激活一个调整模式，避免事件打架。
- 不破坏 v4–v7（refs 顺序、形态键、灯光、视角、预设）。
- 缺资源/缺字段一律降级，不白屏。

## 建议顺序
C（头发，最小）→ A（焦距）→ B（gizmo+灯光快捷，大头）→ D（道具脚手架）。同分支分 commit。

> 做完此份，前端「虚拟空间」基本完结；角色的"自驱"由 v8（跨仓）接管。
