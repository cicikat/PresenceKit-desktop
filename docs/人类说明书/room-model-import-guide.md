# 视频通话 角色 / 场景 / 道具 模型导入说明书（权威版）

> 本文是「虚拟空间」功能的**建模规范与统一度量衡**，既给项目作者自用，也面向开源后的第三方建模者。
> 目标：让按此规范导出的 glb 尽量「丢进文件夹就能用」，缺的能力有明确降级，不假装成功。
> **适用**：当前仓库的客户端（Room 与 Pet，Three.js），Blender 4.x 的 glTF 2.0 导出；导出面板选项名随 Blender 版本不同，务必用导出后数据验证（§13），不要凭印象。
> 形态键/骨骼按名读取、缺失即跳过，可增量补。取代早前的 `角色_场景_道具_模型导入说明书_v2.md`，以此为单一事实来源。

> **现状校正**（工单 `cc-tasks/2026-09-27-character-assets-and-performance.md`，CA-09 增量维护中；§17 说明本文还差什么才算验收）：
> - Room/Pet 从单个 GLB、本机 RoomSettings 与同目录侧车（`.materials.json` / `.expressions.json` / `.motions.json`）读取配置，**不会读取 `character.json`**；其 boneMap、expressions、physicsBones、idleClip 示例只是历史拟议方案。
> - **眼神有两条路**：`leftEye`+`rightEye` 两只眼骨都映射时 `auto` 走骨骼（每只眼单独限幅），否则走 `eyeLook*` 形态键（§4.4、§11.3）。
> - Room 会播放 GLB 的 idle clip；**Pet 不播放 GLB clip**，只有形态键与程序化微动。
> - `.ptchar` 角色包：后端导入命令已就绪，**前端导入界面未接**（§14）。
> - 角色包合同见 [角色包协议](../character-package-contract.md)。
> - **实操入口在 §8（交付流程）**；§9～§16 是各步骤细则、故障对照与 agent 检查点。

## 字段状态总览（先看这张表，再动手）

「可用」= 当前代码已消费，做了就生效；「校验器有」= 只有解析校验，应用不会读取；「未冻结」= 格式要等对应工单定，**不要先写、不要先声明 capability**。

| 内容 | 状态 | 对应工单 | 说明 |
|---|---|---|---|
| GLB 本体：骨名、形态键名、`phys_chain`、`idle` clip | 可用 | — | 见 §3、§4.1、§4.5、§4.6 |
| `<模型名>.materials.json` 侧车（FACE/HAIR/CLOTH Toon 材质） | 可用（真实窗口验收未做） | CA-06 | 见 §4.8 |
| `manifest.json`（角色包清单） | 校验器有；后端 `.ptchar` 导入命令有，前端导入界面未接 | CA-01 / CA-07 | 用户现在还不能在界面里导入包，字段见 §4.9、§14 |
| `rig/humanoid.json`、`rig/calibration.json` | 未冻结 | CA-03 | 骨骼语义映射以设置面板 RoomSettings 为准（§4） |
| `<模型名>.expressions.json` 侧车（语义名→加权形态键） | 可用（真实窗口验收未做） | CA-04 | 见 §4.8.1；包内 `expressions/expressions.json` 待 CA-07 |
| `<模型名>.motions.json` + `motions/<名>.glb`（外部动作重定向） | 可用，但还没有触发入口（真实窗口验收未做） | CA-05 | 字段见 §4.10；目前没有触发入口：perform 指令还不能带动作 id（需后端契约变更），设置面板的预览按钮也还没做 |
| SKIN / METAL / EYE 材质模板 | 可用（真实窗口验收未做） | CA-06 | 与 FACE/HAIR/CLOTH 共用同一 shader，仅默认参数不同，见 §4.8 |
| GLASS 材质模板、脸部 SDF | 未实现 | CA-06 | GLASS 写进 materials.json 会被识别并跳过；SDF 需要额外贴图，见下方「验收前需要你提供的东西」 |

### 验收前需要你提供的东西（持续更新）

代码阶段只搭好基础设施。下面这些素材/确认项只有你能给，集中放在这里，导入验收时一起核对。

| 项目 | 需要什么 | 影响 |
|---|---|---|
| 头发骨、眼骨的父级 | 重新导出时让 `DEF-hair_*`、`DEF-eye.*` 挂在头骨（`DEF-spine.006`）之下，不要挂在 armature 根下 | 否则躯干链被判为断链：自然站姿被跳过，呼吸/肩噪声/头部微漂移被关闭，眼睛不跟着头转 |
| 骨骼权重 | 头发网格里被拆成「头骨一半、头发骨一半」的接缝顶点，权重要么全给头骨、要么全给头发骨 | 否则接缝处会被拉扯 |
| 动作文件 | 一个或多个只含动作的 GLB（同目录），骨架用 Rigify/Mixamo 等常见命名，动作原地、不要烘焙约束外的位置偏移；每个动作的 clip 名、是否循环、希望只动上半身/手臂还是全身、是否由动作接管头眼。动作运行时尚未接入（`motions.json` 与重定向核心已就绪），验收时一起测 | CA-05 |
| 诊断报告 | 导入验收时由我在客户端读取诊断快照（缺失骨、断链、降级原因、表情/材质绑定状态），你不需要手工收集；设置面板里的查看入口还没接 | 排错 |
| 表情映射 | 如果形态键名不是 `smile`/`sad`/`angry`/`surprised`/`blink`/`mouthOpen` 等，列出你的真实键名（或直接写 `.expressions.json`）；多网格同名键请标明想驱动哪个网格 | 表情是否生效 |
| 脸部阴影 SDF 贴图 | 与脸部底色贴图同 UV 的灰度图（脸部明暗阈值图）。脸部 SDF 尚未实现；没有这张图时脸部用普通 FACE 明暗，不会报错 | 脸部 SDF 阴影 |
| 材质贴图 | 每个槽位的 `<槽位>__ShadowTint.png`、`<槽位>__TransitionTint.png` 放在 GLB 同目录，文件名写进 `shadeMap`/`transitionMap`；与底色贴图同 UV、同分辨率更稳 | 阴影色与过渡色 |
| 眼睛槽位 | 眼球槽位用 `EYE` 模板；眼睑/睫毛槽位保持 `outlineWidth: 0` | 避免描边在透明片上变成黑边 |
| 参考灯光与相机 | 想与 Blender 对比时，给出 Blender 里那一帧的灯光方向和相机，我据此固定一组参考场景 | CA-06 参考场景比对 |

骨骼、表情、动作三类配置的 JSON 格式冻结前，建模端**不需要返工**：Blender 工程里的骨名、形态键名、自定义属性不变，将来只是把「语义角色 → 你的名字」补写成配置。

---

## 0. TL;DR（最少要知道的）
1. 单位 **1 = 1 米**，角色直立、**面朝 +Z**、Y 轴向上。
2. 文件丢进：角色 `public/room/character/`、场景 `public/room/scene/`、道具 `public/room/props/<类别>/`。
3. 形态键**用规范英文名**（见 §3），做了就自动生效；只做了一部分也能跑。
4. 眼神**两条路都支持**：做 `eyeLookLeft/Right/Up/Down` 四个形态键，或映射 `leftEye`+`rightEye` 眼骨（两只都要），路由默认 `auto` 自动挑（见 §4.4）。转头/呼吸/肩动的骨骼映射只通过 RoomSettings 生效，§4 的 `character.json` 示例尚未接入。
5. 绑骨**按 T-pose 或 A-pose 导出都行**，站姿放松由运行时叠加，不改 bind pose；左右别接反、骨骼缩放别用负值（见 §4.1.1）。
6. **头发/尾巴/飘带这类会晃动的部位，优先做骨骼 + 打「物理链」标记（见 §4.5），不要用形态键做飘动**——形态键只能循环播放，物理链才会跟着转头/动作自然甩动、有惯性。
7. 加了当前代码识别的标准形态键 → 不用改代码；异名键用 `.expressions.json` 重映射（§4.8.1）。
8. 第一次交付按 **§8 交付流程** 走，每一步有可检查的结果和停止条件。

---

