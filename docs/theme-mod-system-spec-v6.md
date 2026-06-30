# 视频通话 设置面板 + 视角修复 规格 v6（交付 Claude Code 一次性执行）

> 接 v5（Phase 2 形态键 + 自适应构图已落地）。本轮目标：把手调参数从「改 json / 改代码」搬进设置面板（滑块 + 预设），模型/场景改为「扫描文件夹自选」，并修掉视角拖拽 bug、加「自由视角」模式。
>
> 本 v6 含：
> A. 修复 OrbitControls 拖拽 bug（怎么拖都"拉近"）+ 默认锁定通话视角
> B. 房间设置 store（单一事实来源，localStorage + 订阅，RoomWindow 实时响应）
> C. 模型/场景「扫描文件夹自选」（Rust 扫描命令，仿字体）
> D. 偏好面板新增「视频通话」tab（滑块可拖可输入 + 预设保存/选择/删除）
> E. 「自由视角」模式 + 「保存当前视角」（即用户想要的 3D 软件式调视角）
>
> 关键现状：
> - 视角/构图：`src/windows/room/useRoomScene.ts`，`applyFraming()`（第 93–108 行）按 framing 模式摆相机；OrbitControls 配置在第 221–227 行：`enableZoom=false`、`enablePan=false`、azimuth 夹在 `±0.25`、polar 夹在窄带 → 拖拽只能在小锥角里转，视觉上像忽近忽远且不对称，就是用户说的 bug。
> - 模型加载：硬编码 `/room/scene/room.glb`、`/room/character/character.glb`。归一化/构图参数来自 `public/room/character/character.json`（v5）。
> - 偏好面板：`ChatWindow.tsx` 内 `PreferencesPanel`，tab 数组在第 187–193 行：`1 外观 / 2 色彩自定义 / 3 世界 / 4 桌宠 / 5 对话 / 6 其他`，tab state union 在第 93 行。
> - 字体扫描先例：Rust `list_dream_fonts`（`lib.rs`），扫 `public/fonts`（dev）/ resource_dir（prod），前端 `invoke('list_dream_fonts')`。**模型/场景自选照抄此模式。**
> - 资源打包：`tauri.conf.json` `resources` 现含 `"../public/fonts/"`、`"../public/themes/"`。
>
> 原则：graceful（缺文件/缺预设/缺配置都降级）、不破坏 v4 修好的 refs 初始化顺序、卸载 dispose 完整。

---

## A. 修复视角拖拽 bug + 默认锁定

### A.1 根因
`enableZoom=false` 时拖拽＝旋转，但 azimuth/polar 被夹在极窄且不对称的范围（`±0.25` / `π/2-0.2 ~ π/2+0.1`），于是拖拽只在小锥角里转，主体视觉缩放感不对称 → "怎么拖都拉近、回不去"。这个半残的微转动既无用又困惑。

### A.2 修法
默认**完全锁定**通话视角（拖拽不再改变画面）：
```ts
controls.enableZoom   = false;
controls.enablePan    = false;
controls.enableRotate = false;   // ← 新增：默认锁死，消除 bug
```
保留 OrbitControls 实例（自由视角模式 E 会临时启用）。相机位姿完全由 framing/预设决定（见 B/E）。

### A.3 验收
- [ ] 默认进入通话窗，鼠标拖拽不再让画面忽近忽远（画面稳定锁定）。

---

## B. 房间设置 store（单一事实来源）

### B.1 设计
新建 `src/shared/room/roomSettings.ts`：localStorage 持久化 + 订阅，RoomWindow 与设置面板都读它；`character.json` 仅作**首次默认兜底**（store 无值时读一次）。
```ts
export interface RoomSettings {
  characterFile: string;   // 相对 public/room/character/，默认 'character.glb'
  sceneFile: string;       // 相对 public/room/scene/，默认 'room.glb'
  framing: 'face' | 'upperBody' | 'full';
  scaleMul: number;        // 0.2–3
  offset: [number, number, number];
  yawDeg: number;          // -180–180
  customView: { pos: [number,number,number]; target: [number,number,number] } | null; // 自由视角保存的位姿，非空时覆盖 framing
}
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  characterFile: 'character.glb', sceneFile: 'room.glb',
  framing: 'upperBody', scaleMul: 1, offset: [0,0,0], yawDeg: 0, customView: null,
};
```
- `loadRoomSettings()` / `saveRoomSettings()` 用现成 `getUIPref/setUIPref`（key `room.settings`）。
- `subscribeRoomSettings(fn)`：值变化时通知（同窗用回调集合 + 跨窗用 `storage` 事件，参考 `petVisualStyle.ts` 的 subscribe 写法）。
- 字段 clamp/校验（scaleMul 0.2–3、yawDeg -180–180、framing 枚举、offset 数字）。
- 迁移：store 无值时，尝试 `fetch('/room/character/character.json')` 读旧默认填充一次（兜底，失败用 DEFAULT）。

