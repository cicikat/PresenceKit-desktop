# 视频通话虚拟空间 Phase 2 规格 v5（交付 Claude Code 一次性执行）

> 接 v4。Phase 1 的 RoomWindow 已能渲染用户自建 glb（`public/room/scene/room.glb`、`public/room/character/character.glb`）。当前问题与需求（用户反馈）：
> 1. 角色播放了 glb 内置动画——**不要**，改用**形态键(morph target / shape key)驱动**。
> 2. 角色大小对不上、相机对着房间下半截、角色位置无法调整——**因为 Phase 1 没做任何归一化，相机写死**。需要自动适配。
> 3. 用户有两个角色文件：`character.glb`(半身，无骨骼，纯形态键雕刻，现用)、`全身.glb`(全身)。需要可切换 + 各自合适构图。
> 4. 用户现有形态键：头发飘动、笑、闭眼。问命名规范——本规格给**标准命名**，用户回 Blender 改名；代码**按名读取、缺失即跳过**，可增量补。
>
> 本 v5 含：
> A. 模型自动归一化 + 自动构图 + per-model 配置
> B. 停用内置动画，建立形态键驱动系统
> C. 形态键命名规范 +（给用户的）待建表情/口型清单
> D. mood → 表情形态键映射
> E. idle（头发飘动 + 眨眼）与说话口型
> F. 收尾：补完 v3 遗留的视频背景 stub
>
> 现状文件：`src/windows/room/useRoomScene.ts`（Three.js 场景 hook）。模型加载在第 160–173 行，第 163–166 行播放 `gltf.animations[0]`（**本期删除**）。相机固定 `(0,1.4,2.6)` 看 `(0,1.2,0)`。
> 原则：graceful（缺模型/缺形态键/缺配置都要降级不崩）、卸载 dispose 完整、不破坏 v4 已修好的初始化顺序。

---

## A. 模型自动归一化 + 自动构图 + per-model 配置

### A.1 为什么要做
现在 `scene.add(gltf.scene)` 原样加载、相机写死，所以导出尺度 = 屏幕大小，且全身模型超出固定相机视野（只见脚）。解决：加载后量包围盒 → 归一化尺度 → 重新居中（脚踩 y=0、水平居中）→ 按"构图模式"自动摆相机。

### A.2 配置文件（可选）`public/room/character/character.json`
```json
{
  "model": "character.glb",
  "framing": "full",
  "scaleMul": 1.0,
  "offset": [0, 0, 0],
  "yawDeg": 0
}
```
- `model`：要加载的文件名（相对 `public/room/character/`）。**建议把 `全身.glb` 重命名为 `full.glb`**（中文名在 URL 需转义，麻烦）；若坚持中文名，loader 必须 `encodeURIComponent`。
- `framing`：`'face' | 'upperBody' | 'full'`。半身模型用 `full`（整体入镜＝头到胸的肖像）；全身模型用 `upperBody`（裁掉腿）。
- `scaleMul`：归一化后再乘的手动微调系数（默认 1）。
- `offset`：`[x,y,z]` 归一化后再平移（微调位置）。
- `yawDeg`：角色绕 Y 轴旋转角度（让她稍微侧身朝向你）。
- **配置缺失/字段缺失全部走默认**：`model='character.glb'`、`framing='upperBody'`、`scaleMul=1`、`offset=[0,0,0]`、`yawDeg=0`。loader 先 `fetch('/room/character/character.json')`，404 就用默认。

### A.3 归一化算法（替换现有 `scene.add(gltf.scene)` 那段）
加载成功后，对 `gltf.scene`（记为 `model`）：
```
const TARGET_H = 1.6;                       // 归一化目标高度（米）
let box = new THREE.Box3().setFromObject(model);
let size = box.getSize(new THREE.Vector3());
const s = (TARGET_H / size.y) * cfg.scaleMul;
model.scale.setScalar(s);
model.rotation.y = THREE.MathUtils.degToRad(cfg.yawDeg);
// 重新量（缩放后）
box = new THREE.Box3().setFromObject(model);
const center = box.getCenter(new THREE.Vector3());
model.position.x += -center.x + cfg.offset[0];
model.position.z += -center.z + cfg.offset[2];
model.position.y += -box.min.y + cfg.offset[1];   // 脚/底边踩 y=0
scene.add(model);
```
> 归一化后模型恒为约 1.6 单位高、底边在 y=0、水平居中。任何导出尺度都统一。