## 1. 坐标 / 单位 / 朝向（统一度量衡）
| 项 | 规范 |
|---|---|
| 单位 | 1 Three.js 单位 = 1 米。Blender 默认米制即可。 |
| 朝向 | 角色**面朝 +Z**（镜头在 +Z 看向她）。Y 向上，X 向右。 |
| 姿态 | 直立、A/T-pose 或自然站/坐姿均可；表情形态键以此为基线。 |
| 原点 | 角色：原点放**双脚之间地面**（贴地模式用）或**胸腔中心**（自由模式用）都行——代码会自动量包围盒归一化。 |
| 比例 | 角色真实身高约 **1.6m**。**但导出尺度不必精确**：代码按包围盒高度归一化到 1.6（`scaleMul` 可再微调）。 |

> 因为角色会被**自动归一化**，你导出大小不必纠结。场景与道具**不归一化**（见 §5），所以它们要按真实米制建模。

---

## 2. 文件夹布局与命名
```
public/room/
├── character/         # 角色（半身/全身均可），可放多个，设置里下拉选
│   ├── character.glb  # 默认兜底文件名
│   └── <任意名>.glb
├── scene/             # 场景/房间，可放多个
│   ├── room.glb       # 默认兜底文件名
│   └── <任意名>.glb
└── props/             # 道具（未来：可互动小物品），按类别分子文件夹
    ├── desk/  book.glb  cup.glb ...
    ├── plush/ bear.glb ...
    └── <类别>/ <道具>.glb
```
- 文件名**建议纯 ASCII**（中文名能用但 URL 需转义，麻烦）。
- `character.glb` / `room.glb` 仅作"找不到设置时的默认兜底"，**不再硬编码**——实际用哪个由设置面板下拉决定。

---

## 3. 角色形态键命名标准（Shape Keys）
**大小写敏感。** 导出 glTF 时务必勾选导出 Shape Keys 及其名称。各值域 0–1。

### 3.1 表情（情绪驱动；做了哪些就有哪些，缺的走回退）
| 名称 | 含义 | 关联情绪 |
|---|---|---|
| `smile` | 微笑/开心嘴型 | 开心、病娇 |
| `sad` | 难过/嘴角下垂 | 低落 |
| `angry` | 生气/收嘴皱鼻 | 生气 |
| `surprised` | 惊讶/张嘴瞪眼 | 惊讶 |
| `blush` | 脸红 | 病娇 |
| `eyesWide` | 睁大眼 | 惊讶回退 |
| `browDown` / `browUp` | 眉下压 / 上扬 | 生气回退 / 备用 |

### 3.2 待机/说话（系统自动驱动，别用它们做情绪）
| 名称 | 含义 | 驱动方式 |
|---|---|---|
| `blink` | 双眼闭合 | 自动周期眨眼 + 部分情绪半阖眼 |
| `mouthOpen` | 嘴/下巴张开 | 说话时自动开合（口型） |
| `hairSwayLeft` | 头发向左飘 | **兜底方案**：仅当角色没有 §4.5 物理骨骼链时，待机自动交替播放 |
| `hairSwayRight` | 头发向右飘 | 同上 |

> ⚠️ `hairSwayLeft/Right` 不再是推荐做法，只是**未绑骨角色的降级兜底**（比如极简半身模型不想开骨骼）。
> 它是固定循环，跟转头/说话等实际动作没有因果关系，转头时头发不会跟着甩，容易显得头发"浮"在空中。
> **只要头发做了骨骼，就应该走 §4.5 物理链，系统会优先用物理链、忽略这两个形态键**，两者不会叠加冲突。
> 原计划的 `hairWindStrong`/`hairWindSoft` 已无必要——物理链的 `gravity`/`stiffness` 参数能覆盖，不再作为形态键扩展名保留。

### 3.3 视线（Phase 3 "看你"，推荐做）
| 名称 | 含义 |
|---|---|
| `eyeLookLeft` `eyeLookRight` | 眼球左/右偏 |
| `eyeLookUp` `eyeLookDown` | 眼球上/下偏 |

### 3.4 口型进阶（可选，想要更像说话再做）
`visemeAa` `visemeIh` `visemeOu`——三个基础口型。默认只用 `mouthOpen`，做了 viseme 可获得更细致的对口型（需代码侧开启，属扩展）。

---

## 4. 控制骨骼（视线转头 + 程序化微动）—— 用 `boneMap`，不靠固定骨名

> **重要：代码不写死骨名。** 因为 Rigify(human) 导出的形变骨是 `DEF-` 前缀、且脊柱编号随版本变化。你需要把"语义角色 → 你导出里的真实骨名"映射一遍，代码按映射找骨、找不到就跳过。怎么知道真实骨名？开发模式下打开通话，**控制台会打印 `[room] bones: [...]`** 列出角色全部骨名。
>
> **当前唯一生效的写入口是设置面板（视频通话 → 设置）写入的 `RoomSettings.perCharacter[<glb 文件名>].boneMap`（localStorage）**，按 GLB 文件名隔离。本节下面的 `character.json` 示例只表示字段形状，**运行时不读取**，见 §4.2。
>
> `boneMap` 只负责**数量固定、语义单一、由系统主动驱动**的骨（头、胸、肩、眼）。**会晃动的辅助骨（头发/尾巴/飘带等，数量不固定）不走这里，走 §4.5。**

### 4.1 语义角色（代码用这些"角色"，你映射到实际骨）

角色名与 +Y 上 / +Z 朝前的空间约定沿用 VRM 1.0，以后接外部动作可以直接重定向，不用再做第二套映射。全部角色定义在 `src/shared/character/humanoid.ts`。

**核心角色**（表演层直接驱动）：

| 角色 | 用途 | 是否必需 |
|---|---|---|
| `head` | 看你转头 + 头部潜意识微转 | 想要看你/头微动则需要 |
| `chest`（或 `spine`） | 程序化呼吸起伏 | 想要呼吸感则需要 |
| `shoulderL` / `shoulderR` | 肩膀高低微动 | 可选锦上添花 |
| `leftEye` / `rightEye` | **眼球骨骼注视已实现**：两只眼都映射到时，眼神路由 `auto` 会自动选骨骼（精度高于形态键）；只映射一只不算，因为单骨无法推断镜像。映射后同时用于裁掉 clip 里的眼骨轨道 | 想要骨骼眼神则需要两只都映射 |

**人体角色**（自然站姿、半身判定、以后的重定向用）：

| 角色 | 说明 |
|---|---|
| `hips` | 骨架根。站姿验证必需 |
| `neck` | 颈，位于 `chest` 与 `head` 之间 |
| `upperArmL/R`、`lowerArmL/R`、`handL/R` | 上臂 / 小臂 / 手。站姿放松（垂臂、微屈肘、手腕内收）需要上臂和小臂 |
| `upperLegL/R`、`lowerLegL/R`、`footL/R`、`toesL/R` | 腿脚。**不是必需**：全缺就按半身模型处理，只是不做足部接触 |

> **站姿验证需要**：`hips`、`spine`、`chest`、`head`、两侧 `upperArm`、两侧 `lowerArm`。缺任何一个，控制台会打印缺了哪个并标记站姿未验证——不会假装成功，也不会报错崩掉。

### 4.1.1 自然站姿：不要求你导出成站姿

绑骨工程按 T-pose 或 A-pose 导出都可以。运行时会量出上臂与"垂直向下"的夹角，**只补差值**：T-pose 补得多，A-pose 补得少，本来就已经是放松垂臂（≈8°）的骨架一点都不补。

这些偏移是**加在骨骼载入时的局部旋转上的增量**，GLB 里的 bind pose 不会被改写，也不会和动画 clip 打架。所以：

- 你不需要为了"站得自然"去调绑骨工程的 rest pose。
- 但**左右必须真的分左右**：代码用世界坐标 X 判断，左侧角色骨要在角色自己的左手边（+X）。左右接反会打印 `handL/handR look swapped` 这类警告。
- **骨骼缩放必须为正且各轴一致**。手工镜像出来的负缩放骨会让旋转偏移变成切变，控制台会警告。

### 4.2 boneMap 字段形状（示例，`character.json` 未接入）

> 下面的 JSON 只用来说明"语义角色 → 真实骨名"的字段形状。**运行时不会读取角色目录下的 `character.json`**；同样的键值请通过设置面板填入，它落在 `RoomSettings.perCharacter[<glb 文件名>].boneMap`。

Rigify 命名：
```json
{
  "boneMap": {
    "head": "DEF-spine.006",
    "chest": "DEF-spine.003",
    "spine": "DEF-spine.001",
    "shoulderL": "DEF-shoulder.L",
    "shoulderR": "DEF-shoulder.R",
    "leftEye": "DEF-eye.L",
    "rightEye": "DEF-eye.R"
  }
}
```

