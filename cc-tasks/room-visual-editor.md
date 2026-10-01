# 视频通话可视化编辑器（Room Visual Editor）

本组工单按序号施工，序号即依赖顺序。工单 1 是后续全部工单的数据基础，必须先做完。
工单 4 与 工单 2/3 无依赖，可并行。工单 5 依赖 3 和 4。工单 6 依赖 4。工单 7 最后做。

## 背景与现状（施工前必读，不要重复实现已有能力）

视频通话画面在本仓库渲染，不是后端合成：

- 3D 舞台：`src/windows/room/ThreeCallStage.tsx` → `src/windows/room/useRoomScene.ts`（three.js r185，1181 行，场景/相机/灯光/摆放模式全在这一个 hook 里）。
- Live2D 舞台：`src/windows/room/Live2DCallStage.tsx`（pixi-live2d），与 3D 互斥，由 `settings.renderMode` 选择。
- 外壳与底部控件：`src/windows/room/RoomWindow.tsx`。

**已经有真实三点光照**，不是 2D 贴色：`useRoomScene.ts:529-542` 建了 `AmbientLight`（环境光）、
`DirectionalLight` key（主光，照全场）、`DirectionalLight` charFill（补光，`layers.set(CHAR_LAYER)` 只照角色）。
配置结构在 `src/shared/room/roomSettings.ts` 的 `RoomLights` / `LightCfg`（on / intensity / color / pos），
默认值 `DEFAULT_LIGHTS`，持久化走 `src/shared/uiPreferences.ts`（localStorage 镜像 + Tauri `save_ui_prefs`），
键名 `room.settings`。另有 `useSceneLights`（是否保留 GLB 自带灯，`collectGlbLights`）和 `moodTint`
（主光随情绪 HSL 偏色，`useRoomScene.ts:299-310`）。

**已经有一个"摆放模式"，但没有任何面板**：`togglePlacementMode()`（`useRoomScene.ts:~990` 起）用
`TransformControls` + 两个 `MeshBasicMaterial` 代理小球（proxyKey 黄 / proxyFill 蓝）让用户点选拖动光源，
射线点选顺序是 代理球 → 道具 → 人物（`useRoomScene.ts:628-690`），键位 G/R/S 切换 translate/rotate/scale、
X/Y/Z 轴锁、左右方向键调选中灯强度、Esc 取消选择再退出。选中状态是两个互斥 ref：
`selectedLightRef`（`'key' | 'charFill' | null`）和 `selectedPropIdxRef`。**用户不知道这些键位，因为只有一行
提示文字**（`room.call.placementHint`）。

**灯光参数的滑块已经存在，但在错误的地方**：`src/windows/chat/components/CallSettingsPage.tsx:406-520`
有完整的灯光折叠区（颜色选择器 + 强度 + XYZ 位置滑块）。它在主聊天窗的偏好页，调的时候看不到通话画面。

**颜色映射也已经有一套，走材质不走光**：CA-06 toon 材质 `src/shared/character/materialsConfig.ts` +
`src/shared/character/toonMaterial.ts`，按角色模型旁的 `<model>.materials.json` 绑定 FACE/HAIR/CLOTH 模板，
参数是 shadeColor / shadeThreshold / shadeSoftness / rimColor / rimStrength / rimPower，还支持 `looks` 变体。
由 `useRoomScene.ts:407` 的 `applyToonBindings` 应用。

**完全缺失的三样**：
1. 图层/对象清单（outliner）：场景里有什么、哪个被选中，界面上没有任何表达。
2. 画面级调色：`renderer` 只设了 `outputColorSpace = SRGBColorSpace`，没有 toneMapping、没有 exposure、
   没有 `EffectComposer`（three 的 postprocessing 模块在 node_modules 里可用但本仓未 import）、没有阴影、
   没有 fog/environment。所以现在"整体氛围"只能靠调三盏灯的颜色硬凑。
3. 光照可见性：代理球只标位置，不显示方向，方向光打向哪里全靠猜。

### 结论：光照还是映射颜色？

两者都要，分工不同，不要只做一个：

- **光照**决定立体感和方向——脸上的明暗交界、轮廓光、阴影落在哪。这是 Blender 式"挪灯"真正改变的东西，已有基础。
- **画面调色（grade）**决定整体色调和质感——暖/冷、对比、饱和、暗角、泛光。这是"视觉效果上偏这样"最廉价、
  最好懂、最立竿见影的一层，且与模型和场景无关，换角色换场景都成立。现在完全没有。
