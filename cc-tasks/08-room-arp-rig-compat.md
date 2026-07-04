# Brief 08 · ARP 骨架兼容 + boneMap/physicsBones 按模型分键

> 背景：角色模型将从 Rigify 换成 Auto-Rig Pro 重新绑骨（顺带修正模型真实尺度）。
> 架构上系统本就骨架无关（boneMap 语义映射 + phys_chain 属性 + 运行时解析），**不做"骨架模式"开关**。
> 本单只有两件事：补 ARP 默认候选名（零配置兜底），以及把两个骨架相关设置改为按模型文件分键（除掉全局污染雷）。

## 任务一 · BoneResolver 补 ARP 候选名

`src/windows/room/boneResolver.ts` 的 `DEFAULT_CANDIDATES` 各角色**追加** ARP 形变骨命名（Rigify 候选保留在前，互不冲突）：

| 角色 | 追加候选（按序） |
|---|---|
| head | `head.x` |
| chest | `spine_02.x`, `spine_03.x` |
| spine | `spine_01.x` |
| shoulderL | `shoulder.l` |
| shoulderR | `shoulder.r` |
| leftEye | `eye.l`, `c_eye.l` |
| rightEye | `eye.r`, `c_eye.r` |

- ⚠️ ARP 导出骨名以**实际控制台打印为准**（茶茶导出后核对 `[room] bones:`），上表若有出入按真实名补齐——候选名只是兜底，显式 boneMap 永远优先。
- 顺手改进 DEV 日志：BoneResolver 解析完成后打印**每个角色的解析结果**，如 `[room] bone roles: head→head.x, chest→spine_02.x, shoulderL→(none)`，换骨架时一眼看出哪个角色没接上。

## 任务二 · boneMap / physicsBones 按 characterFile 分键

**现状雷**：两者存在全局 `RoomSettings`，换骨名完全不同的模型时互相污染（旧 DEF- 映射对新 ARP 模型全部失效还占着位）。

改法（`src/shared/room/roomSettings.ts` + 消费方）：

1. `RoomSettings` 新增 `perCharacter?: Record<string, { boneMap?: BoneMap; physicsBones?: PhysicsBonesCfg }>`，key 为 characterFile 文件名。
2. **读取路径**：新增 helper `getCharacterCfg(settings, file)` — 返回 `perCharacter[file]`，查不到时回退顶层旧字段（兼容旧存储）。`useRoomScene` 两处加载点与 physics 参数同步 effect、`applySpringSettings` 全部改走 helper。
3. **写入路径**：CallSettingsPage 物理强度滑杆改写 `perCharacter[当前characterFile].physicsBones.default.gravity`；boneMap 若有编辑入口同理（当前无 UI，仅存储层预留）。
4. **迁移**：`loadRoomSettings` 的 validate 里做一次性迁移——若顶层 `boneMap`/`physicsBones` 存在且 `perCharacter` 无对应条目，将其复制为 `perCharacter[characterFile]` 下的值并删除顶层字段，随下次 save 落盘。validate 需容忍两种形态。
5. 切换角色文件（设置下拉）时物理滑杆显示值应跟随新文件的存储值。

## 任务三 · 文档更新（docs/room-model-import-guide.md）

- §4.2 boneMap 示例旁补一份 ARP 命名示例（上表）。
- §4.5 的 Rigify 专属注意事项（rigify_type / metarig 属性传递）标注"仅 Rigify"，并列 ARP 版注意事项：phys_chain 属性直接打在 ARP 骨架的头发形变骨上；**ARP 导出需验证自定义属性存活**（导出后看 `[room] phys chains` 非空，为空则属性被导出流程剥掉，需在导出面板寻找保留自定义属性的选项或导出后二次处理）。
- §7 导出清单补 ARP 行（**已实测验证的路径**）：用 Blender 通用 glTF 导出即可，但必须勾 **Data → Armature → 仅导出形变骨骼**（否则 300+ 控制/参考骨全进包，动画通道数爆炸）；动画只保留命名 `idle` 的单个 action；自定义属性经实测在通用导出下存活；ARP 控制器形状网格（`cs_user_*`）导出前排除；真实米制、面朝 +Z、Shape Keys / Custom Properties 勾选。
- §4.5 补一条 ARP spline 头发注意事项：**phys_chain 必须打在形变链根骨**（如 `spline_01.x`），不能打在 `c_spline_*` 控制骨上——控制骨在 glb 里无子链且"仅形变骨"导出后会消失。
- §0 TL;DR 的"Rigify"措辞泛化为"Rigify / Auto-Rig Pro 均可"。

## 茶茶侧 checklist（资产，按 2026-07 首次导出的实测问题修订）

1. `phys_chain`（+可选 `phys_*` 参数）打在**形变链根骨 `spline_01.x`**（不是 `c_spline_01.x`——控制骨是叶子节点且形变骨导出后会消失）。
2. 只保留重定向后的 action 并命名 `idle`；删除多余 action（原始 Mixamo action、`立方体.001动作` 等杂散）。
3. 形态键 `surprise` 改名 **`surprised`**（规范 §3.1，否则惊讶表情静默失效）。
4. 删除/排除 ARP 控制器形状网格 `cs_user_c_shoulder.l/.r`。
5. 导出：**必须用 ARP:导出面板**（glb 格式、烘焙 idle action、Shape Keys、不勾任何引擎重命名预设）。⚠️ 不要用通用 glTF 导出的"仅形变骨骼"——ARP 形变骨互相不是父子（各挂控制骨），该选项会把层级拍平（head.x 失去 neck 父级 → 头不跟身体、头发物理断裂，2026-07 实测踩坑）。导出前确认 ARP 里发链 spline 的父级挂在头部。
6. 开视频通话，控制台依次核：`bones:`（应只剩几十根形变骨；候选名 `head.x`/`spine_02.x`/`shoulder.l|r` 已实测存在）、`bone roles:` 各角色就位、`phys chains: ['spline_01.x']`、`clips: ['idle']`、形态键 8 键含 `surprised`。
7. 设置里微调 scaleMul/offset（新模型 ≈1.9m，旧偏移值作废，预期重调一次）。

## 验证步骤

- 旧 Rigify 模型（备份档）与新 ARP 模型互换加载，各自的 boneMap/physicsBones 独立保存互不污染，物理滑杆值随文件切换。
- 新模型：转头/呼吸/肩动/视线经候选名或 boneMap 正常驱动；头发物理正常；idle clip 循环播放且与 07 的分层规则无冲突；表情/眨眼/口型正常。
- 旧存储格式（顶层 boneMap）的 localStorage 能无损迁移，不炸 validate。