Auto-Rig Pro（ARP）命名（实测导出骨名，小写 `.x`/`.l`/`.r` 后缀）：
```json
{
  "boneMap": {
    "head": "head.x",
    "chest": "spine_02.x",
    "spine": "spine_01.x",
    "shoulderL": "shoulder.l",
    "shoulderR": "shoulder.r",
    "leftEye": "eye.l",
    "rightEye": "eye.r"
  }
}
```

不写 boneMap 时，代码按一组默认候选名尽力匹配，**大小写不敏感、但要求整名相等**（不是子串匹配，否则 `hand` 会认领 `handle`）。候选优先级：Rigify 形变骨名 → 通用/Mixamo 名 → Auto-Rig Pro 的小写 `.x`/`.l`/`.r` 名。三套互不冲突，全部候选见 `ROLE_CANDIDATES`（`src/shared/character/humanoid.ts`）。

全套人体角色的 Rigify 候选（绑骨工程照这套命名就能零配置全中）：

```
hips      DEF-hips / DEF-pelvis        neck       DEF-spine.004
spine     DEF-spine.001                chest      DEF-spine.003
head      DEF-spine.006                eye        DEF-eye.L / DEF-eye.R
shoulder  DEF-shoulder.L / .R          upperArm   DEF-upper_arm.L / .R
lowerArm  DEF-forearm.L / .R           hand       DEF-hand.L / .R
upperLeg  DEF-thigh.L / .R             lowerLeg   DEF-shin.L / .R
foot      DEF-foot.L / .R              toes       DEF-toe.L / .R
```

匹配不到的角色，相关效果静默跳过，不报错。**最稳妥还是照控制台打印的真实骨名显式写 boneMap**。

> 显式写错了会被告知：`boneMap` 里指向一个不存在的骨名时，控制台打印 `boneMap.<角色> points at "..." which is not a bone in this model`，然后仍退回候选匹配（不至于让角色没头）。改名后没更新映射就属于这种情况。

### 4.3 最小可用（按投入从小到大）
1. **只想要"看你"**：映射 `head`。眼球偏移可以只做 §3.3 的 `eyeLook*` 形态键，也可以映射 `leftEye`+`rightEye` 走骨骼（两只都要）。
2. **想去"塑料站桩感"**：再映射 `chest`（呼吸）和 `shoulderL/R`（肩微动）。
3. **想要自然站姿**：补齐 `hips`、`spine`、`chest`、`head`、两侧 `upperArm`/`lowerArm`（见 §4.1）。
4. **想要完整人体**：再补 `neck`、`hand`、腿脚。

这些骨**有就生效、没有就跳过**，可以增量补；半身模型一切照旧运行，只是站姿标记为未验证。

### 4.4 表演路由（脸/眼神/身体各由什么驱动）

同一个模型可能既有形态键、又有脸部/眼部骨骼。两者同时驱动会**双重叠加**（眼球转两次、嘴张两倍），所以每个维度**只允许一个最终写入者**，由路由决定是谁：

| 维度 | 可选 | `auto` 怎么选 |
|---|---|---|
| 表情 `face` | 自动 / 形态键 / 骨骼 / 关闭 | 有表情形态键就用形态键 |
| 眼神 `gaze` | 自动 / 形态键 / 骨骼 / 混合 / 关闭 | **两只眼骨都在就用骨骼**，否则用 `eyeLook*` 形态键 |
| 身体 `body` | 自动 / 程序化 / 动画 / 关闭 | 有 idle clip 就 clip + 程序化，否则纯程序化 |

- **`auto` 是默认值，也是推荐值**：重新导出模型后能力变了，`auto` 自动跟上，不用回设置里重配。
- 手动指定的位置：视频通话 → 设置 → **表演路由**，按角色模型文件分别记忆。
- **`混合` 只在显式选择时才可能生效**，且要求形态键和眼骨同时存在；`auto` 永远不会隐式合并两个驱动。
- **眨眼和口型不参与路由**：它们必须始终能闭上/张开，任何表情路由都不会压制它们。所以你做不做脸部骨骼，眨眼和说话都正常。
- 路由降级原因会打印在控制台（`[room] route note:`），不会静默失效。

> 纯不想碰骨骼：头转可用形态键 `headYawLeft/headYawRight/headPitchUp/headPitchDown` 近似（效果不如骨头自然，呼吸/肩动则无法用形态键替代）。

### 4.5 物理骨骼链（Spring/Dangle Bones）—— 头发、尾巴、飘带等的推荐方案

> 这套系统跟 `boneMap` **完全独立**：数量不固定、不用手动一根根映射，靠**骨骼自定义属性**自动识别，运行时用弹簧物理实时驱动，天然带惯性和跟随感（类似 VRM 的 SpringBone）。

**Blender 侧怎么标记一条链：**

1. 正常做骨骼链（比如一撮头发 `hair.L.001` → `hair.L.002` → `hair.L.003`，首尾相连、层级父子关系正确）。
2. 选中**链的第一根骨**（根骨，比如 `hair.L.001`），在 Bone Properties → Custom Properties 里新增：
   - `phys_chain` = `1`（标记"我是一条物理链的根"，运行时会自动沿子骨层级往下找到整条链，不用管中间骨叫什么名字）
3. 可选：在同一根骨上再加几个自定义属性微调这条链的手感（不写就用代码侧默认值）：
   - `phys_stiffness`（刚度，0~1，越低越软越飘，默认约 0.15）
   - `phys_damping`（阻尼，0~1，越低甩得越久，默认约 0.85）
   - `phys_gravity`（重力影响，默认约 0.3，让发梢有自然下垂趋势）
4. **（仅 Rigify）** 如果是 Rigify 生成的骨架：给 metarig 里的 hair 骨设 `rigify_type = basic.super_copy`，正常生成；**自定义属性要打在 metarig 原始骨上**，Generate 时会带到生成的 `DEF-` 骨上。
5. 导出 GLB 时，Blender glTF 导出面板要勾选 **「Custom Properties」**（默认可能没开），否则这些标记不会进 glb。**（ARP 注意）** ARP 骨架没有 metarig 转生成这一步，`phys_chain`（及可选 `phys_*` 参数）直接打在 ARP 骨架本身的头发形变骨上即可；导出后务必验证自定义属性存活——看下方 DEV 控制台 `[room] phys chains` 是否非空，为空说明属性被导出流程剥掉了，需要在导出面板寻找保留自定义属性的选项，或导出后二次处理补回。
6. **（ARP spline 头发注意事项）** `phys_chain` 必须打在**形变链根骨**上（如 `spline_01.x`），不能打在 `c_spline_*` 控制骨上——控制骨在 glb 里通常没有子链，且勾选"仅导出形变骨骼"后控制骨本身会从导出结果里消失，链就找不到了。

**运行时（three.js）自动做什么：**
- 加载时遍历骨骼树，找到所有带 `phys_chain` 属性的根骨（读取的是 glTF node 的 `extras` → three 里的 `bone.userData`），沿子骨自动收集整条链。
- **DEV 控制台会打印 `[room] phys chains: [...]`**（列出识别到的链根骨名），方便你确认 `phys_chain` 是否成功导出——**如果这里是空的，多半是导出时没勾 Custom Properties**。
- 每帧对整条链跑一次简化弹簧-阻尼积分：目标位置由父骨（比如 head）的实时朝向决定，实际位置用 `phys_stiffness`/`phys_damping`/`phys_gravity` 追赶目标，产生延迟和甩动惯性。物理在头部转动/微动**之后**结算，所以转头时头发会自然跟甩。
- 如果角色**同时**有 `hairSwayLeft/Right` 形态键和物理链，**物理链优先生效，那两个形态键会被系统跳过**，不会叠加变形。
- **排查：Rigify 用户务必只导出 deform 骨**（导出面板 Data → Armature → **Export Deformation Bones Only**）。如果 `ORG-`/`DEF-` 两套骨都导出，且自定义属性打在 metarig 上被同时带到两套骨，会出现两条重叠链每帧互相覆盖同一批骨（表现为抖动/错位）；运行时按「先到先得」丢弃重叠部分并在 DEV 控制台打印 `[room] phys chain overlap` 警告。确认方法：**DEV 控制台 `[room] phys chains` 数量应等于你实际标记的链数**，且没有 overlap 警告。