### B.2 RoomWindow 接入
- `RoomWindow.tsx` 用 state 持有 `roomSettings`，`useEffect` 订阅 `subscribeRoomSettings` 实时更新，传进 `useRoomScene`。
- `useRoomScene` 依赖项加入相关设置：设置变化时**重建或更新**场景——
  - 改 `characterFile`/`sceneFile` → 重新加载对应 glb（重建模型部分即可，不必整窗重建）。
  - 改 `framing`/`scaleMul`/`offset`/`yawDeg`/`customView` → 重新跑归一化 + 构图（轻量，无需重载模型）。
  - 实现可简化为：把这些设置作为 hook 入参，变化时在一个 effect 里重算归一化与相机；模型文件名变化单独触发重载。务必保持 dispose 正确，避免泄漏。

---

## C. 模型/场景「扫描文件夹自选」（仿字体）

### C.1 Rust 扫描命令（`src-tauri/src/lib.rs`，仿 `list_dream_fonts`/`list_themes`）
```rust
// 扫 public/room/<kind> 下的 .glb/.gltf，返回 [{fileName,label}]
#[tauri::command]
fn list_room_assets(app: tauri::AppHandle, kind: String) -> Result<serde_json::Value, String>
```
- `kind` ∈ `"character"|"scene"`（其它值报错）。
- 目录解析仿 `dream_fonts_dir`：prod 用 `resource_dir().join("room").join(kind)`，dev fallback `<项目根>/public/room/<kind>`。
- 过滤扩展名 `glb|gltf`，`label` 取 file_stem，按名排序。
- 注册进 `generate_handler!`。
- **资源打包**：`tauri.conf.json` 的 `resources` 追加 `"../public/room/": "room/"`（让 prod 可扫描；glb 经 Vite public 拷贝到 dist 仍按 `/room/...` URL 加载，二者并存，与字体同模式）。

### C.2 前端 helper（`src/shared/room/roomAssets.ts`）
```ts
export interface RoomAsset { fileName: string; label: string; }
export async function listRoomCharacters(): Promise<RoomAsset[]> { return invoke('list_room_assets', { kind: 'character' }); }
export async function listRoomScenes(): Promise<RoomAsset[]> { return invoke('list_room_assets', { kind: 'scene' }); }
```

### C.3 useRoomScene 去硬编码
- 加载路径改为 `/room/character/${encodeURIComponent(settings.characterFile)}`、`/room/scene/${encodeURIComponent(settings.sceneFile)}`（`encodeURIComponent` 兼容中文名如 `全身.glb`）。
- 加载失败仍走 v4/v5 的占位降级。

---

## D. 偏好面板新增「视频通话」tab

### D.1 tab 调整（`ChatWindow.tsx` 第 93 行 union + 187–193 行数组）
- union 加 `'call'`（或 `'room'`）。
- tab 数组：在 `['other','6','其他']` 之前插入 `['call','6','视频通话']`，并把 `other` 改为 `'7'`：
  ```
  ['appearance','1','外观'], ['color','2','色彩自定义'], ['world','3','世界'],
  ['pet','4','桌宠'], ['chat','5','对话'], ['call','6','视频通话'], ['other','7','其他'],
  ```
- 渲染分支加 `tab === 'call' ? <CallSettingsPage/> : ...`。
> 备注：此 tab 以后 Live2D 等模型设置也放这里（用户意图）。命名用「视频通话」。

### D.2 CallSettingsPage 内容（建议抽成 `src/windows/chat/components/CallSettingsPage.tsx`）
读写 `roomSettings`，每项改动即时 `saveRoomSettings`（触发 store 订阅 → RoomWindow 实时变）。控件：
1. **角色模型**：下拉，选项来自 `listRoomCharacters()`；当前值 `characterFile`；附"默认 character.glb"说明。
2. **场景模型**：下拉，选项来自 `listRoomScenes()`；当前值 `sceneFile`。
3. **构图**：下拉 `露脸/半身/全身`（face/upperBody/full）。
4. **缩放微调** `scaleMul`：滑块（0.2–3，步进 0.01）**+ 数字输入框**（两者双向绑定，可拖可输）。
5. **位置偏移** `offset[x/y/z]`：三个滑块 + 数字框（范围如 -1–1，步进 0.01）。
6. **朝向** `yawDeg`：滑块 + 数字框（-180–180）。
7. **重置**：一键恢复 `DEFAULT_ROOM_SETTINGS`。
8. **预设区**：见 D.3。
9. **自由视角 + 保存当前视角**：见 E（按钮放这里或放 RoomWindow 内，二选一，推荐两处都有入口）。