- **材质 toon 参数**是第三层，已有且属于角色资产作者，本组工单不碰，只在面板上留一个只读提示说明它在哪。

给用户的心智模型就按这三层分，面板分组也按这个分，不要再细。

### 三面闭环（每张工单都适用，不要重复展开）

本组工单全部是本机前端渲染与本机 UI 偏好，不新增后端状态、管理面开关、REST/WS/IPC 契约，
不涉及 `Emerald-presence` 与 `Emerald-mobile` 的消费面。唯一的持久化是 `room.settings`
（`uiPreferences` → Tauri `save_ui_prefs`），已有通道，不新增。通话的摄像头采集、语音链、
后端视觉上报与对话链一律不改。若某张工单实际碰到了上述边界，停下来先说明。

---

## 工单 1：统一可编辑对象模型（outliner 数据层）

**为什么先做**：现在"选中了什么"散在 `selectedLightRef` 和 `selectedPropIdxRef` 两个互斥 ref 里，
而且没有"人物被选中"这个显式状态（人物是 else 兜底分支，见 `useRoomScene.ts:613`）。
面板要显示清单和高亮当前项，必须先有一个单一真相的选中模型，否则面板和射线点选会打架。

**改哪里**：新增 `src/windows/room/sceneOutline.ts`；改 `src/windows/room/useRoomScene.ts`。

**做什么**：

1. 新文件定义可编辑对象标识与元数据，纯数据纯函数，不 import three 以外的东西：

   ```ts
   export type EditableId =
     | { kind: 'character' }
     | { kind: 'scene' }
     | { kind: 'prop'; index: number }
     | { kind: 'light'; key: LightKey };   // LightKey 见工单 3，本工单先是 'ambient' | 'key' | 'charFill'

   export interface OutlineItem {
     id: EditableId;
     /** 面板显示用，已 i18n 的 key 或模型文件名，不在这里写死中文 */
     label: string;
     group: 'character' | 'scene' | 'prop' | 'light';
     /** 能否用 gizmo 拖动：环境光不能（无位置），场景根不能（场景整体不参与摆放） */
     transformable: boolean;
     /** 面板上要不要给颜色/强度控件 */
     hasLightParams: boolean;
     /** 当前可见性，用于面板的眼睛图标 */
     visible: boolean;
   }

   export function buildOutline(settings: RoomSettings, loadedSceneFile: string | null): OutlineItem[];
   export function editableIdEquals(a: EditableId | null, b: EditableId | null): boolean;
   export function editableIdKey(id: EditableId): string;  // React key / dataset 用
   ```

   `buildOutline` 的顺序固定为 人物 → 场景 → 道具（按 `settings.props` 原序） → 光照，面板直接按这个顺序渲染，
   不在 UI 层再排序。

2. `useRoomScene.ts` 里把 `selectedLightRef` + `selectedPropIdxRef` 两个 ref 合并成
   `selectionRef = useRef<EditableId | null>(null)`，并新增一个 `selection` state 暴露给外部（面板要高亮）。
   射线点选分支（`useRoomScene.ts:628-690`）和 `objectChange` 保存分支（`useRoomScene.ts:578-625`）
   都改成 switch `selectionRef.current.kind`。**人物必须变成显式的 `{ kind: 'character' }`，不再是 else 兜底**，
   空白点击 detach 时才置 null。`objectChange` 里原来的"else 当成人物"逻辑要改成 `case 'character'`，
   null 时直接 return 不保存。

3. 新增 `selectById(id: EditableId | null): boolean` 并通过 `RoomSceneAPI` 和 `ThreeCallStageHandle` 暴露：
   按 id attach 对应的 three 对象到 `transformCtl`（光 → 代理球，道具 → `propsGroup` 里 `__propIdx` 匹配的 root，
   人物 → `charGroup.children[0]`），不可 transform 的项（ambient / scene）只更新 `selectionRef` 不 attach，
   返回 false 表示没有 gizmo。只在摆放模式下有效，非摆放模式返回 false。

4. `RoomSceneAPI` 增加 `selection: EditableId | null` 和 `setGizmoMode(mode: 'translate' | 'rotate' | 'scale')`
   （把 G/R/S 的行为提成方法，键位处理改为调用它，避免面板按钮和键位两套实现）。