**可选覆盖的字段形状**（运行时从 `RoomSettings.perCharacter[<glb 文件名>].physicsBones` 读取；同名 `character.json` 文件不会被读取）：
```json
{
  "physicsBones": {
    "default": { "stiffness": 0.15, "damping": 0.85, "gravity": 0.3 },
    "overrides": {
      "hair.L.001": { "stiffness": 0.3, "damping": 0.8 },
      "hair.R.001": { "stiffness": 0.3, "damping": 0.8 }
    }
  }
}
```
> `overrides` 的 key 是链根骨在 glb 里的真实名字（跟 boneMap 一样，照控制台打印的骨名照抄）。不写就全部用 `default`。

**设置面板里的"物理强度"总调节**（视频通话 → 设置 → 物理骨骼）：一个 0–1 的滑杆，直接写 `RoomSettings.physicsBones.default.gravity`（0 = 完全不摆）。这是目前唯一暴露的可视化调节，`stiffness`/`damping` 目前只能通过 Blender 自定义属性写死在模型里。**滑杆读写的是 `RoomSettings`（localStorage）**，没有任何 `character.json` 参与。

**适用范围不止头发**：耳朵、尾巴、裙摆、挂饰等任何"跟主体有延迟地跟随摆动"的部位，都按同一套 `phys_chain` 标记法处理，以后加非人形角色（猫耳、兽尾）也复用这套，不用另开系统。

**（预留，暂不需要做）碰撞体**：如果以后发现头发甩动会穿模到肩膀/身体，可以在 Blender 里放一个命名为 `collider_<部位>` 的空物体（Empty，用其 Radius 当碰撞球半径），导出后运行时用来做头发和身体的简单球体碰撞。**这条现在不用管**，只是预先说明以后加的话走什么路子，不会跟现有导出流程冲突。

### 4.6 动画 clip（可选）

> 首版目标是一个 idle 循环 clip 端到端跑通；多 clip / 情绪化 idle 是后续单。

**命名约定**：待机循环 clip 命名 `idle`（大小写不敏感）；有多个 clip 时系统默认选 `idle`，找不到就选第一个。导出 glTF 时勾选 **Animation**。

**分层规范（定死）**——引入 clip 后同一根骨会被多个系统写，所有权和每帧写入顺序如下：

| 骨 | 所有者 | 说明 |
|---|---|---|
| 头（`boneMap.head`）、眼骨（`boneMap.leftEye`/`rightEye`） | 程序化（gaze/gesture/microNoise） | **运行时加载 clip 时会自动删除这些骨的轨道**，不用在 Blender 里手动删 |
| `phys_chain` 物理链全部链骨（含每链最末端子骨） | 弹簧物理 | 同上，运行时自动删除轨道 |
| 胸/肩（`boneMap.chest`/`spine`、`shoulderL`/`shoulderR`） | clip 为底、程序化叠加（additive） | 呼吸/肩微动在 clip 基础上叠加偏移，不会漂移累积 |
| 其余全部骨 | clip | 正常播放，不受程序化系统干预 |

> **头/眼骨/物理链轨道会被运行时忽略，不用在 Blender 里手动删**——运行时按 `boneMap`/`phys_chain` 标记自动识别并从 clip 里裁掉这些骨的轨道，冲突由代码侧解决，建模端不用操心。

**idle clip 选择**：缺省自动选择（名为 `idle` 的 clip 优先，否则取第一个 clip）。可覆盖的入口只有 `RoomSettings.idleClip`（localStorage，随机位一起记住），`character.json` 不被读取，设置面板暂无可视化开关。所以**不要把舞蹈等非待机动作当成唯一 clip 导出**，否则它会被当作 idle 循环播放。CA-03 将改为由角色包显式声明。

另外，Pet（桌宠窗口）当前**不播放 GLB clip**，只有形态键和程序化微动；clip 相关内容目前只影响 Room。

### 4.7 句级表演层（意图映射）—— 对模型资产的要求：**零新增**

> 系统会把 AI 回复里的 `*动作描写*`（她凑近了一些、歪着头看你…）在后端翻译成受控的表演指令，
> 台词气泡显示到哪一句，角色就演到哪一句。详见 `cc-tasks/12-perform-intent-mapping-client.md`。

对建模/绑骨侧来说**不需要任何新资产**，表演层完全复用你已经做好的东西：

| 表演能力 | 用到的资产 | 缺了会怎样 |
|---|---|---|
| 句级表情（开心/低落/惊讶…） | §3.1 表情形态键 | 缺哪个表情键，哪个表情静默跳过（有 fallback 链） |
| 点头/摇头/歪头（左右）/低头 | `boneMap.head` | 无头骨则头部手势全部跳过，其余照常 |
| 视线（看你/移开/低垂/游移） | §3.3 `eyeLook*` 形态键，或 `leftEye`+`rightEye` 两只眼骨（§4.4 路由） | 两者都没有则视线不动 |
| 前倾/后仰/蜷缩/挺直（posture） | `boneMap.chest`(或 `spine`) + `shoulderL/R` | 缺哪根骨该姿态少一分量，不报错 |
| 动作能量（幅度/呼吸快慢缩放） | 上述同一批骨 | 同上 |

要点：

- **做全 §3 形态键 + §4 boneMap 四类骨，表演层就是满配**；已按本指南导出的模型直接受益，不用重导。
- 表演与 §4.6 idle clip 的分层规则不变：头骨归程序化独占，posture 在胸/肩上以叠加方式写入，
  与 clip、呼吸互不打架。
- 表演指令来自后端映射（`Emerald-presence` 的 `performance_mapping` 配置，可整体关闭）；
  关闭后角色回到"只有 mood 基调表情"的现状。

### 4.8 Toon 材质侧车 `<模型名>.materials.json`（可用）

放在角色 GLB 旁边（例如 `character.glb` 对应 `character.materials.json`），Room 与 Pet 加载角色后都会读取。
先查本机可写目录，再查内置资源；上限 256KB，只含数据；文件无效则**回退为模型自带材质**，不会报错中断。
解析与范围校验在 `src/shared/character/materialsConfig.ts`。

```json
{
  "schemaVersion": "1.0.0",
  "bindings": [
    {
      "id": "face",
      "mesh": "Body",
      "slot": 0,
      "materialName": "M_Face",
      "template": "FACE",
      "params": { "shadeColor": "#c9a9a6", "shadeThreshold": -0.05, "shadeSoftness": 0.25, "rimStrength": 0 }
    }
  ],
  "looks": { "night": { "face": { "shadeColor": "#6a5a7a" } } }
}
```

| 字段 | 规则 |
|---|---|
| `schemaVersion` | `1.x.y` |
| `bindings[].id` | `[A-Za-z0-9._-]`，1–48 字符，不得重复 |
| `mesh` + `slot` | 网格节点名 + 材质槽序号（从 0 起）；**这对组合必须唯一**，名字本身不是身份 |
| `materialName` | 建模时的材质名；与运行时不一致则判为过期、不应用，防止重导出后串槽 |
| `template` | `FACE` / `HAIR` / `CLOTH` / `SKIN` / `METAL` / `EYE`（默认参数不同，shader 相同）。`GLASS` 会被识别并**跳过** |
| `baseColor` | `#rrggbb`；不写则保留原贴图与原色 |
| `shadeColor` / `rimColor` | `#rrggbb` |
| `edgeLow` / `edgeHigh` | −1 到 1，明暗混合区间（光线与法线夹角的余弦，对应 Blender 的 Shadow Edge Low/High，默认 −0.22 / 0.68）。旧字段 `shadeThreshold`/`shadeSoftness` 仍可读，会换算成这一对并给出警告 |
| `transitionStrength` | 0 到 4，交界钟形曲线乘该值后混向过渡色（默认 0.2） |
| `hairSheen` | 0 到 2，头发高光 `pow(max(N·H,0),12)`，颜色 (0.88,0.93,1.0)；HAIR 默认 0.075 |
| `outlineWidth` / `outlineColor` | 描边：反壳法，宽度 0 到 0.02（模型单位，米），0 关闭；颜色 `#rrggbb`。透明睫毛/发片槽位建议保持 0 |
| `shadeMap` / `transitionMap` | 同目录 PNG 文件名（不含路径，≤12MB），分别给出阴影色与过渡色；与底色贴图共用 UV，源材质没有底色贴图时忽略。不写 `shadeMap` 则用 `shadeColor` × 底色 |
| `rimStrength` | 0 到 2，0 关闭边缘光 |
| `rimPower` | 0.5 到 8，越大越细 |
| `looks` | 外观变体：`look 名 → binding id → 参数覆盖`，切换不需要重新烘焙 |