> 复用现有 `PrefRow` / `PrefRange` 组件保持风格统一；数字输入框新写一个小受控 input 即可。

### D.3 预设（仿主题 `userPresets.ts`）
新建 `src/shared/room/roomPresets.ts`：
```ts
export interface RoomPreset { id: string; name: string; settings: RoomSettings; }
// loadRoomPresets/saveRoomPresets（localStorage key 'room.presets'）
// createPresetFromCurrent(name)、applyPreset(id)、deletePreset(id)
```
UI：下拉「选择预设」+「新建（输入名，存当前设置）」+「删除」+（可选）导出/导入（复用 v3 的 `save()`+`write_text_file` 与文件读入，沿用主题预设那套）。选预设即把其 settings 写入 store。

### D.4 验收
- [ ] 「视频通话」tab 出现在第 6 位，「其他」变第 7。
- [ ] 角色/场景下拉列出 `public/room/character`、`public/room/scene` 下所有 glb，可切换并即时换模型/场景。
- [ ] 缩放/偏移/朝向滑块可拖、数字框可输，RoomWindow 实时跟着变。
- [ ] 预设可保存、选择、删除；选预设即时应用。
- [ ] 重置恢复默认。

---

## E. 自由视角模式 + 保存当前视角（用户想要的"3D 软件式调视角"）

### E.1 自由视角开关
- 在 `roomSettings` 临时态或 RoomWindow 局部 state 加 `freeLook: boolean`（不必持久化；属于"调整时"的临时模式）。
- 开启时：`controls.enableRotate = true; controls.enableZoom = true; controls.enablePan = true;` 并放开角度/距离限制（azimuth/polar 设 `-Infinity/Infinity` 或宽范围，`minDistance/maxDistance` 给合理范围）；关闭时恢复 A.2 的全锁定并把相机拉回当前 framing/customView。
- 入口：CallSettingsPage 一个开关，或 RoomWindow 底部控制条加一个"🔧 调整视角"按钮（推荐后者，所见即所得）。开启时可显示提示"拖拽旋转、滚轮缩放"。

### E.2 保存当前视角
- 自由视角下用户摆好后，点「保存当前视角」：读 `camera.position` 与 `controls.target`，写入 `roomSettings.customView = { pos:[...], target:[...] }` 并 `saveRoomSettings`。
- `applyFraming` 逻辑改为：**若 `customView` 非空，直接用它摆相机**（`camera.position.set(...pos); controls.target.set(...target); camera.lookAt(target); controls.update()`）；否则按 framing 模式计算（v5 逻辑）。
- 「清除自定义视角」按钮把 `customView` 置 null，回到 framing 模式。

### E.3 验收
- [ ] 开「自由视角」可像 3D 软件那样自由旋转/缩放/平移查看模型。
- [ ] 「保存当前视角」后关掉自由视角，画面停在所保存机位；重开窗口仍是该机位。
- [ ] 「清除自定义视角」恢复按 framing 模式构图。
- [ ] 切预设包含/不包含 customView 都正确。

---

## 合并验收 & 红线
- [ ] `npm run build` + `cargo check` 通过；`list_room_assets` 已注册、`resources` 含 room。
- [ ] 默认通话视角锁定、拖拽 bug 消失。
- [ ] 角色/场景文件夹自选可用，character.glb/room.glb 仅作默认。
- [ ] 设置面板滑块/数字/预设/自由视角/保存视角全可用且 RoomWindow 实时响应。
- [ ] 切换模型/场景与改参数时 dispose 正确，多次操作不爆显存。

**红线**
- 不重新引入 v4 修好的 refs 初始化顺序问题；不破坏 v5 的形态键驱动与归一化逻辑。
- 模型/场景一律「扫描自选」，**不得在代码里硬编码文件名**（character.glb/room.glb 只能作为 store 默认值出现）。
- 缺文件/缺预设/缺配置一律降级，不白屏不抛未捕获异常。
- 自由视角是临时调整态；关闭后通话视角必须回到锁定。

## 建议顺序
A（修 bug，最快见效）→ B（设置 store）→ C（扫描自选）→ D（设置面板 + 预设）→ E（自由视角 + 保存视角）。同分支分 commit。

---

## 附：下一步预告（不在本轮）
本轮做完，调参与选模型就完全图形化了。再往后是 **Phase 3：摄像头对视**（`@mediapipe/tasks-vision` FaceLandmarker 驱动角色头眼朝向你），入口就是底部那个一直占位的摄像头按钮——也就是你说的"继续做功能加映射和回应"的下一站。