**验收**：新增 `src/windows/room/sceneOutline.test.ts`，覆盖 `buildOutline` 的分组顺序、道具 index 对应、
ambient 的 `transformable: false`、`editableIdEquals` 对 prop index 的区分。
`npm.cmd test`、`npm.cmd run build`、`npx.cmd tsc --noEmit` 通过。
手动核对：进摆放模式后原有的点选光源/道具/人物拖动与自动保存行为不变（这是纯重构单，**不改任何用户可见行为**）。

---

## 工单 2：编辑模式右侧图层面板

**依赖**：工单 1。

**改哪里**：新增 `src/windows/room/EditorPanel.tsx` + `EditorPanel.css`；
改 `src/windows/room/ThreeCallStage.tsx`（暴露 handle 与 selection 回调）、
`src/windows/room/RoomWindow.tsx`（在 `placementMode` 时挂载面板）。

**做什么**：

1. 面板只在 `placementMode === true` 时挂载（退出即卸载，不要用 CSS 隐藏——通话是常驻窗口，
   不在编辑时不应该有多余的 React 订阅）。位置：画面右侧，宽 220px，绝对定位贴右，
   `background: oklch(0.12 0.02 240 / 0.88)` + `backdropFilter: blur(8px)`，沿用
   `RoomWindow.tsx` 底部控件条已有的配色习惯，不要引入新的设计语言。

2. 内容是四个固定分组，直接渲染 `buildOutline()` 的结果：**人物 / 场景 / 道具 / 光照**。
   每行：眼睛图标（可见性）+ 名称 + 选中高亮。点击行 = `selectById(id)`，当前选中项加左侧色条。
   分组标题不可折叠（只有四组，折叠是多余的交互）。

3. 选中项下方内联展开它的参数，不要弹窗、不要跳到别的页面：
   - 光照（key / charFill）：颜色 `<input type="color">`、强度滑块 0–4、XYZ 三个数值框（与 gizmo 双向同步）。
   - 光照（ambient）：颜色、强度。没有位置。
   - 道具：XYZ 位置、XYZ 旋转、统一 scale 数值框；一个删除按钮（`patch({ props: ... })`，不需要二次确认，
     道具是本机摆设，重新添加成本极低）。
   - 人物：yaw、scale 数值框（复用 `settings.yawDeg` / `scaleMul` 语义）。
   - 场景：只显示当前 `sceneFile` 和"保留场景自带灯"开关（`lights.useSceneLights`）。
   数值控件复用 `CallSettingsPage.tsx` 里已有的 `SliderNum` / `Row` 风格，如果它们没导出，
   在本工单里把 `SliderNum` 提到 `src/windows/chat/components/UIKit.tsx` 或新建
   `src/windows/room/EditorControls.tsx` 共用，**不要复制粘贴一份**。

4. 面板顶部一行工具条：gizmo 模式三按钮（移动/旋转/缩放，对应 `setGizmoMode`，当前模式高亮）、
   轴锁 X/Y/Z 三个小按钮（对应已有的 `setAxisConstraint`，需要把它也提成 API）。
   面板底部一行灰色小字列出键位（G/R/S、X/Y/Z、方向键调强度、Esc），替代现在画面顶部那条长提示；
   顶部提示条改为只显示一句"编辑模式"。

5. 双向同步：拖 gizmo → `objectChange` 节流保存 → `settings` 变化 → 面板数值更新（面板从
   `roomSettings` 读，不自己存一份）。注意 `useRoomScene.ts:344` 的 lights 同步 effect 在摆放模式下
   会 `return` 跳过，所以**面板改光参数时必须直接写 three 对象 + 存 settings**，不能只存 settings
   等 effect 生效。给 `RoomSceneAPI` 加 `applyLightPatch(key, patch)` 做这件事，面板调它。
   这是本工单最容易出错的点，先读 `useRoomScene.ts:344-368` 再动手。

6. 可见性（眼睛）：光照 → `light.visible` + `lights[key].on`；道具 → 新增 `RoomProp.hidden?: boolean`
   （`roomSettings.ts` 的 `validate` 要同步容错，旧数据无此字段视为 false）；人物/场景 → 本工单不提供
   隐藏（通话里隐藏角色没有意义），眼睛图标对这两行渲染为禁用态。

