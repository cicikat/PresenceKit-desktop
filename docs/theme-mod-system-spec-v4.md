# 视频通话虚拟空间 Phase 1 规格 v4（交付 Claude Code 一次性执行）

> 方向已定（用户拍板）：虚拟空间走 **3D Three.js**——一个独立 RoomWindow，以"视频通话"窗口形态呈现，里面用 Three.js 渲染房间与角色（用户自建 glb）。入口放聊天框 "+" 菜单。
>
> 本 v4 含三块：
> A. "+" 菜单清理 + 视频通话入口（用户明确要求）
> B. RoomWindow Phase 1（Three.js 3D 房间 + 占位模型 + 优雅降级 + 视频通话外壳）
> C. 补完 v3 遗留的视频背景 stub（小尾巴）
>
> 现状复核（2026-06-29）：
> - 窗口架构：`src/main.tsx` 的 `AppRoot` 用 `activeWindow: 'chat'|'activity'|'toy'` 切换，`ToyWindow` 作整窗 overlay 渲染；ChatWindow 收 `onToyOpen` 回调。**RoomWindow 照此模式加 `'room'`。**
> - "+" 菜单：`src/windows/chat/components/ChatPanel.tsx` 第 1753–1756 行一个数组，点击派发 `action==='doc'?onClickAttach:action==='img'?onClickImage:()=>setShowAttachMenu(false)`。
> - `three` **未安装**。
> - 桌宠风格 `petVisualStyle.ts` 已预留 `'model3d'` 注释，将来房间模型可与桌宠共用 loader（本期不做，仅留接口）。
>
> 原则同前：严格按步骤、graceful fallback、不白屏；Three.js 资源务必在卸载时 dispose 防泄漏。

---

## A. "+" 菜单清理 + 视频通话入口

### A.1 删除两个空 legacy 项
`ChatPanel.tsx` 第 1753–1756 行数组，**删除**这两行（功能为空的废弃项）：
```
['book', '插入日记片段', '从他的日记中', 'close'],   // ← 删
['leaf', '从花园中取',   '已养成的物品', 'close'],   // ← 删
```
保留「附加文件」「插入图片」。

### A.2 加视频通话项
在数组里加（建议放「插入图片」之后）：
```ts
['video', '视频通话', '进入她的空间', 'room'],
```
（`'video'` 图标若 `Icon` 组件无此名，用现有近似图标或新增一个；不要因缺图标报错。）

### A.3 派发接线
把点击派发改为支持 `room`：
```ts
onClick={
  action === 'doc'  ? onClickAttach :
  action === 'img'  ? onClickImage :
  action === 'room' ? () => { setShowAttachMenu(false); onOpenRoom?.(); } :
  () => setShowAttachMenu(false)
}
```
- `ChatPanel` props 加 `onOpenRoom?: () => void`。
- `ChatWindow.tsx` 渲染 `<ChatPanel .../>` 处传入 `onOpenRoom={onRoomOpen}`；`ChatWindow` 自身 props 加 `onRoomOpen?: () => void`（与现有 `onToyOpen`/`onActivityOpen` 并列，照抄那条链）。
- `main.tsx`：`activeWindow` 联合类型加 `'room'`；给 `ChatWindow` 传 `onRoomOpen={() => setActiveWindow('room')}`；在 toy 渲染块旁加：
  ```tsx
  {activeWindow === 'room' && <RoomWindow onClose={() => setActiveWindow('chat')} />}
  ```

### A.4 验收
- [ ] "+" 菜单只剩：附加文件、插入图片、视频通话。
- [ ] 点「视频通话」打开 RoomWindow，关闭后回到 chat。
- [ ] 删除两项后菜单无报错、其余项功能不变。

---

## B. RoomWindow Phase 1（Three.js）

### B.1 依赖
`npm i three` 和 `npm i -D @types/three`。导入用：
```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
```

### B.2 资源约定（仿 themes/fonts/live2d）
模型放 `public/room/`：
- `public/room/scene/room.glb` —— 房间（用户自建，可暂缺）
- `public/room/character/character.glb` —— 角色（用户自建，可暂缺）

URL 直接 `/room/scene/room.glb`、`/room/character/character.glb` 访问（Vite 静态资源）。**两者缺失都必须优雅降级**（见 B.4），保证用户还没建模时窗口也能开、不崩。

