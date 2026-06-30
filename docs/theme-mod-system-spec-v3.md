# 主题/桌宠 系统 增量规格 v3（交付 Claude Code 一次性执行）

> 前置：v1/v2 已落地。当前真实现状（2026-06-29 复核）：
> - 主题 mod：`contract.ts`(CORE/GAME/SHAPE/DREAM tokens)、`loader.ts`、`registry.ts`、`cssGuard.ts`、`builtinThemes.ts`、`ThemePicker.tsx` 均在。
> - 应用内编辑器：`src/windows/chat/components/ChatColorPage.tsx`（色板/分组/新建/保存/应用到日夜）。
> - 用户预设：`src/shared/theme/userPresets.ts`（localStorage `chat.theme.user-presets`，含 `exportPreset`/`importPresetFromJson`）。
> - 桌宠：**已是可插拔风格**——`src/shared/pet/petVisualStyle.ts` 定义 `PetVisualStyle = 'fluid'|'scatter'|'network'`，`load/save/subscribePetVisualStyle`；`PetWindow.tsx` 挂 `<ParticleCanvas snapshot reaction volume/>`；设置项在 `ChatWindow.tsx` 第 383 行「粒子风格」下拉。
> - 情绪链路：`src/shared/state/store.ts` 有 `Mood`(7 种)、`MOOD_TABLE`(含 `auraHue/auraIntensity`)；`ParticleCanvas` 已用 `MOOD_MOTION`/`PALETTES[mood]` 做情绪联动运动+配色；桌宠经 `PetSnapshot`(`shared/pet/bridge` + `types`) 拿到 mood/presence/thinking。
>
> 本 v3 含四块，互相独立、可同分支分 commit：
> A. 修复主题导出（点击无反应的 bug）
> B. 全局动效层（过渡/微交互 token 化 + 推广 Dream 动画）
> C. 动态背景层（粒子/视频背景，复用桌宠渲染）
> D. 情绪联动主题（UI 配色随角色 mood 实时流动）
> E. 可插拔 Live2D/3D 桌宠骨架（先放骨架，模型后补）
>
> 执行原则同前：严格按步骤、以"现状事实"为准、出错 graceful fallback、不白屏。

---

## A. 修复主题导出（必做，bug）

### A.1 根因
`src/shared/theme/userPresets.ts` 的 `exportPreset()` 用 `document.createElement('a')` + `a.download` + `a.click()` 触发下载。**Tauri webview 不支持 programmatic download 属性**，点击静默失败 → "没反应"。且 `URL.revokeObjectURL` 紧跟 `click()` 同步执行，存在竞态。

### A.2 修法（用 Tauri 原生保存对话框 + Rust 写文件）
**步骤 1 — 能力**（`src-tauri/capabilities/default.json`）：在 permissions 数组加 `"dialog:allow-save"`（现仅有 `dialog:allow-open`）。

**步骤 2 — Rust 通用写文件命令**（`src-tauri/src/lib.rs`，仿 `write_avatars_json` 第 677 行）：
```rust
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("写入失败 {path}: {e}"))
}
```
并注册进 `.invoke_handler(tauri::generate_handler![ ... write_text_file ])`。

**步骤 3 — 改写 `exportPreset`**（`userPresets.ts`，改为 async）：
```ts
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

export async function exportPreset(preset: UserThemePreset): Promise<boolean> {
  const json = JSON.stringify(preset, null, 2);
  const safe = preset.name.replace(/[^\w一-龥-]/g, '_') || 'theme';
  const path = await save({
    defaultPath: `${safe}.theme.json`,
    filters: [{ name: 'Theme', extensions: ['json'] }],
  });
  if (!path) return false;                  // 用户取消
  await invoke('write_text_file', { path, contents: json });
  return true;
}
```

**步骤 4 — 调用点**（`ChatColorPage.tsx` 第 216 行 `handleExport`）：
```ts
const handleExport = async () => {
  if (!selectedPreset) return;
  try {
    const ok = await exportPreset(selectedPreset);
    if (ok) { /* 可选：notification 提示已导出 */ }
  } catch (e) { console.warn('[theme] 导出失败:', e); /* 可选：toast 报错 */ }
};
```