**验收**：`EditorPanel` 的纯逻辑（分组渲染、选中态、参数行该显示哪些控件）有测试；
`npm.cmd test` / `npm.cmd run build` / `tsc --noEmit` 通过。
真实窗口验收：进编辑模式能点清单选中并出现 gizmo、改颜色强度画面立刻变、拖 gizmo 面板数值跟着变、
退出再进参数保留。**真实 Tauri 窗口目检未完成前，工单状态写 partial，不要用 build 通过冒充验收。**

---

## 工单 3：光照可编辑性补强

**依赖**：工单 1。可与工单 2 并行开发，但联调在工单 2 之后。

**改哪里**：`src/shared/room/roomSettings.ts`、`src/windows/room/useRoomScene.ts`，面板侧由工单 2 承接。

**做什么**：

1. **光源可增删**。现在是硬编码三盏。改成：ambient + key + charFill 保持为固定三盏（兼容既有数据），
   新增 `lights.extra: ExtraLightCfg[]`，上限 4 盏：

   ```ts
   export interface ExtraLightCfg extends LightCfg {
     id: string;                       // crypto.randomUUID()，面板行 key 与 EditableId 用
     type: 'directional' | 'point' | 'spot';
     /** point/spot 的衰减距离；directional 忽略 */
     distance?: number;
     /** spot 的锥角（度）与边缘羽化；其他类型忽略 */
     angleDeg?: number;
     penumbra?: number;
     /** 只照角色（走 CHAR_LAYER）还是照全场 */
     charOnly?: boolean;
   }
   ```

   `LightKey` 扩展为 `'ambient' | 'key' | 'charFill' | { extra: string }`，或更简单地用 `string`
   并约定 extra 用 `extra:<id>` 前缀——选一种并在 `sceneOutline.ts` 里写清注释，不要两种混用。
   上限 4 是为了避免用户把帧率调没，面板到上限时按钮禁用并给提示文案。

2. **光源可见化**。编辑模式下把现在的代理小球换成 three 自带 helper：`DirectionalLightHelper`
   （能看到方向和朝向目标）、`PointLightHelper`、`SpotLightHelper`。helper 仅在 `placementMode` 时
   `add` 到 scene，退出时 `remove` + `dispose`（渲染循环里每帧 `helper.update()`，注意这是 three
   的要求，漏了方向线不会跟着动）。代理球仍然需要——helper 自身不可点选也不可 attach 到
   `TransformControls`——所以保留代理球做点选与拖动句柄，helper 只做视觉指示，两者位置同步。
   每盏灯的代理球颜色按类型区分并与面板行的小圆点同色。

3. **阴影开关**。新增 `lights.shadows: boolean`（默认 false）。开启时
   `renderer.shadowMap.enabled = true`、`renderer.shadowMap.type = THREE.PCFSoftShadowMap`，
   key 光与 extra 的 directional/spot 设 `castShadow`，角色与道具 mesh 设 `castShadow` + `receiveShadow`，
   场景 mesh 设 `receiveShadow`。directional 光需要手动调 `shadow.camera` 的正交范围，
   否则大场景阴影会糊或整体丢失——用场景包围盒（已有 `fitSceneClipRange` 可参考）推一个合理范围。
   默认关是因为这是本组工单里唯一会明显吃帧率的选项，面板上标注"可能降低帧率"。

4. **moodTint 的边界要写清**。现在 `moodTint` 开启时主光的颜色和强度被情绪接管，
   面板上手调主光颜色会被每帧覆盖回去，用户会以为坏了。处理：`moodTint` 开启时主光的颜色/强度控件
   置灰并显示"由情绪接管"，或改为把情绪当成在用户值之上的偏移（选后者更好，但如果实现有歧义就选前者
   并在工单里记录）。不要留一个默默失效的控件。

**验收**：`roomSettings.ts` 的 `validate` 对 `extra` / `shadows` 的容错有测试（缺字段、超上限、
非法 type、非法颜色都要回落到默认而不是抛错）；旧 `room.settings` 数据能无损升级。
`npm.cmd test` / build / tsc 通过。真实窗口：加一盏点光并拖动可见、阴影开关生效、
`moodTint` 与手调不再互相打脸。未实机验收前记 partial。

---

## 工单 4：画面调色层（grade）

**依赖**：无（可与工单 2/3 完全并行，只在工单 5 汇合）。
这张单是"视觉效果上偏这样"最直接的一张，优先级不低于 2 和 3。

**改哪里**：新增 `src/shared/room/gradeConfig.ts`（纯数学与校验，可测）、
`src/windows/room/gradePass.ts`（three 侧的 pass 构造）；改 `roomSettings.ts`、`useRoomScene.ts`。