### B.3 窗口骨架（新建 `src/windows/room/RoomWindow.tsx` + `index.ts`）
- 组件 `RoomWindow({ onClose }: { onClose: () => void })`，整窗 overlay，`role="dialog" aria-modal`，样式用主题 CSS 变量。
- 布局＝**视频通话外壳**：
  - 主区：Three.js canvas 容器（`<div ref={mountRef}>` 占满）。
  - 顶部条：角色名 + 通话计时器（`mm:ss` 自增）+ 连接状态点（复用 `--status-connecting`/绿点）。
  - 底部控制条：静音、摄像头（Phase 1 先占位禁用，留 Phase 3 MediaPipe）、**挂断**（红圆，点击 `onClose()`）。按钮用 `--radius-pill`、主题色。
  - 整体可加一圈 `--accent` 描边 + 轻微 `--dt-glow-*` 辉光，营造"通话中"质感。

### B.4 Three.js 场景（建议抽到 `src/windows/room/useRoomScene.ts` hook，便于 dispose 管理）
**初始化（mount 时）：**
1. `renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })`；`renderer.outputColorSpace = THREE.SRGBColorSpace`；`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`；挂到 `mountRef`。
2. `scene`；`camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 100)`，置于"对坐"视角（如 `(0, 1.4, 2.6)` 看向 `(0,1.2,0)`），营造视频通话的正面构图。
3. 灯光：`AmbientLight` + 一盏 `DirectionalLight`（主光）+ 可选补光。主光颜色/强度留给 B.6 的 mood 钩子。
4. 加载模型：`GLTFLoader` 加载 room.glb、character.glb；成功则 `scene.add(gltf.scene)`，若角色含动画 `clips` 则建 `AnimationMixer` 播放第一个 idle clip。
5. **降级**：任一 glb 加载失败 → 放占位几何体代替（房间＝一块 `PlaneGeometry` 地板 + 几面 `BoxGeometry` 墙；角色＝一个 `CylinderGeometry`+`SphereGeometry` 拼的简易人形），并在角落显示小字 "占位模型——把 glb 放进 public/room/ 即可替换"。**绝不因缺模型而崩或白屏。**
6. `OrbitControls`：Phase 1 建议**锁定**（`enableZoom=false, enablePan=false`，或仅允许很小的水平转动），保持通话构图；留注释说明可解锁。

**渲染循环：**
- `requestAnimationFrame` 循环：`mixer?.update(dt)`；相机做极轻微"呼吸"位移（lerp，幅度很小）模拟手持通话感；`renderer.render`。
- 用 `clock = new THREE.Clock()` 取 dt。

**自适应 + 性能：**
- `ResizeObserver` 监听容器尺寸 → 更新 camera.aspect + `renderer.setSize`。
- `document.hidden` 或窗口失焦时暂停渲染循环（省电），可见时恢复。

**卸载（unmount 必做，防内存泄漏）：**
- 取消 `requestAnimationFrame`；`ResizeObserver.disconnect()`。
- 遍历 scene `traverse`：`geometry.dispose()`、material(s) `dispose()`、贴图 `texture.dispose()`。
- `renderer.dispose()`；`renderer.forceContextLoss?.()`；移除 canvas DOM。
- `controls.dispose()`、`mixer?.stopAllAction()`。

### B.5 与现有状态的接入（轻量）
- RoomWindow 可订阅桌宠快照或 engine 拿 `mood`（参考 PetWindow 用 `listenPetSnapshots`，或直接 `engine`）。Phase 1 只用 mood 驱动灯光（B.6），不做表情/口型（那是有了角色 rig 之后的事，留 Phase 2/3）。

### B.6 Mood → 房间灯光（Phase 1 的"情绪联动"轻量版）
- 复用 `MOOD_TABLE[mood].auraHue / auraIntensity`（已存在于 `src/shared/state/store.ts`）。
- mood 变化时，把主 `DirectionalLight` 与 `AmbientLight` 的 `color`（由 auraHue 经 HSL→RGB 得到一个柔和色温）与 `intensity`（受 auraIntensity 调制）做平滑过渡（用 lerp 在渲染循环里逼近目标值，避免突变）。
- 守卫：强度/色彩限幅，房间始终"看得清"，不要全黑或荧光。低落→偏冷偏暗、开心→暖亮、生气→偏暖强、平静→中性。

### B.7 验收
- [ ] 没有任何 glb 时，打开 RoomWindow 显示占位房间+占位人形+提示，不崩不白屏。
- [ ] 放入 room.glb / character.glb 后自动渲染真实模型；含 idle 动画则循环播放。
- [ ] 窗口可缩放自适应；挂断按钮关闭窗口。
- [ ] 切不同 mood 时房间灯光平滑变化、始终可读。
- [ ] 关闭窗口后无 WebGL 上下文泄漏（dispose 完整；多次开关不爆显存）。
- [ ] `npm run build` 通过。

