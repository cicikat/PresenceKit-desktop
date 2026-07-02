# Brief 07 · 角色动画 clip 播放 + 分层规范（idle 先行）

> 前置：Brief 05（弹簧物理修复）已验收。资产侧（Blender 重定向）由茶茶按附录 checklist 操作，代码侧按本文施工。
> 首版目标：**一个 idle 循环 clip 端到端跑通**。多 clip / 情绪化 idle 是后续单。

## 分层规范（定死，写进代码注释与 import guide）

引入 clip 后同一根骨会被多个系统写。所有权与每帧写入顺序：

| 骨 | 所有者 | 说明 |
|---|---|---|
| 头（boneMap.head / findHeadBone）、眼骨 | 程序化（gaze/gesture/microNoise） | **加载时从 clip 删除这些骨的轨道** |
| phys_chain 全部链骨 | 弹簧物理 | 同上，删除轨道 |
| 胸/肩（呼吸、肩微动目标骨） | clip 为底、程序化**叠加** | 见下"additive 规则" |
| 其余全部骨 | clip | |

**每帧顺序（tick 内）**：`mixer.update(dt)` → 手势/gaze/microNoise（头部，绝对写，与 clip 无冲突因轨道已删）→ 呼吸/肩微动（additive 或绝对，见下）→ `charGroup.updateMatrixWorld(true)` → `updateSpringChains`。现有顺序只需把 mixer.update 插在最前。

**additive 规则（精确）**：mixer 每帧会重写"clip 中有轨道的骨"的 local transform，因此对这些骨叠加偏移必须用 `+=`（每帧被 mixer 归零后再加，不累积）；对 clip **没有**轨道的骨，mixer 不碰它，`+=` 会无限累积——必须走现有"基准值+偏移"的绝对写。实现：加载时收集 `animatedBoneNames: Set<string>`（过滤后 clip 实际驱动的骨名），呼吸/肩逻辑按 `animatedBoneNames.has(bone.name)` 选 additive 或现有绝对路径。

## 运行时实现（useRoomScene.ts + 新文件 clipPlayer.ts 建议）

1. 角色加载回调里（两处：初始加载 + characterFile 重载，与 collectSpringChains 同位置）：
   - `gltf.animations` 非空 → 创建 `THREE.AnimationMixer(model)`，存 `mixerRef`。
   - DEV 打印 `[room] clips: [names]`。
   - 选 clip：名字等于 `idle`（大小写不敏感）优先，否则第一个。`LoopRepeat` 播放。
2. **轨道过滤**（播放前，对 clip.tracks 过滤）：
   - 轨道名格式 `<nodeName>.<property>`，**nodeName 可能含点**（`DEF-spine.006.quaternion`）——按**最后一个点**切分。
   - 删除 nodeName ∈ {head 骨名, leftEye/rightEye 骨名, 所有 spring chain 节点骨名（含每链最末端子骨）} 的轨道。
   - 过滤后剩余轨道的 nodeName 集合即 `animatedBoneNames`。
3. tick 内 `mixerRef.current?.update(dt)` 插在 `getActiveDirective` 之后、morph 处理之前（最前即可）。
4. 呼吸/肩微动按 additive 规则改造（见上）。头部逻辑不动。
5. 卸载/重载：`mixer.stopAllAction(); mixer.uncacheRoot(model)`，ref 清空。
6. 基准捕获时序不变：`headBoneRestRef`/胸肩基准仍在加载时捕获（bind pose），spring 的 restRotation 同理——链骨轨道已删，clip 不影响它们的 rest。
7. 设置面板暂不加开关；`RoomSettings.idleClip?: string`（指定 clip 名）作为可选小字段，缺省走上面的自动选择。

## 文档更新

`docs/room-model-import-guide.md` 新增 §4.6「动画 clip（可选）」：
- 命名约定：待机循环 clip 命名 `idle`；导出勾选 Animation。
- 分层规范表（照上文）+ "头/头发轨道会被运行时忽略，不用在 Blender 里手动删"。
- §7 导出清单同步：撤销"动画 clip 可不导出"改为"可选导出，命名 idle"。
- 附录：下方 checklist 收编进去。

## 附录 · 茶茶的 Blender 重定向 checklist（避开 Rigify 约束天坑的路线）

> 核心思路：**不在 Rigify 源工程里重定向**（DEF 骨被约束驱动，直接怼动画会打架）。
> 用导出的 full.glb 回导得到无约束的干净骨架，在它上面重定向，再导出。源 .blend 不动。

1. **拿动画**：Mixamo（或现成 FBX 包）。Mixamo 下载参数：Format = FBX Binary，**Without Skin**，30 fps，勾 **In Place**（有该选项的动作）。先只下一个 idle。
2. **装插件**：Blender 安装 Rokoko Studio Live（免费，Rokoko 官网/GitHub），启用后侧栏出现 Retargeting 面板。
3. **新建空白工程** → File > Import > glTF 2.0 导入 `full.glb`（导入选项勾 **Custom Properties**，保住 phys_chain 标记）。确认模型、形态键、骨架都在。
4. File > Import > FBX 导入动画 FBX。若骨架尺寸异常（Mixamo 常见 0.01 比例），选中它 Object > Apply > All Transforms。
5. Rokoko Retargeting 面板：Source = Mixamo 骨架，Target = full.glb 的骨架 → **Build Bone List**（自动匹配）→ 人工核对映射表：`mixamorig:Hips→DEF-spine`、`Spine/Spine1/Spine2→DEF-spine.001/.002/.003`、`Neck→DEF-spine.004`、`Head→DEF-spine.006`、四肢对应 `DEF-upper_arm.L` 等（以控制台打印过的真实骨名为准）。头发骨**不要映射**。
6. Retarget → 播放预览。姿势拧了就用面板里的 rest pose 对齐（Auto Scale / T-pose 工具）再来一次。
7. 选中目标骨架，把烘出来的 Action 重命名为 `idle`（Dope Sheet > Action Editor 顶部名字框）。
8. 导出 glTF：勾 Animation、Shape Keys、**Custom Properties**；覆盖到 `public/room/character/full.glb`（先备份旧文件）。
9. 开发模式开视频通话：确认控制台 `[room] clips: ['idle']`、`[room] phys chains` 数量不变、表情形态键仍在。

预期瑕疵：重定向可能有轻微滑步/手贴身，半身机位下通常不可见；不可接受再调映射或换动作。

## 验证步骤

- 无 clip 的旧模型：行为与现在完全一致（回归底线）。
- 有 idle clip：身体循环待机；转头/gaze/点头摇头仍由指令驱动且不与 clip 打架；头发物理正常跟随身体动作；呼吸起伏叠加可见、无漂移累积（挂 10 分钟观察胸骨不跑偏）。
- 表情、眨眼、口型、VN 气泡全部不受影响。
- 模型热切换（设置里换角色文件）后 mixer 正确重建，无残留动画。