**做什么**：

1. 配置结构（存进 `RoomSettings.grade`，默认全中性，即 `enabled: false` 时与现在的画面逐像素一致）：

   ```ts
   export interface GradeCfg {
     enabled: boolean;
     /** 'none' 保持现状；其余走 THREE.*ToneMapping */
     toneMapping: 'none' | 'aces' | 'agx' | 'neutral' | 'reinhard';
     exposure: number;      // 0.2–3，默认 1
     temperature: number;   // -1 冷 … +1 暖，默认 0
     tint: number;          // -1 绿 … +1 品红，默认 0
     saturation: number;    // 0–2，默认 1
     contrast: number;      // 0.5–2，默认 1
     lift: number;          // -0.2–0.2 提亮暗部，默认 0
     vignette: number;      // 0–1，默认 0
     bloom: { on: boolean; strength: number; radius: number; threshold: number };
   }
   ```

   toneMapping 与 exposure 直接设在 `renderer` 上（`renderer.toneMapping` / `toneMappingExposure`），
   不需要 pass。其余参数走一个自写的 `ShaderPass`。

2. **渲染路径按需切换，不要无条件引入 composer**：`grade.enabled === false` 且 `bloom.on === false` 时
   保持现在的 `renderer.render(scene, camera)` 直出；任一开启时才创建 `EffectComposer`
   （`three/examples/jsm/postprocessing/EffectComposer.js` + `RenderPass` + 自写 grade `ShaderPass`
   + 需要时 `UnrealBloomPass`）。切换时正确 `dispose` 旧 composer 与 render target，
   并在 `resizeObs` 里同步 `composer.setSize`。渲染循环在 `useRoomScene.ts` 的 rAF tick 里，
   改成一个 `renderFrame()` 间接层，两条路径都走它。

3. grade 的像素数学写在 `gradeConfig.ts` 里导出为纯函数（`gradeUniformsFrom(cfg)`：把
   temperature/tint 换算成 RGB 增益向量，contrast 换算成 pivot 0.5 的 lerp 系数等），
   shader 只消费 uniform。这样数学可以单测，不必跑 WebGL。
   顺序固定为：曝光（renderer 侧）→ 白平衡增益 → lift → contrast → saturation → vignette，
   在 shader 注释里写出这个顺序，别让后续改动随便换序。

4. **Live2D 模式先不接**（工单 6 处理），但 `grade` 字段与校验在本工单一次定好，避免工单 6 再改结构。

5. 面板侧：工单 2 的面板加第五区"调色"（不属于四个对象分组，放在清单下方独立一块，
   因为它是画面级而非对象级，面板上要表达出这个区别）。若工单 2 尚未完成，本工单允许先只接
   `CallSettingsPage.tsx` 的临时入口，但**必须在工单 7 收口为单一入口**。

**验收**：`gradeConfig.test.ts` 覆盖参数裁剪、中性值产出恒等变换（增益 = [1,1,1]、contrast 系数 = 1）、
非法输入回落。手动核对：`enabled: false` 时帧率与改动前一致（没有白创建 composer）、
开启 ACES + 暖调 + 轻微暗角后画面明显变"有氛围"、改窗口大小 bloom 不错位。
`npm.cmd test` / build / tsc 通过。真实窗口目检未完成记 partial。

---

## 工单 5：外观预设（Look）与按场景记忆

**依赖**：工单 3、工单 4。

**改哪里**：新增 `src/shared/room/lookPresets.ts`；改 `roomSettings.ts`、工单 2 的面板。

**做什么**：

1. 把 `lights`（含 extra / shadows）+ `grade` 打包成一个命名预设 `LookPreset { name, lights, grade }`。
   存 `RoomSettings.looks: Record<string, LookPreset>`，另存 `lookByScene: Record<string, string>`
   （键是 `sceneFile`，沿用已有 `sceneCameraByScene` 的做法，见 `roomSettings.ts` 的 `perPlacement`
   与 `sceneCameraByScene` 注释，保持一致不要发明第三种记忆方式）。
   加载场景时若 `lookByScene[sceneFile]` 命中就应用该预设。

2. 内置 5 个只读预设（定义在 `lookPresets.ts`，不写进用户存档，面板上与用户预设分区显示）：
   日光 / 黄昏暖光 / 夜间台灯 / 冷调室内 / 舞台侧逆光。每个都要同时给灯光和 grade 值——
   这是向用户演示"两层配合"的主要手段，所以预设必须调得好看，别给一组敷衍数值。
   调完后在工单里记录每个预设的截图或至少一句视觉描述。