参数优先级：模板默认 < 绑定 `params` < 所选 look < 本机覆盖。未知参数名只警告并忽略，越界或格式错误则整份文件被拒绝。
模板默认值：FACE 阴影偏粉，HAIR 默认带一点边缘光与头发高光，CLOTH 用基础值。
着色公式对应 Blender 节点组 `V006_Clean_Toon`：`t = smoothstep(edgeLow, edgeHigh, N·L)`，颜色 `mix(阴影色, 底色, t)`，
交界处按 `transitionStrength` 混向过渡色，再加 `pow(1−N·V, rimPower)·rimStrength` 边缘光与头发高光。`L` 取场景里的真实灯光（多灯按亮度加权），不写死方向。
PNG 贴图靠 Rust 命令 `read_room_material_map` 读取，只允许模型同级目录；缺文件时该槽位退回 `shadeColor`。

**不要期待：** Blender 节点原样移植、脸部 SDF（planned）。真实窗口画面与 Blender 的比对尚未做。

### 4.8.1 表情映射侧车 `<模型名>.expressions.json`（可用，真实窗口验收未做）

形态键名和内置名字不同（例如叫 `face_smile`），或一个表情要同时驱动多个网格时，用它把「语义名」映射到真实形态键。放在 GLB 旁，上限 256KB，只含数据；无效则忽略并沿用模型自带的同名形态键。

```json
{
  "schemaVersion": "1.0.0",
  "expressions": {
    "smile": [
      { "key": "face_smile", "weight": 0.8 },
      { "key": "cheek_up", "mesh": "Head_Face_Neck" }
    ],
    "blink": [{ "key": "eyes_closed" }]
  }
}
```

| 字段 | 规则 |
|---|---|
| 语义名 | `smile` `sad` `angry` `surprised` `blush` `browDown` `eyesWide` `blink` `mouthOpen` `eyeLookLeft/Right/Up/Down`；其他名字警告并忽略 |
| `key` | 模型上的形态键名 |
| `mesh` | 可选，网格节点名；不写则驱动所有带这个键的网格。**多个网格有同名键且只想驱动一个时必须写** |
| `weight` | 0 到 2，默认 1，相乘后上限 1 |

一个语义名只要有一个目标能解析就整体替换原来的同名绑定；全部解析失败则保留原绑定。眨眼和口型始终独立于表情，所以微笑时仍能闭眼、说话。
情绪到语义名的对应见文末「内置情绪 → 形态键映射」；这个文件只改「语义名 → 真实键」，不改情绪到语义名的关系。

### 4.10 动作侧车 `<模型名>.motions.json` + `motions/` 目录（可用，无触发入口）

动作文件放在角色目录下的 `motions/` 子目录（只含动作的 GLB，文件名仅字母数字 `._-`，≤20MB）；描述文件放在角色 GLB 旁。
动作 GLB 里的骨架按语义角色（head、upperArmL…）自动识别，用「目标静止姿态 × 源静止姿态⁻¹ × 源局部旋转」重定向；位置轨道默认丢弃（原地动作）。

```json
{
  "schemaVersion": "1.0.0",
  "motions": [
    { "id": "wave", "clip": "Wave", "file": "wave.glb", "loop": false,
      "fadeInMs": 200, "fadeOutMs": 300, "mask": "arms", "priority": 5,
      "rootMotion": "inPlace", "headEye": "performer" }
  ]
}
```

| 字段 | 规则 |
|---|---|
| `id` | `[A-Za-z0-9._-]`，1–48 字符，不得重复 |
| `clip` / `file` | 动作 GLB 里的 clip 名；`file` 省略则用角色 GLB 自带动画 |
| `mask` | `full` 全身 / `upper` 上半身 / `arms` 双臂 |
| `priority` | −100 到 100，运行中的动作只会被同级或更高优先级替换 |
| `rootMotion` | `inPlace`（默认）丢弃位移；`keep` 只保留 hips 位移并按髋高比缩放 |
| `headEye` | `performer` 头与眼仍由表演层控制（动作里的头眼轨道被剔除）；`clip` 播放期间由动作接管，结束后表演层从静止姿态缓入 |

动作缺必要骨骼时只播能映射的部分，并在诊断里标注；一条轨道都映射不上则该动作不可用。脚接触与手部 IK 未实现。

### 4.9 角色包清单 `manifest.json`（仅校验器，应用尚不读取）

CA-07 的导入器落地前，这份文件**不会产生任何运行时效果**；先做也不会被消费，仅供提前对齐字段。校验在 `src/shared/character/manifest.ts`。

必填：`schemaVersion`、`assetId`、`revision`、`provenance`（`author`、`license` 必填，`source` 可选）、`minimumRuntime`、`capabilities`、`model`（`uri`、`sha256`）。
`schemaVersion` / `minimumRuntime` 为三段十进制版本，当前只认主版本 1；`assetId` 为稳定小写标识，不是文件名也不是后端角色 ID；
`revision` 为包内容 SHA-256（64 位小写十六进制）；`model.sha256` 为 GLB 内容摘要，**GLB 变化会使本机节点校准失效**。
`capabilities` 可选值 `humanoid` `expressions` `lookAt` `motions` `toon`；未知名只警告、不授予任何能力；未知必需扩展会被拒绝。
`resources` 里的路径必须是包内相对路径：禁止绝对路径、`..`、反斜杠、隐藏路径、忽略大小写后的重名，且声明的文件必须存在。
**声明了 capability 或发布了 resources 文件，并不代表对应效果已实现**，以上表「字段状态总览」为准。
包不能携带可执行脚本、自定义 Shader 源码或远程下载地址。

---

## 5. 场景与道具
### 5.1 场景（`scene/*.glb`）

- **场景相机预设**：GLB 可以包含多个透视相机，但不是每份 GLB 都有。Blender 导出
  glTF/GLB 时需勾选导出相机；镜头应面向预期角色站位。视频通话右下角省略号会列出
  导出的相机节点，选择时人物自动站到镜头前并正面朝向镜头，之后仍可手动摆放与调机位。
  当前 `library_scene_v015.glb` 不含相机节点，须重新导出才能出现选项。
- **按真实米制建模**（不归一化）。以原点为房间中心，地面在 y=0。
- **自带灯光可不导出**：客户端默认剥离 glb 内的灯，用前端可调灯光系统（避免叠加突兀）。若你希望保留场景灯，在设置里开「使用场景自带灯光」。
- 避免超大贴图（注意包体）。

### 5.2 道具（`props/<类别>/*.glb`）—— 设计取向
**采用"道具独立导入 + 分类"，不烘进场景 glb。** 理由：
- 可独立增删/替换，不必重导整个房间。
- 可被单独**摆放**（用 gizmo）与将来**被角色交互**（交互＝一条 avatar 指令，见 v8 自驱）。
- 按类别（desk/plush/...）组织，便于 UI 分组与场景搭配。

道具规范：真实米制、原点放"自然摆放的着地/着桌点"、面朝 +Z 或任意（可旋转摆放）。**交互锚点**（将来角色去摸/拿的点）建议在道具内放一个命名空节点 `anchor`（可选，未来用）。

---

## 6. 「加了新动作必须改代码吗？」—— 答案与机制
分三种情况：

1. **加的是规范内形态键/骨骼**（如补了 `angry`、`eyeLookLeft`，或绑了头/胸/肩骨并在 `boneMap` 映射好，或加了一条打好 `phys_chain` 标记的头发链）
   → **不用改代码**。代码按形态键名 / `boneMap` / `phys_chain` 属性读取，存在即自动生效。

2. **形态键名不同或要组合多个键**（如 `face_smile` + `dimple`）
   → **写 `<模型名>.expressions.json` 侧车**（§4.8.1），把标准语义名映射到真实键，可加权、可指定网格。**全新的语义名**（如自定义 `wink`）仍没有情绪触发它，因为情绪 → 语义名的关系写在代码里（`src/windows/room/morphExpressions.ts`）。

3. **加的是全新"触发通道/输入信号"**（如"听到音乐就摇摆""根据天气变化"这种前所未有的驱动源）
   → 这才需要动代码（新增一个驱动器）。因为这是新逻辑，不是新资源。