### A.3 验收
- [ ] 点「导出 ↓」弹出系统保存对话框，确认后磁盘出现 `<名字>.theme.json`，内容为预设 JSON。
- [ ] 取消对话框无副作用、不报错。
- [ ] 导出的文件能被「导入」按钮重新读入（`importPresetFromJson` 已存在）。

---

## B. 全局动效层

### B.1 现状
- `DreamTokens.css` 有 `--dt-anim-breath/drift/bloom/slow`（仅 Dream 用）。
- `globals.css` `html,body` 已有 `transition: background .4s, color .4s`。
- Chat/Activity 无统一过渡/入场动画。

### B.2 设计
新增一组**动效 token**（加入 `contract.ts` 的 `OPTIONAL_TOKENS`，主题可覆盖，不提供则用默认；不进 REQUIRED，避免给老主题加负担）：

| Token | 默认 | 用途 |
|---|---|---|
| `--motion-fast` | `0.16s` | 按钮/hover |
| `--motion-base` | `0.28s` | 面板/卡片 |
| `--motion-slow` | `0.5s` | 主题切换/大块过渡 |
| `--ease-standard` | `cubic-bezier(0.4,0,0.2,1)` | 通用缓动 |
| `--ease-emphasized` | `cubic-bezier(0.2,0.7,0.2,1)` | 强调/入场 |
| `--motion-scale` | `1` | **全局动效强度系数**，用户可在外观面板设 0（无障碍/性能）→ 1.5 |

`--motion-scale` 思路：所有动画时长写成 `calc(var(--motion-base) * var(--motion-scale))`，用户拉到 0 即关闭所有动画（尊重 `prefers-reduced-motion` 时自动置 0）。

### B.3 实现步骤
1. **contract + 默认**：`contract.ts` 加 `MOTION_TOKENS`，并入 `OPTIONAL_TOKENS`；`globals.css :root{}` 写默认值；`builtinThemes.ts` 的 paper/dark 可选填（不填走默认）。
2. **消息入场动画**：聊天气泡挂载时淡入+轻微上移。在气泡组件（`ChatPanel.tsx` 渲染消息处）加类 `.msg-enter`，CSS：
   ```css
   @keyframes msg-in { from { opacity:0; transform: translateY(6px);} to {opacity:1; transform:none;} }
   .msg-enter { animation: msg-in calc(var(--motion-base) * var(--motion-scale)) var(--ease-emphasized); }
   @media (prefers-reduced-motion: reduce) { .msg-enter { animation: none; } }
   ```
3. **hover/按钮微交互**：在 `UIKit.tsx` 的按钮基样式加 `transition: background calc(var(--motion-fast)*var(--motion-scale)) var(--ease-standard), transform ...`，hover 轻微 `translateY(-1px)`。
4. **主题切换过渡**：切主题时给 `<html>` 临时加类 `.theme-transitioning`（registry.setTheme 时加、800ms 后移除），CSS 对常见表面 `transition: background/color/border-color calc(var(--motion-slow)*var(--motion-scale))`。
5. **外观面板**：加「界面动效」滑块（0–1.5，步进 0.1）写入 `--motion-scale`（持久化到 `chat.appearance` 或新键 `chat.motionScale`）。读 `prefers-reduced-motion`，命中则默认 0。

### B.4 验收
- [ ] 新消息淡入；按钮 hover 有过渡；切主题时颜色平滑过渡不闪。
- [ ] 动效滑块拉到 0 全部静止；系统开启「减少动态效果」时默认静止。
- [ ] 主题可通过覆盖 motion token 改节奏（如做一套"克制"主题）。

---

## C. 动态背景层

### C.1 现状
- v2 已加聊天静态背景图 + 模糊（`.chat-ui__background`）。
- 桌宠 `ParticleCanvas` 是成熟的 canvas 粒子渲染（fluid/scatter/network），自带 mood 联动。