3. 面板"调色"区上方加一行预设下拉 + "存为新预设" + "更新当前" + "删除"（删除只对用户预设可用）。
   应用预设 = 一次 `saveRoomSettings` 覆盖 `lights` + `grade`，并立即同步到 three 对象
   （同工单 2 第 5 条的注意点：摆放模式下 lights effect 被跳过）。

**验收**：`lookPresets.test.ts` 覆盖内置预设的结构合法性（每个都能通过 `validateLights` / grade 校验）、
应用/保存/删除的纯函数逻辑、`lookByScene` 的容错。build / tsc / test 通过。
真实窗口：切场景自动套用上次的 look、切预设画面整体变化。未实机记 partial。

---

## 工单 6：Live2D / 2D 模式的等价降级

**依赖**：工单 4。

**改哪里**：`src/windows/room/Live2DCallStage.tsx`、`src/windows/room/RoomWindow.tsx`、工单 2 的面板。

**做什么**：

1. Live2D 没有三维光照，不要假装有。`renderMode === 'live2d'` 时：
   - 编辑面板只显示"场景 / 调色"两块，光照块替换为一行说明文案（"Live2D 模式下只有画面调色，
     立体光照需要 3D 模型"），**不要显示一组调了没反应的光照控件**。
   - 底部控件条现在对 live2d 整体隐藏了摆放模式按钮（`RoomWindow.tsx:408`）。改为：live2d 下
     仍可进入编辑模式（为了调色），但 `placementMode` 的 gizmo 相关能力不可用——
     用一个更准确的命名区分（如 `editMode` 作为统一的外壳状态，`placementMode` 仅 3D 子集），
     不要让 live2d 走一条名不副实的 placementMode。
2. grade 在 2D 侧用 pixi 的 `ColorMatrixFilter` 实现 temperature/tint/saturation/contrast/lift，
   vignette 和 bloom 若 pixi 侧实现成本高，本工单允许不支持，但面板必须把不支持的控件置灰
   并标注原因，不能静默无效。复用 `gradeConfig.ts` 的纯函数产出矩阵，不要写第二套数学。

**验收**：pixi 侧矩阵换算有单测（与 three 侧共用 `gradeConfig` 的中性值恒等断言）。
真实窗口：live2d 模式进编辑只见调色、调色生效、3D 模式不受影响。未实机记 partial。

---

## 工单 7：收口（单一入口、i18n、文档、验收）

**依赖**：以上全部。

**做什么**：

1. **消除两套真相**：`CallSettingsPage.tsx:406-520` 的灯光折叠区删掉，改为一行指引
   （"灯光与调色在通话窗口的编辑模式里调整"）。理由：参数必须在看得见画面的地方调，
   两个入口同时存在会让用户以为是两套设置。道具添加区（`CallSettingsPage.tsx:607-645`）
   保留在偏好页（它是资产选择，不是视觉调参），但面板的道具行要能删。
   这是**删除**动作：连同只测被删 UI 的测试一起删，不留僵尸测试。
2. 面板与提示里的全部中文走 i18n：新增 `room.editor.*` key 到
   `src/shared/i18n/locales/zh-CN.ts` 与 `en-US.ts`，两边数量一致。
   注意 `RoomWindow.tsx` 现有几处硬编码中文（`'退出摆放模式'` / `'摆放模式（点选物体拖动）'` /
   `'保存当前视角'` / `'挂断'`、`ThreeCallStage.tsx` 的 `'拖拽旋转 · 滚轮缩放 · 右键平移'`），
   本工单顺带补齐——它们在本组工单的改动范围内，不算无关清理。
3. 文档：`docs/frontend-structure.md` 顶部加一节说明编辑模式的三层模型（光照 / 调色 / 材质）
   与面板结构；`docs/settings-control-audit.md` 更新灯光入口的归属变化；
   本文件每张工单勾选并写明验证命令结果与剩余 open 项；真实窗口未完成的项同步进
   `docs/known-issues.md`。
4. 全量验证：`npm.cmd test`、`npm.cmd run build`、`npx.cmd tsc --noEmit`、`cargo check`
   （若碰到 `src-tauri/`；本组工单预期不碰，没碰就在工单里写明不适用）。