> 一句话：**用标准名的新资源（形态键/骨骼/物理链/道具）不用改代码**；异名/自定义资源当前还需要代码或设置面板配合，语义映射由 CA-04～06 交付；**新逻辑/新输入源**始终要改代码。

以下为历史拟议的 `character.json` 字段形状，**运行时不读取**，保留只为便于将来迁移到角色包：
```json
{
  "model": "character.glb",
  "framing": "full",
  "anchorMode": "free",
  "scaleMul": 1.0,
  "offset": [0, 0, 0],
  "yawDeg": 0,
  "fovDeg": 45,
  "expressions": { "...": {} },
  "boneMap": { "...": "" },
  "physicsBones": { "default": {}, "overrides": {} }
}
```
> `hairSwayLeft/Right` 兜底仅在角色**没有**物理链时才有意义，正常有骨骼的角色不用管。
>
> ⚠️ **现状与决策（CA-01）**：`character.json` 不会成为第二份运行时真值，**不会为它新增加载器**。真正生效的覆盖路径只有：Blender `phys_*` 自定义属性、以及设置面板（视频通话）写入的 `RoomSettings`（localStorage，按 GLB 文件名分角色）。已经写了 `character.json` 的用户需把 `boneMap`/`physicsBones`/`idleClip` 手工转到设置面板，`expressions` 等字段暂无消费者。未来的模型自带默认由[角色包协议](../character-package-contract.md)承接。

---

## 7. 导出清单（Blender → glTF .glb）
- [ ] 单位米制、面朝 +Z、Y 向上。
- [ ] 勾选导出 **Shape Keys** 及名称；按 §3 命名。
- [ ] 若做转头/呼吸/肩动：绑相应骨，并在设置面板把真实骨名填入 boneMap（见 §4；DEV 控制台会打印骨名供照抄）。
- [ ] 若头发/尾巴/飘带做了骨骼：链根骨打好 `phys_chain` 自定义属性（见 §4.5），导出时勾选 **Custom Properties**（并在 DEV 控制台确认 `[room] phys chains` 非空）。
- [ ] 没做物理链的角色，可选做 `hairSwayLeft/Right` 形态键作兜底（非必需）。
- [ ] 角色内置动画 clip **可选导出**，命名 `idle`（见 §4.6）；不导出则系统仍用纯形态键+骨骼驱动。
- [ ] 场景/道具真实米制、原点规范；场景灯可不导出。
- [ ] 文件名纯 ASCII，放对文件夹。
- [ ] 想要 Toon 材质 → 写 `<模型名>.materials.json` 放在 GLB 旁（见 §4.8；`mesh`+`slot` 必须取自导出后真实的网格与槽位）。
- [ ] 想覆盖构图/物理参数 → 通过设置面板（RoomSettings）；`character.json` 不被读取。
- [ ] 形态键名不标准 → 写 `<模型名>.expressions.json`（§4.8.1）。
- [ ] 有外部动作 → `<模型名>.motions.json` + `motions/`（§4.10，§12）。
- [ ] 导出后跑 `scripts/blender/audit_glb.py` 与 `audit_glb_anim.py`（§13）。
- [ ] **ARP（Auto-Rig Pro）导出**（已实测验证的路径）：用 Blender 通用 glTF 导出即可，但必须勾 **Data → Armature → 仅导出形变骨骼**（否则 300+ 控制/参考骨全进包，动画通道数爆炸）；动画只保留命名 `idle` 的单个 action；自定义属性经实测在通用导出下存活；ARP 控制器形状网格（`cs_user_*`）导出前排除；真实米制、面朝 +Z、Shape Keys / Custom Properties 勾选。

---

## 8. 交付流程（按顺序做，每步有可检查的结果）

> 本章是操作入口。字段细节在 §3～§4，这里只讲「先做什么、怎么证明做对了、什么时候该停」。
> **状态：此流程尚未被一个全新模型从头到尾复现过**（见 §17）。遇到与实际不符处，以代码和 `scripts/blender/audit_glb.py` 的输出为准，并把差异反馈出来。

### 8.1 新手最短路径（已有绑好骨的模型）

1. 另存一份工程（`角色_deliver_v001.blend`），之后所有操作只在这份上做，源工程不动。
2. 按 §9 清点网格与材质，按 §10 做绑定检查。
3. 按 §13 导出 GLB。
4. 运行 `python scripts/blender/audit_glb.py <导出的.glb>`，看缺哪些语义骨、形态键、眼骨、左右与臂角。
5. 把 GLB 放进 §14 的角色目录，开 Room 看效果；需要材质/表情/动作再按 §4.8 / §4.8.1 / §4.10 写侧车文件。

### 8.2 按骨架类型的入口

| 你的骨架 | 入口 |
|---|---|
| Rigify | 导出只保留形变骨（`DEF-`），别把 `ORG-`/`MCH-` 带出去；`phys_chain` 打在 metarig 原骨上，见 §4.5 |
| Auto-Rig Pro | 导出面板勾「仅形变骨骼」；`phys_chain` 打在形变链根骨，不要打在 `c_*` 控制骨，见 §4.5、§7 |
| 普通/自建骨架 | 骨名随意，在设置面板把语义角色映射到真实骨名（§4.2）；先用 `audit_glb.py` 看哪些角色没认出来 |

骨名示例**仅是候选**。以导出后的真实结果为准：开发模式控制台会打印 `[room] bones: [...]`，`audit_glb.py` 也会列出。不要凭记忆写骨名。

### 8.3 停止条件（不要硬交付）

- 自动权重后手臂、肩、头发弯曲出现明显撕裂或穿插：**这是未完成的绑定**。手工修权重，或停下来交还人工，不能因为「骨架生成成功了」就宣称绑好。
- `audit_glb.py` 报左右反置、负缩放、双骨架：先修源模型再导出，不要靠运行时补偿。
- 想要眼骨注视但只有一只眼骨：补齐两只，或只走形态键注视（§11）。

---

## 9. 建模前检查：备份、清点、绑定

- [ ] **备份/另存**：源 `.blend` 保持原样，交付用派生文件。
- [ ] **网格清点**：列出每个网格对象名、材质槽数。材质槽决定 §4.8 的 `mesh` + `slot` 身份，导出后以 GLB 里的真实网格名与槽位序号为准（`audit_glb.py` 不列材质；写入侧车后，绑定是否命中看诊断快照的 `materials.problems`，设置面板里的查看入口还没接）。
- [ ] **材质清点**：为 FACE/HAIR/SKIN/CLOTH/METAL/EYE 各槽位准备材质名（`materialName` 须与导出后一致）。
- [ ] **骨架与 Armature modifier**：每个应随骨骼运动的网格都有指向正确骨架的 Armature modifier；确认没有第二套骨架（双骨架会让躯干链被判断链，见上方「验收前需要你提供的东西」）。
- [ ] **权重**：每个顶点的权重归一（Normalize All）；肩、肘、腕、颈、头发接缝在姿态模式下实际弯曲检查：手臂抬起 90° 不撕裂，头转动时脖子不穿帮，肘弯不塌。
- [ ] **左右**：左侧骨在角色自己的左手边（+X），不使用负缩放镜像。

---

## 10. 坐标与变换：Z-up 编辑环境 vs Y-up 导出

- Blender 编辑环境是 Z-up，glTF 是 Y-up。导出面板的「+Y Up」（默认开）负责转换，**不需要**为此手动旋转模型。
- 角色在 Blender 里面朝 −Y（正视图能看到脸），导出后面朝 +Z。导出后用 `audit_glb.py` 的臂角/左右检查，或在 Room 里看是否背对镜头。
- **何时应用变换**：只在对象 Scale 不是 1、或有非零旋转时处理。已绑定的模型**不要**无脑 Apply All Transforms：先在骨架与全部子网格上一起 Apply Rotation & Scale（保持父子关系一致），随后重新检查权重与姿态；有疑问就回到未应用前的另存版本。
- 骨骼缩放必须为正且各轴一致（§4.1.1）。

---

## 11. 骨骼类别、半身降级、眼骨与眼睑

### 11.1 四类东西别混