### C.2 设计（两种动态背景，主题/用户可选）
扩展聊天背景为「背景源」概念，存于 `chatAppearance`（加 `background: { kind: 'none'|'image'|'particles'|'video'; ... }`）：
- `image`：v2 已有（保留）。
- `particles`：复用 `ParticleCanvas` 作为**全屏低透明度背景层**（独立于桌宠窗口），跟随 mood 漂动。把 ParticleCanvas 抽成可在 Chat 背景中复用的渲染（见 E 的渲染抽象，二者协同）。
- `video`：循环播放本地视频（mp4/webm）。新增角色 `chat_background_video` 走 avatarStore 同款存储（Rust 白名单加该角色；或单独存路径）。`<video autoplay loop muted playsinline>` 铺底 + `filter: blur(var(--chat-background-blur))`。

### C.3 实现步骤
1. **chatAppearance**：`ChatAppearance` 加 `backgroundKind: 'none'|'image'|'particles'|'video'`（默认按是否有图推断，兼容旧值）；video 源沿用 avatar 存储机制。
2. **渲染**：`ChatWindow.tsx` 第 848 行 `bodyRef` 容器内按 `backgroundKind` 条件渲染：image→现有 div；particles→`<ParticleBackground/>`(薄封装 ParticleCanvas，订阅 engine snapshot，透明度低、pointerEvents none、zIndex 0)；video→`<video class="chat-ui__background" .../>`。
3. **外观面板**：背景区加来源选择（无/图片/粒子/视频）+ 各自参数（图片：上传+模糊；粒子：复用粒子风格；视频：选文件+模糊+暗度）。
4. **性能护栏**：粒子/视频背景在窗口失焦或 `prefers-reduced-motion` 时降帧/暂停（`document.hidden` 或 IntersectionObserver；视频 `pause()`）。

### C.4 验收
- [ ] 三种来源可切换并即时生效；切回"无"恢复纯色。
- [ ] 粒子背景跟随 mood 漂动；视频循环不卡顿、失焦暂停。
- [ ] 背景始终在内容下层、文字可读（沿用遮罩）。

---

## D. 情绪联动主题（你独有的方向）

### D.1 现状（联动管道已存在，缺的是"驱动 UI 配色"）
- `engine`(StateEngine) 持 `EngineState.mood`，`engine.get()` / `engine.subscribe(fn)` 可订阅（ChatWindow 已用）。
- `MOOD_TABLE[mood].auraHue / auraIntensity` 已是"情绪→色相/强度"的现成映射。
- 桌宠已据 mood 改运动与配色——本特性把同样的联动延伸到**整窗 UI 主题变量**。

### D.2 设计
做成**叠加层（overlay），不改用户选定的主题**——在当前主题之上，按 mood 对一小撮关键变量做有限度的偏移，可开关、可调强度。
- 受影响变量（克制，避免辣眼）：`--accent`、`--accent-2`、`--forest`/`--forest-2`（侧栏氛围）、`--paper-grain-*`（纹理氛围）。**不动** `--ink`(正文)、`--paper`(主背景) 以保证可读性。
- 每个 mood 定义一个「氛围偏移」：色相目标 + 强度（复用/对齐 `MOOD_TABLE` 的 auraHue）。例：
  - 平静→中性（无偏移）；开心→暖橙微提亮；低落→冷蓝压饱和；病娇→accent 偏红、grain 微红；生气→accent 升温+强度↑；惊讶→accent 提亮；分心→微紫、对比降。
- 偏移用 oklch 在主题原值基础上调 hue/chroma/lightness 的**相对量**（不是替换成固定色），这样任何主题都能联动而不破风格。
- 平滑：mood 变化时用 `--motion-slow`（依赖 B 的动效）过渡，避免突变。

### D.3 实现步骤（新建 `src/shared/theme/moodReactive.ts`）
1. **偏好**：`chat.appearance` 加 `moodReactive: { enabled: boolean; intensity: number /*0–1*/ }`，默认 `{enabled:false, intensity:0.5}`（默认关，避免惊到用户）。
2. **映射表**：`MOOD_THEME_SHIFT: Record<Mood, { hueShift:number; chromaMul:number; lightMul:number; targetVars:string[] }>`，对齐 `MOOD_TABLE` 语义。
3. **计算器**：`computeMoodOverrides(baseTokens, mood, intensity)` → 返回 `Record<varName, string>`（对 targetVars 用 oklch 重算）。需要一个把主题 token 值（可能是 oklch/hex）解析成 oklch 分量再回写的小工具（CSS Color 4 / 手写 oklch 解析；hex 先转 oklch）。
4. **应用**：在 `registry`/一个顶层 hook 里订阅 `engine`，mood 变化时若 `enabled`：`computeMoodOverrides` → 用 loader 的 `setProperty` 把覆盖写到 `:root`（用独立 appliedKeys 集合，名为 mood-overlay，切主题/关开关时清理，**不与主题基础变量互相污染**）。
5. **外观面板**：加「情绪联动」开关 + 强度滑块，附一句说明"界面会随她的情绪轻微变化"。
6. **护栏**：intensity 上限钳制（如 hueShift ≤ ±25、chromaMul ∈ [0.6,1.4]），保证再强也不破可读性。