---

## C. 补完视频背景 stub（v3 遗留小尾巴）

### C.1 现状
v3 的动态背景里，`backgroundKind==='video'` 在 `ChatWindow.tsx` 第 ~1352 行是空壳（"store integration pending, renders nothing"）。图片/粒子已可用。

### C.2 实现
1. **存储**：仿聊天背景图，加角色 `chat_background_video`——
   - `avatarStore`：加 `chatBackgroundVideo: { path, dataUrl }`（视频可能较大，`dataUrl` 用 base64 会臃肿；**改存 path，用 `convertFileSrc` 或自定义协议给 `<video src>`**）。建议新增 Rust 命令 `save_media(role, bytes)` 或复用文件保存 + 返回可访问 URL。最简方案：存进 `app_data_dir/avatars/`，前端用 `@tauri-apps/api/core` 的 `convertFileSrc(path)` 得到 `<video>` 可用的 asset URL（需在 `tauri.conf.json` 开 `assetProtocol` 或用现有机制；若复杂则 Phase 1 先支持选择 `public/` 下预置视频，避免大改）。
   - `is_known_avatar_role` 加 `chat_background_video`。
2. **渲染**：第 ~1352 行 video 分支改为：
   ```tsx
   {appearance.backgroundKind === 'video' && chatBackgroundVideo?.url && (
     <video className="chat-ui__background" src={chatBackgroundVideo.url}
            autoPlay loop muted playsInline aria-hidden="true"
            style={{ filter: `blur(var(--chat-background-blur, 18px))`, objectFit: 'cover' } as CSSProperties} />
   )}
   ```
3. **外观面板**：video 源下加"选择视频"+模糊滑块（复用图片那套交互）。
4. **性能**：失焦/`prefers-reduced-motion` 时 `video.pause()`。

> 若 `convertFileSrc`/assetProtocol 接入成本偏高，**允许 Phase 1 降级**为"仅支持 `public/backgrounds/` 下预置视频的下拉选择"，把任意文件导入留到下一轮。务必在 PR 描述注明采用了哪种。

### C.3 验收
- [ ] 选视频源并指定视频后，聊天背景循环播放、模糊+遮罩生效、文字可读。
- [ ] 失焦暂停；切回其它源正常。

---

## 合并验收 & 红线
- [ ] `npm run build` + `cargo check` 通过；`three`/`@types/three` 已装。
- [ ] "+" 菜单：删两 legacy、加视频通话、链路 main→ChatWindow→ChatPanel 通。
- [ ] RoomWindow 在**无模型**时也能开、占位、可关、不漏显存。
- [ ] mood 灯光平滑且可读；视频背景补完或明确降级。

**红线**
- Three.js 资源**必须**在卸载时完整 dispose（geometry/material/texture/renderer/controls/mixer + cancel RAF），多次开关不得累积显存。
- 缺 glb / 缺视频 / 缺图标都要降级，**绝不白屏或抛未捕获异常**。
- 不实现 Phase 2/3（表情口型、MediaPipe 摄像头、虚拟物品互动）——只在代码里留注释化接入点（角色 rig 参数、摄像头视线 hook、`model3d` 与桌宠共用 loader 的位置）。
- 不动既有 mood/主题/桌宠逻辑的现有行为。

## 建议顺序
A（菜单接线，先把入口和窗口壳打通）→ B（Three.js 场景，含降级，这是大头）→ C（视频背景补尾）。同分支分 commit。

---

## 附：Phase 2/3 预留（不实现，仅记录接入点）
- **Phase 2 表情/姿态**：角色 glb 带 morph targets / 骨骼后，`mood → 表情/动作` 映射（同桌宠 `MOOD_TO_EXPRESSION` 思路）；说话时 `latestAssistantText`/TTS 音量 → 口型。
- **Phase 3 摄像头对视**：`@mediapipe/tasks-vision` FaceLandmarker 在 RoomWindow 底部"摄像头"按钮启用后，取本地摄像头估计用户头/视线 → 驱动角色头眼朝向你（浏览器内、无需服务端）。底部那个占位的摄像头按钮就是它的入口。
- **Phase 4（等技术）**：摄像头理解真实物品并映射到虚拟空间互动——先用脚本化"可交互热点"占位，将来替换为视觉驱动。
- **桌宠共用**：`petVisualStyle` 的 `'model3d'` 启用后，可让 RoomWindow 的角色 loader 复用为全屏桌宠渲染，实现"常驻桌宠形象＝房间里那位"的统一。