| 类别 | 说明 |
|---|---|
| 控制骨（Rigify `c_`/ARP 控制器） | 只给动画师用，**不导出** |
| 形变骨（`DEF-`/ARP 形变骨） | 真正带动网格，导出的就是这些 |
| 参考姿势（bind/rest pose） | GLB 里的静止姿态，T/A pose 均可，运行时**不改写**它（§4.1.1） |
| 动作姿势 | clip 或表演层叠加的局部旋转 |

### 11.2 骨表与半身降级

| 能力 | 需要的角色 | 缺了会怎样 |
|---|---|---|
| 自然站姿（已验证） | `hips` `spine` `chest` `head`，两侧 `upperArm` `lowerArm` | 站姿标记未验证，诊断里出现 `arm-drop-unavailable` 等稳定代码，不假装校准 |
| 看你/头部手势 | `head` | 头部手势全部跳过 |
| 呼吸/肩动 | `chest` 或 `spine`，`shoulderL/R` | 缺哪个少哪个分量 |
| 足部接触（未实现） | 腿脚角色 | 全缺则当作半身模型；`no-legs`/`partial-legs` 记录在诊断快照 |
| 外部动作重定向 | 动作 GLB 与本模型共有的语义角色 | 只播能映射的部分；一条都映射不上则动作不可用 |

诊断快照里的 `degraded` 字段按左臂、右臂、腿、躯干锚点给出稳定代码和缺失角色，设置面板的查看入口还没接；需要时请使用诊断导出（脱敏，无路径）。

### 11.3 眼球骨与眼睑形态键是两件事

- **眼球骨**（`leftEye`+`rightEye`，**两只都要**）负责视线方向。每只眼单独限幅：向外约 20°，向内约 13°，向上约 11°，向下约 15°，所以眼球不会翻白眼，也不会对到鼻梁上。
- **眼睑形态键**（`blink` 等）负责闭眼，**不参与视线路由**，始终可用。
- 眼球骨的权重应只影响**眼球网格**（眼白+虹膜）；眼睑、睫毛网格不要绑到眼球骨上，否则看向旁边时眼睑会跟着转而穿插。若睫毛必须跟随，用形态键。
- 测试：让角色看向上、下、左、右和「看你/移开」，眼球应只在眼眶范围内转动，不翻眼、不穿出眼睑；眼睑闭合时不应露出眼球。
- 眼骨必须挂在头骨下面，不要挂在 armature 根上，否则眼睛不跟着头转。

---

## 12. 动作文件：导入、对齐、导出

动作文件格式与侧车见 §4.10。制作侧：

1. **重定向**：按附录「Blender 动画重定向 checklist」在已导出的干净 GLB 骨架上做，不在 Rigify 源工程里做。
2. **源/目标参考姿势对齐**：运行时用「目标静止姿态 × 源静止姿态⁻¹ × 源局部旋转」重定向，所以两边的 rest pose 差异会被抵消，但**肢体长度比例差异过大**时手可能够不到该到的位置（IK 未实现）。
3. **Root motion**：默认原地（`inPlace`，丢弃位移）。要保留位移用 `keep`（只保留 hips 并按髋高缩放）。
4. **约束烘焙**：动作里依赖约束（IK、Copy Rotation）的骨必须先烘焙成关键帧再导出，否则 GLB 里没有变化。
5. **导出 clip**：只导出动作，不带蒙皮网格。放进 `motions/` 目录，文件名仅字母数字 `._-`。
6. **全身/局部 mask**：用 `mask` 选 `full`/`upper`/`arms`。
7. **永久修正 vs 临时表演**：永久修正（站姿偏移、骨名映射）进设置或侧车，临时表演用动作；动作结束后表演层缓入，不遗留偏移。
8. **头眼所有权**：`headEye: performer`（默认）剔除动作里的头眼轨道；`headEye: clip` 动作播放期间接管头眼，结束后缓入。Room 里的 idle clip 仍会自动裁掉头/眼骨与物理链轨道（§4.6），**不再要求用户在 Blender 里手工删除头眼动画**。
9. 现状：动作库已接进帧循环，但**没有触发入口**，perform 指令还不能带动作 id（需要后端契约变更）。验收只能走开发调试方式，别承诺用户可见效果。

---

## 13. GLB 导出面板与导出后验证

不同 Blender 版本面板位置和默认值不同，**不要凭印象勾选，导出后用数据证明选项生效**。需要的选项：

| 选项 | 目的 | 怎么证明 |
|---|---|---|
| 仅导出选中对象 / 可见对象 | 避免把控制器形状、参考网格导出 | Room 开发控制台 `[room] bones:` 里没有 `cs_*`、`ORG-`、`MCH-` 骨 |
| Armature → 仅形变骨 | 避免几百根控制骨 | `audit_glb.py` 输出的 `joint_y_range` 合理，`[room] bones:` 数量与形变骨预期一致 |
| 蒙皮（Skinning） | 网格随骨骼运动 | 网格带 skin |
| Shape Keys | 表情 | `audit_glb.py` 的 `morph_all` / `morph_status` 列出形态键名与缺失项 |
| Animation（仅 idle） | 待机 clip；避免形态键动画与表演层争夺 | `python scripts/blender/audit_glb_anim.py <glb>` 看动画通道驱动了什么 |
| Custom Properties | 保住 `phys_chain` | Room 开发控制台 `[room] phys chains` 非空 |
| 材质/贴图 | 外观 | 诊断快照 `materials.problems` 无 stale |

交付前至少跑一遍：`audit_glb.py`（输出 JSON：缺失语义骨、`bad_scale`、`morph_status`、`physics_marked`、`animations` 等）+ `audit_glb_anim.py`（动画驱动）。两者只读，不改文件。

---

## 14. 角色包与导入路径

- **开发**目录：仓库内 `public/room/character/`。
- **发行**目录：用户本机应用数据目录下 `room/character/`（设置里的资产位置入口会显示）。发行版先查本机可写目录，再查打包内置资源。
- 侧车文件（`.materials.json`、`.expressions.json`、`.motions.json`）与 GLB 同目录，`motions/` 子目录放动作 GLB。
- **角色包（`.ptchar`，ZIP）**：后端导入命令已就绪（`inspect_character_package` / `install_character_package`），**前端导入界面尚未接入**，所以现在用户还不能在界面里导入包，也没有真实 `.ptchar` 端到端验收过。包的要求如下，打包前自查：

  | 包内条目 | 安装到角色目录 |
  |---|---|
  | `manifest.json`（必需，≤256KB，UTF-8） | 不安装，只用于校验；`assetId` 须为 3–64 位小写字母/数字/`._-`，且不以 `.` 开头 |
  | `manifest.model.uri` 指向的 GLB | `<assetId>.glb`；其 SHA-256 必须等于 `model.sha256`，否则整包拒绝 |
  | `resources.materials` / `expressions` / `motions` 指向的文件 | `<assetId>.materials.json` / `.expressions.json` / `.motions.json` |
  | `motions/<名>.glb`（仅一层） | `motions/<名>.glb` |
  | `textures/<名>.png`（仅一层） | 角色目录下同名 PNG（给 `shadeMap`/`transitionMap` 用） |
  | `rig/*`、`preview.png` 及其他 | **不安装**（对应功能未实现，不会生效） |

  限制：最多 128 个文件，单文件 ≤64MB，解压总量 ≤256MB；禁止绝对路径、`..`、反斜杠、`:`、以 `.` 开头的路径段、符号链接、忽略大小写后的重名。流程：先写 `.staging-<assetId>` 暂存目录，模型摘要通过后再移动，模型文件最后移入，失败不碰已有版本；已存在同一 `assetId` 时需要确认替换，旧文件保存在 `.prev/<assetId>/` 供回滚（回滚入口尚无界面）。**不同 revision 的比较提示尚未实现**。包不能携带脚本、Shader 源码或远程地址。
- **本机修正**（骨名映射、物理强度、idle 选择）存在 RoomSettings（localStorage），按 GLB 文件名隔离；「恢复默认」清除对应条目。
- **模型重导出后映射失效**：材质 `materialName` 与实际不一致会判过期并不应用；骨名变了需要重新映射；`manifest.model.sha256` 变化会使本机节点校准失效。重导出后重新跑 §13 的审计。

---

## 15. 常见故障对照