### D.4 验收
- [ ] 开启后，切换/收到不同 mood 时 accent 与侧栏氛围平滑偏移；正文与主背景不动、始终可读。
- [ ] 关闭后立即回到纯主题、无残留覆盖。
- [ ] 任意主题（含用户自建/mod）开启联动都不破风格。
- [ ] 强度 0 ≈ 无变化，强度 1 明显但不辣眼。

---

## E. 可插拔 Live2D/3D 桌宠骨架（先放骨架）

### E.1 现状
- 风格在 `petVisualStyle.ts`：`'fluid'|'scatter'|'network'`。
- `PetWindow.tsx` 直接挂 `<ParticleCanvas snapshot reaction volume/>`，三种粒子风格在 ParticleCanvas 内部按 `styleRef.current` 分支绘制（同一 canvas 2D 循环）。
- 输入契约已经现成：`PetSnapshot`(mood/presence/thinking/activityText/latestAssistantText...)、`reaction`(鼠标交互，来自 `usePetMouse`)、`volume`(麦克风)。

### E.2 设计目标
不实现具体 Live2D 渲染（模型未就绪），但把**渲染层抽象出来**，让未来塞 Live2D/3D 只是"加一个实现 + 一个选项"，不动上层。粒子三风格仍走 ParticleCanvas；Live2D/3D 作为**独立渲染组件**并列。

### E.3 实现步骤
1. **扩展风格类型**（`petVisualStyle.ts`）：
   ```ts
   export type PetVisualStyle = 'fluid' | 'scatter' | 'network' | 'live2d';
   // 预留但暂不开放：'model3d'（视频电话/虚拟空间用，见 §F）
   ```
   `validate` 接受 `live2d`；3d 暂不加入选项。
2. **定义渲染契约**（新建 `src/shared/pet/petRenderer.ts`）：
   ```ts
   import type { PetSnapshot } from './types';
   export interface PetRendererProps {
     snapshot: PetSnapshot;            // mood/presence/thinking/text...
     reaction?: PetMouseReaction | null;
     volume?: number;                  // 0–1，可驱动口型
   }
   export type PetRenderer = React.FC<PetRendererProps>;
   ```
3. **渲染分发组件**（新建 `src/windows/pet/components/PetStage.tsx`）：
   ```tsx
   // 读 loadPetVisualStyle()，订阅 subscribePetVisualStyle
   // style ∈ {fluid,scatter,network} → <ParticleCanvas .../>
   // style === 'live2d'               → <Live2DStage .../>
   ```
   `PetWindow.tsx` 把第 121 行 `<ParticleCanvas .../>` 换成 `<PetStage snapshot={snapshot} reaction={reaction} volume={...}/>`。粒子行为零变化。
4. **Live2D 骨架占位**（新建 `src/windows/pet/components/Live2DStage.tsx`）：实现 `PetRenderer` 接口，但**先只渲染占位**（一个标注 "Live2D 待接入" 的容器 + 把 snapshot.mood/volume 打到 dataset 便于调试）。在文件顶部用注释写清三个集成点：
   - **模型加载**：预留 `loadModel(path)`，建议 `pixi-live2d-display` + Cubism Core（后续 `npm i` + 放 runtime）。模型文件放 `public/live2d/<name>/`，仿 themes/fonts 的资源约定。
   - **情绪→表情/动作**：`snapshot.mood` → 表情参数/motion（给一张 `MOOD_TO_EXPRESSION` 空映射表占位）。
   - **注视/口型**：`reaction`/鼠标 → 头与眼追踪；`volume` → 嘴开合（lip-sync）。给出参数名占位（`ParamAngleX/Y`、`ParamEyeBallX/Y`、`ParamMouthOpenY`）。