### A.4 自动构图（替换写死的相机）
归一化后按 `framing` 摆相机（垂直视野适配）：
```
const FOV = 45;                                   // camera fov，保持 45
const frameByMode = { face: 0.42, upperBody: 0.95, full: 1.75 };  // 取景高度(米)
const centerByMode = { face: 1.45, upperBody: 1.15, full: 0.85 }; // 取景中心 y
const frameH = frameByMode[cfg.framing] ?? 0.95;
const cy = centerByMode[cfg.framing] ?? 1.15;
const dist = (frameH / 2) / Math.tan(THREE.MathUtils.degToRad(FOV) / 2) + 0.15;
camera.fov = FOV; camera.updateProjectionMatrix();
camera.position.set(0, cy, dist);
camera.lookAt(0, cy, 0);
controls.target.set(0, cy, 0);                    // OrbitControls 锁定围绕取景中心
controls.update();
```
> 相机距离由取景高度反推，subject 始终满构图、居中。窗口很宽时主体仍居中（以垂直视野为准）。锁定的微转动(v4 已设)继续生效。

### A.5 验收
- [ ] 半身/全身两个模型不改代码、仅改 `character.json` 的 `model`/`framing` 即可正确入镜，大小一致、居中、不再只见脚。
- [ ] `scaleMul`/`offset`/`yawDeg` 能实时微调（改 json 重载窗口生效）。
- [ ] 无 `character.json` 时用默认值正常显示。

---

## B. 停用内置动画 + 建立形态键驱动

### B.1 停用内置动画
删除 `useRoomScene.ts` 第 163–166 行播放逻辑（`mixer = new THREE.AnimationMixer(...)` + `clipAction(...).play()`）。**不再创建/播放 AnimationMixer**（角色无骨骼、纯形态键）。相应清理里与 mixer 有关的可一并移除（保留对 room 的处理）。

### B.2 形态键访问层（新建 `src/windows/room/morphController.ts`）
```ts
import * as THREE from 'three';

export interface MorphTarget { mesh: THREE.Mesh; index: number; }

export class MorphController {
  private map = new Map<string, MorphTarget[]>();
  private current = new Map<string, number>();   // 平滑用的当前值

  constructor(root: THREE.Object3D) {
    root.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      const dict = (mesh as any).morphTargetDictionary as Record<string, number> | undefined;
      if (mesh.isMesh && dict && mesh.morphTargetInfluences) {
        for (const [name, index] of Object.entries(dict)) {
          if (!this.map.has(name)) this.map.set(name, []);
          this.map.get(name)!.push({ mesh, index });
        }
      }
    });
  }

  has(name: string): boolean { return this.map.has(name); }
  names(): string[] { return [...this.map.keys()]; }

  /** 立即设置（0–1，自动 clamp） */
  set(name: string, value: number): void {
    const v = Math.max(0, Math.min(1, value));
    const targets = this.map.get(name);
    if (!targets) return;                          // 缺失即跳过，不报错
    for (const t of targets) t.mesh.morphTargetInfluences![t.index] = v;
    this.current.set(name, v);
  }

  /** 朝目标平滑逼近（在渲染循环里调用） */
  lerp(name: string, target: number, speed: number): void {
    if (!this.map.has(name)) return;
    const cur = this.current.get(name) ?? 0;
    this.set(name, cur + (Math.max(0, Math.min(1, target)) - cur) * speed);
  }
}
```
加载角色成功后构造一次：`morphRef.current = new MorphController(model)`。**开发期建议 `console.log(morph.names())`** 让用户核对自己 Blender 里的形态键名是否对得上规范。

---

## C. 形态键命名规范（用户回 Blender 改名用）

> Blender 里把对应 **Shape Key 的名字**改成下列字符串（**大小写敏感**），导出 glTF 时确保勾选导出 Shape Keys 及其名称。代码按名读取、缺失跳过，可增量补。

### C.1 核心四个（建议先保证这四个）
| 规范名 | 含义 | 用户现有 | 动作 |
|---|---|---|---|
| `blink` | 双眼闭合 | 闭眼 ✓ | 改名为 `blink` |
| `smile` | 微笑/开心嘴型 | 笑 ✓ | 改名为 `smile` |
| `hairSway` | 头发飘动（满值=最大幅度） | 头发飘动 ✓ | 改名为 `hairSway` |
| `mouthOpen` | 嘴/下巴张开（说话用） | —— | **请新建这个** |