| 现象 | 先查 |
|---|---|
| T-pose，手臂不放下 | 站姿未验证：缺 `upperArm`/`lowerArm`，或躯干链断（眼骨/发骨挂在 armature 根下）。看诊断 `degraded` 与 `notes` |
| 手臂反转/手腕翻转 | 左右接反或骨缩放为负：`audit_glb.py` 左右检查，控制台 `look swapped` 警告 |
| 脚滑 | 足部接触未实现；半身或动作未烘焙。不是配置问题 |
| 眼睛不动 | 路由：`auto` 需要两只眼骨，或 `eyeLook*` 形态键；看 `[room] route note:` |
| 眼睛翻白/转向鼻梁 | 眼骨轴向或眼睑绑到眼球骨；运行时已限幅，仍异常则查权重 |
| 表情无效 | 形态键名不在标准内：写 `.expressions.json`（§4.8.1）；多网格同名键需写 `mesh` |
| 头发抖动 | 重叠物理链（`ORG-`/`DEF-` 都导出）：只导形变骨，`[room] phys chain overlap` 警告 |
| 材质发黑 | `materialName` 过期、贴图色彩空间错、阴影色过暗；看材质绑定状态 |
| 透明发片/睫毛黑边 | 透明槽位 `outlineWidth` 应为 0 |
| 只在 Room 有动作 | Pet 当前不播放 GLB idle clip，只有形态键与程序化微动（见 `docs/pet-window-reference.md`） |
| 发行版找不到资源 | 发行版读本机应用数据目录而非仓库 `public/`：检查 §14 的路径 |

---

## 16. 给 agent 的操作检查点

1. **先枚举再修改**：先读真实骨名、形态键、材质槽、动画通道，再决定怎么映射。
2. **另存派生输出**：不修改源工程，不覆盖用户已有 GLB（先备份）。
3. **读取真实标识**：不得猜测骨名；映射、`mesh`+`slot`、`materialName` 都必须来自导出后数据。
4. **不得以截图好看替代数据核查**：权重、左右、缩放、动画通道用审计脚本证明。
5. **汇报未完成项**：绑定未验证、眼骨只有一只、材质 stale、动作无触发入口——如实列出，并说明哪些需要人工验收。
6. 不要把私有角色、真实用户名、绝对机器路径写进可提交的示例。

### 16.1 必须主动提醒用户的缺失素材

agent 在交付结束时，**逐项检查下列素材是否存在，缺的必须在报告里明确告诉用户并说明影响**，不得自行编造或用占位贴图顶替后宣称完成：

| 缺少的素材 | 必须告诉用户的影响 |
|---|---|
| 脸部阴影 SDF 贴图（与脸底色同 UV 的灰度图） | 脸部 SDF 阴影**尚未实现**，也没有这张图；脸部只用普通 FACE 明暗。需要用户提供贴图，且后续工单实现后才会生效 |
| 各槽位 `<槽位>__ShadowTint.png` / `__TransitionTint.png` | 缺则退回 `shadeColor` × 底色，阴影色与过渡色与 Blender 里不同；应与底色贴图同 UV、同分辨率 |
| 高光/金属遮罩 | 目前没有对应模板参数，METAL 只有默认参数；不要承诺遮罩效果 |
| 动作文件（只含动作的 GLB，注明 clip 名、是否循环、mask、头眼所有权） | 没有动作文件则没有动作；有也**没有触发入口**，需要后端 perform 契约支持动作 id |
| 表情映射（真实形态键名，多网格同名键要指明网格） | 缺则只有标准名形态键生效 |
| 眼骨（两只）或 `eyeLook*` 形态键 | 都缺则视线不动 |
| 头发/眼骨的父级、接缝顶点权重 | 见上方「验收前需要你提供的东西」：父级错会让躯干链被判断链，站姿与呼吸被关闭 |
| Blender 参考灯光与相机 | 缺则无法与 Blender 画面比对，材质观感无人工签收依据 |
| 授权/来源信息（作者、许可） | 写 `manifest.json` 的 `provenance` 必填 |

报告里还要写明：哪些项没有在真实窗口验收（目前全部材质、表情、动作、站姿都没有）。

---

## 17. 本文的验收状态

- 本文各章已按当前实现校正，`audit_glb.py` 等脚本存在。
- **尚未做**：从一份未按新协议配置的源模型，按本文走完「绑定检查→映射→站姿→材质→表情/眼神→动作→导出→包校验→导入」的完整复现；Room/Pet 与开发/发行版的双端验收。这是 CA-09 的签收条件，未完成前不要把本文当作已验证流程。

---

## 附：当前内置情绪 → 形态键映射（写在 `src/windows/room/morphExpressions.ts`；形态键名可用 `.expressions.json` 重映射，情绪到语义名的关系不可改）
| 情绪 | 首选 | 回退（缺首选时） |
|---|---|---|
| 平静 | （中性） | — |
| 开心 | `smile` | `smile` |
| 低落 | `sad` | `smile=0` + `blink=0.22`(半阖眼) |
| 病娇 | `smile`+`blush` | `smile`+`blink=0.15` |
| 分心 | `blink=0.25`(半阖眼) | 同左 |
| 生气 | `angry` | `browDown` |
| 惊讶 | `surprised` | `mouthOpen`+`eyesWide` |

---

## 附：Blender 动画重定向 checklist（Mixamo → 干净骨架，避开 Rigify 约束天坑）

> 核心思路：**不在 Rigify 源工程里重定向**（`DEF-` 骨被约束驱动，直接怼动画会打架）。用已导出的 `full.glb` 回导得到无约束的干净骨架，在它上面重定向，再导出。源 `.blend` 不动。

1. **拿动画**：Mixamo（或现成 FBX 包）。下载参数：Format = FBX Binary，**Without Skin**，30 fps，勾 **In Place**（有该选项的动作）。先只下一个 idle。
2. **装插件**：Blender 安装 Rokoko Studio Live（免费，Rokoko 官网/GitHub），启用后侧栏出现 Retargeting 面板。
3. **新建空白工程** → File > Import > glTF 2.0 导入 `full.glb`（导入选项勾 **Custom Properties**，保住 `phys_chain` 标记）。确认模型、形态键、骨架都在。
4. File > Import > FBX 导入动画 FBX。若骨架尺寸异常（Mixamo 常见 0.01 比例），选中它 Object > Apply > All Transforms。
5. Rokoko Retargeting 面板：Source = Mixamo 骨架，Target = `full.glb` 的骨架 → **Build Bone List**（自动匹配）→ 人工核对映射表：`mixamorig:Hips→DEF-spine`、`Spine/Spine1/Spine2→DEF-spine.001/.002/.003`、`Neck→DEF-spine.004`、`Head→DEF-spine.006`、四肢对应 `DEF-upper_arm.L` 等（以控制台打印过的真实骨名为准）。**头发骨不要映射**。
6. Retarget → 播放预览。姿势拧了就用面板里的 rest pose 对齐（Auto Scale / T-pose 工具）再来一次。
7. 选中目标骨架，把烘出来的 Action 重命名为 `idle`（Dope Sheet > Action Editor 顶部名字框）。
8. 导出 glTF：勾 **Animation**、**Shape Keys**、**Custom Properties**；覆盖到 `public/room/character/full.glb`（先备份旧文件）。
9. 开发模式开视频通话：确认控制台 `[room] clips: ['idle']`、`[room] phys chains` 数量不变、表情形态键仍在。

预期瑕疵：重定向可能有轻微滑步/手贴身，半身机位下通常不可见；不可接受再调映射或换动作。

**验证步骤**：
- 无 clip 的旧模型：行为与之前完全一致（回归底线）。
- 有 idle clip：身体循环待机；转头/gaze/点头摇头仍由指令驱动且不与 clip 打架；头发物理正常跟随身体动作；呼吸起伏叠加可见、无漂移累积（挂几分钟观察胸骨不跑偏）。
- 表情、眨眼、口型、VN 气泡全部不受影响。
- 模型热切换（设置里换角色文件）后 mixer 正确重建，无残留动画。

## TV screen expressions (2026-10-10)

Room now reads an opt-in `<model>.screen.json` sidecar. The feature contract defines playback; GLB provides only target node/material identifiers. No source geometry or UV remake is required. Image PNG, timed PNG sequences and built-in procedural presets are supported. Static/animated SVG is not supported. Optional package `resources.screen` installs to `<assetId>.screen.json`; PNGs in `textures/` install beside GLB. Pet remains on its original morph path. See [screen contract](../tv-screen-contract.md). No sidecar means no screen material writes. Existing `.expressions.json` still means morph targets only. Actual Windows/model acceptance remains pending.