5. **设置项**（`ChatWindow.tsx` 第 389 行下拉）：加 `<option value="live2d">Live2D（实验）</option>`。选中且无模型时，`Live2DStage` 显示占位提示而非崩溃。
6. **不引入重依赖**：本期**不** `npm i` Live2D 运行库，只放骨架与注释化集成点；真正接模型时再装。骨架要保证 `tsc`/build 通过。

### E.4 验收
- [ ] 粒子三风格行为与现状完全一致（PetStage 透明转发）。
- [ ] 选 "Live2D（实验）" 桌宠窗显示占位、不报错、不白屏；切回粒子正常。
- [ ] `petRenderer.ts` 契约清晰，`Live2DStage` 三个集成点注释明确。
- [ ] build 通过，未新增运行时重依赖。

---

## F.（非实现，仅记录）远期：视频电话 + 虚拟空间 构想与可行路径

> 用户构想：给角色建模一个小房间作为虚拟空间，以"视频电话"形式呈现，让人感觉她在那个空间里；她还能用摄像头与空间内物品互动。承认目前做不到、在等技术。这里只留路线，不实现。

我的拆解（按可行性从近到远，便于将来分阶段做；与 §E 的 `model3d` 预留对接）：

1. **静态房间 + 模型在内（近期可做）**：Three.js（你的 React 栈可直接用）渲染一个预建房间(glb)，放入角色模型(Live2D 贴面板 or 3D glb)，加 idle 待机动画 + 摄像机轻微呼吸位移。以一个独立窗口（仿 `toy`/`pet` 窗口）"视频电话"边框样式呈现。这一步**不需要 AI**，纯前端 3D，等 §E 的渲染抽象就位后是自然延伸（新增 `model3d` 风格 / 独立 RoomWindow）。

2. **情绪/状态驱动场景（中期）**：复用你的 mood/state 后端——房间光线、角色姿态随 mood 变（和 §D 同源）。例如低落→房间转暗、她蜷在角落；开心→暖光。这是你已有数据的自然外延。

3. **摄像头"她看着你"（中期偏远）**：取用户摄像头帧，用 MediaPipe FaceLandmarker（浏览器内、无需服务端）做人脸/视线检测，驱动角色头眼朝向你——做出"视频对视"的临场感。这部分技术**现在就成熟**，是性价比意外高的一环。

4. **她用摄像头理解空间并与物品互动（远期，等技术）**：这步才是真难点——需要视觉模型理解摄像头画面里的真实物品、再映射到虚拟空间做出反应。属于多模态实时理解 + 空间映射，目前消费级本地难稳定。建议**等**，先把 1–3 做扎实，接口留好（房间里的"可交互物品"先用脚本化热点占位，将来替换成视觉驱动）。

一句话：你"现在做不到"的其实只有第 4 步；1–3 在你现有架构上是可达的，而且每步都复用你已有的 mood 后端与即将抽象的渲染层。真要起步，从"独立 RoomWindow + Three.js 静态房间 + Live2D/3D 模型 + MediaPipe 视线"这条线切入最稳。

---

## 合并验收 & 红线
- [ ] `npm run build` 与 `cargo check` 通过；`write_text_file` 已注册、`dialog:allow-save` 已加。
- [ ] 导出弹保存框并成功落盘；导入回读正常。
- [ ] 动效可调可关、尊重 reduced-motion；动态背景三源可切、失焦暂停。
- [ ] 情绪联动默认关、开启平滑不破可读性、关闭无残留。
- [ ] 桌宠粒子三风格零回归；Live2D 选项占位不崩；无新增运行时重依赖。

**红线**：不动既有契约语义（只追加 token）；情绪联动只做叠加层、永不改正文/主背景可读性变量；Live2D 本期只放骨架不接真模型不装重库；所有新功能默认值保证"视觉/行为零回归"；任一新特性出错都 fallback，不白屏。

### 建议顺序
A（修 bug，最急）→ B（动效，给 C/D 提供过渡基建）→ E（桌宠渲染抽象）→ C（动态背景，复用 E）→ D（情绪联动，依赖 B 的过渡）。可同分支多 commit。