### C.2 表情扩展（可选，做了就有更全的情绪覆盖；没做则自动回退）
`sad`（难过/嘴角下垂）、`angry`（生气/皱眉收嘴）、`surprised`（惊讶/张嘴瞪眼）、`eyesWide`（睁大）、`blush`（脸红，用于"病娇"）、`browDown` / `browUp`（眉毛）。

### C.3 口型进阶（可选，想要更像说话再做；否则只用 `mouthOpen`）
`visemeAa`、`visemeIh`、`visemeOu`（三个基础口型）。本期默认只用 `mouthOpen`，visemes 留待将来。

> 给用户的话：**最少补一个 `mouthOpen` 就够 Phase 2 跑**（说话时开合）。表情想丰富就按 C.2 加 `sad`/`angry`/`surprised`，对应"低落/生气/惊讶"三种 mood；不加也能用（回退见 D）。

---

## D. mood → 表情形态键映射

### D.1 映射表（`src/windows/room/morphExpressions.ts`）
每个 mood 给一组目标形态键权重；**带 fallback**（首选形态键不存在时退到核心四个能表达的近似）。
```ts
import type { Mood } from '../../shared/state/store';
// 每项: { 首选: Record<name,weight>, 回退: Record<name,weight> }
export const MOOD_MORPHS: Record<Mood, { primary: Record<string,number>; fallback: Record<string,number> }> = {
  '平静': { primary: {},                          fallback: {} },
  '开心': { primary: { smile: 0.85 },             fallback: { smile: 0.85 } },
  '低落': { primary: { sad: 0.7 },                fallback: { smile: 0.0, blink: 0.22 } },   // 半阖眼表低落
  '病娇': { primary: { smile: 0.5, blush: 0.6 },  fallback: { smile: 0.5, blink: 0.15 } },
  '分心': { primary: { blink: 0.25 },             fallback: { blink: 0.25 } },                // 半阖眼
  '生气': { primary: { angry: 0.8 },              fallback: { browDown: 0.8 } },              // 再无则空
  '惊讶': { primary: { surprised: 0.85 },         fallback: { mouthOpen: 0.5, eyesWide: 0.8 } },
};
```
### D.2 应用
- 计算"当前表情目标权重"：取 `MOOD_MORPHS[mood]`，对 primary 里**存在**的形态键用 primary 权重；primary 里缺失的，看 fallback 里有没有能用的。简化实现：先 `primary` 过滤出 `morph.has(name)` 的；若过滤后为空且有 fallback，则用 fallback 同样过滤。
- 该表情目标是一组 `{name: weight}`；**未被该 mood 提及的表情形态键目标权重归 0**（避免上一个情绪残留）。注意：`blink`/`hairSway`/`mouthOpen` 由 idle/说话单独驱动，表情层只在"低落/分心"等借用 `blink` 做半阖眼——实现时把"表情层的 blink 基线"与"idle 眨眼脉冲"取 `max` 合成（见 E）。
- 在渲染循环里对每个表情形态键 `morph.lerp(name, targetWeight, 0.08)` 平滑过渡（避免突变）。

---

## E. idle 与说话口型（渲染循环里驱动）

### E.1 头发飘动
持续：`morph.set('hairSway', 0.5 + 0.5 * Math.sin(t * 0.6))`（t = clock.elapsedTime）。缺该形态键自动跳过。

### E.2 眨眼
周期性快速眨眼，叠加在表情层的"半阖眼基线"之上：
- 维护下次眨眼时刻 `nextBlinkAt`；间隔参考 `MOOD_TABLE[mood].blinkInterval`（毫秒）± 抖动。
- 到点触发一次脉冲：在 ~120ms 内 `blink` 0→1→0（用一个小状态机或基于时间的三角波）。
- 合成：`effectiveBlink = max(moodLidBaseline, blinkPulse)`，其中 `moodLidBaseline` 来自 D（低落 0.22 / 分心 0.25，其它 0）。`morph.set('blink', effectiveBlink)`。