5. 换行自检：按 `AGENTS.md`，本仓工作区 CRLF。每个 `git add` 的文件对比
   `git diff --stat -- <path>` 与 `git diff --ignore-cr-at-eol --stat -- <path>`，差异大先修换行再提交。
6. 每张工单独立 commit，不要攒到最后一次提交。

---

## 给施工者的三条硬约束

1. `useRoomScene.ts` 已经 1181 行，本组工单会再往里加东西。**允许但只允许按职责外提**：
   outliner（工单 1）、grade pass（工单 4）、helper 管理（工单 3）都应是独立模块，
   由 hook 调用。不要把面板状态塞进这个 hook，也不要为了"整理"顺手重排无关代码——
   功能提交里不做大范围搬家。
2. 性能：通话是长驻窗口。编辑面板、helper、composer 一律按需创建、退出即释放
   （`dispose()` geometry / material / render target / helper）。现有代码的 `disposedRef`
   与 cleanup 模式是参照。
3. 默认值必须让画面与改动前一致。`grade.enabled: false`、`shadows: false`、`extra: []` 是默认；
   任何一张工单合并后，用户不做任何操作时画面不应该变。视觉变化只能由用户主动开启。

---

## 施工记录（2026-10-01）

状态：**partial**。代码、单测、tsc、构建均已通过；真实 Tauri 窗口目检未做，故任何一张都不算验收完成。

- [x] 工单 1 统一可编辑对象模型 — `sceneOutline.ts`、`selectionRef`/`selectById`/`setGizmoMode`。commit bed0aeb。
- [x] 工单 2 编辑模式右侧图层面板 — `EditorPanel.tsx` 等。commit 4b834b4。
- [x] 工单 3 光照可编辑性补强 — 附加灯/helper/阴影/moodTint 锁定。commit 5f6cc9a。
- [x] 工单 4 画面调色层 — `gradeConfig.ts`、`gradePass.ts`。commit dddde27。
- [x] 工单 5 外观预设与按场景记忆 — `lookPresets.ts`。commit 24644c9。
- [x] 工单 6 Live2D 等价降级 — `gradeColorMatrix` + `ColorMatrixFilter`。commit d745864。
- [x] 工单 7 收口 — 偏好页灯光区删除、i18n、文档（本次提交）。

验证命令：`npx tsc --noEmit`、`npx vitest run`（453 通过）、`npm run build` 均通过；`cargo check` 不适用（未碰 `src-tauri/`）。
换行：每次提交前对比过 `git diff --cached --numstat` 与 `--ignore-cr-at-eol`，无差异。

### 与工单原文的有意偏差

- 面板挂在 `ThreeCallStage` 内而非 `RoomWindow`：选中/gizmo/轴锁状态在 hook 里，放在外层需要为每项状态加一条上行回调。仍只在 `placementMode` 时挂载。
- 工单 2 原文只要求光参数走直接写入；实际人物 yaw/scale、道具 pos/rot/scale/删除在摆放模式下同样不会被 effect 应用（同样被跳过），所以补了 `applyPropPatch` / `removeProp` / `applyCharacterPatch`。
- 工单 3 的 moodTint 选了"置灰 + 说明"方案（工单允许的保守方案），未做"在用户值之上叠加偏移"。点光不投影（六面 shadow pass 成本）。
- `LightKey` 选 `extra:<id>` 字符串前缀单一编码。
- 偏好页「道具添加」保留；道具删除在偏好页与面板两处都有。
- Live2D 下"场景"块未做（Live2D 没有场景文件），面板只有一行光照说明 + 调色。

### 内置预设视觉描述（数值未经肉眼调校）

- 日光：偏暖白主光从右上方来，柔和补光，中性色调映射，轻微对比与暗角。
- 黄昏暖光：低角度橙色侧光，桃色环境光，ACES 胶片对比，暖色泛光。
- 夜间台灯：深蓝弱环境光，角色旁一盏暖黄点光，强暗角与泛光，整体偏暗。
- 冷调室内：偏蓝白的日光灯感，略降饱和，色温偏冷。
- 舞台侧逆光：暗场，品红聚光与青色平行光只照角色形成轮廓光，高对比与泛光。

### 仍 open

见 `docs/known-issues.md`「Room 可视化编辑器」：全部真实窗口目检项，包括透明画布下 bloom/暗角、预设观感、大场景阴影 frustum、关闭调色时帧率对比。