### E.3 说话口型（mouthOpen）
**数据源**：角色"说话"＝收到她的新消息。监听 `snapshot.latestAssistantText` 变化（RoomWindow 已订阅 `listenPetSnapshots`，把 `latestAssistantText`/`updatedAt` 传进 hook 或用 ref）：
- 变化时开始"说话"，持续时长 `talkMs = clamp(text.length * 60, 800, 6000)`。
- 说话期间：`mouthOpen` 目标 = 伪语音波动，如 `(0.35 + 0.45 * (0.5 + 0.5*Math.sin(t*11)) ) * jitter`，再 `morph.lerp('mouthOpen', target, 0.5)` 平滑；非说话期间目标 0。
- **真实 TTS 钩子（留 TODO，不实现）**：若将来有她的语音音频播放，用 WebAudio `AnalyserNode` 取 RMS 驱动 `mouthOpen` 替代伪波动；注释标出接入点。
- 注意：**不要**用 v4 里那个 `volume`（那是麦克风＝用户在说），她的嘴只跟随她的消息。

### E.4 验收
- [ ] 角色不再播放内置动画；头发持续轻飘、自然眨眼。
- [ ] 切 mood 时表情平滑变化（开心微笑、低落/分心半阖眼等）；缺对应形态键时走 fallback 不报错。
- [ ] 她发新消息时嘴部开合"说话"，结束后闭合。
- [ ] 只有 `blink/smile/hairSway/mouthOpen` 四个形态键时也能完整跑（其余 mood 走 fallback）。

---

## F. 收尾：补完视频背景 stub（v3 遗留）

> 用户建议与 Phase 2 一起收。沿用 v4-C 方案：
- `is_known_avatar_role` 加 `chat_background_video`；视频存盘后用 `convertFileSrc(path)` 给 `<video src>`（若 assetProtocol 接入成本高，**降级为仅支持 `public/backgrounds/` 下预置视频的下拉选择**，PR 注明）。
- `ChatWindow.tsx` 的 `backgroundKind==='video'` 分支渲染 `<video class="chat-ui__background" autoPlay loop muted playsInline>` + `filter: blur(var(--chat-background-blur))` + 遮罩。
- 外观面板 video 源加"选择视频"+模糊滑块。
- 失焦 / `prefers-reduced-motion` 时 `video.pause()`。

验收：
- [ ] 选视频源后聊天背景循环播放、模糊+遮罩、文字可读、失焦暂停。

---

## 合并验收 & 红线
- [ ] `npm run build` + `cargo check` 通过。
- [ ] 角色：归一化构图正确（半身/全身仅改 json 即可）、无内置动画、形态键驱动（表情/眨眼/头发/说话）齐活且对缺失形态键 graceful。
- [ ] 卸载 dispose 完整（含移除 mixer 后不留泄漏）；多次开关 RoomWindow 不爆显存。
- [ ] 视频背景补完或明确降级。

**红线**
- 不得重新引入 v4 已修的初始化顺序问题（refs 必须在 tick 前赋值）。
- 缺模型/缺形态键/缺配置/缺视频一律降级，不白屏不抛未捕获异常。
- 形态键一律**按名读取、缺失跳过**；不得 hardcode 索引。
- 不实现 Phase 3（MediaPipe 摄像头对视）——底部摄像头按钮继续占位；仅在说话口型处留真实 TTS 音频的注释钩子。

## 建议顺序
A（归一化构图，先把"看得对"解决）→ B（形态键访问层 + 停内置动画）→ C 命名你已在 Blender 侧准备 → D（mood 表情）→ E（idle/说话）→ F（视频背景收尾）。同分支分 commit。

---

## 附：给用户的 Blender 待办清单（精简版）
1. 把 `全身.glb` 重命名为 `full.glb`（可选但推荐）。
2. 形态键改名：头发飘动→`hairSway`、笑→`smile`、闭眼→`blink`。
3. **新建 `mouthOpen`**（嘴/下巴张开）——Phase 2 说话必需。
4. （可选丰富表情）新建 `sad`、`angry`、`surprised`，分别对应低落/生气/惊讶。
5. 导出 glTF 时勾选导出 Shape Keys 及名称；去掉内置动画 clip 可不导出（反正不用了）。
6. 若角色入镜大小/位置想微调，改 `public/room/character/character.json` 的 `framing`/`scaleMul`/`offset`/`yawDeg`，无需改代码。
