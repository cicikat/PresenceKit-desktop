# 视频通话 角色 / 场景 / 道具 模型导入说明书（权威版）

> 本文是「虚拟空间」功能的**建模规范与统一度量衡**，既给项目作者自用，也面向开源后的第三方建模者。
> 目标：让任何人按此规范导出的 glb，**丢进文件夹就能用**，尽量不改一行代码。
> 适用版本：RoomWindow（Three.js）Phase 2+。形态键/骨骼按名读取、缺失即跳过，可增量补。
>
> **本版并入了「物理骨骼链」规范（§4.5）**：头发/尾巴/飘带类摆动改为**运行时弹簧物理**驱动，不再依赖循环形态键；`boneMap` 收窄为纯语义控制骨。旧的 `hairSwayLeft/Right` 降级为「未绑骨兜底方案」。
> （本文取代早前的 `角色_场景_道具_模型导入说明书_v2.md`，以此为单一事实来源。）

---

## 0. TL;DR（最少要知道的）
1. 单位 **1 = 1 米**，角色直立、**面朝 +Z**、Y 轴向上。
2. 文件丢进：角色 `public/room/character/`、场景 `public/room/scene/`、道具 `public/room/props/<类别>/`。
3. 形态键**用规范英文名**（见 §3），做了就自动生效；只做了一部分也能跑。
4. 想要"看你"的眼神：做 `eyeLookLeft/Right/Up/Down` 四个形态键；想要转头/呼吸/肩动，绑骨（Rigify / Auto-Rig Pro 均可）后在 `character.json` 的 `boneMap` 里把骨名映射给代码（见 §4，**不靠固定骨名**）。
5. **头发/尾巴/飘带这类会晃动的部位，优先做骨骼 + 打「物理链」标记（见 §4.5），不要用形态键做飘动**——形态键只能循环播放，物理链才会跟着转头/动作自然甩动、有惯性。
6. 加了**规范内**的形态键 → **不用改代码**；加**全新自定义**表情 → 写一行 `character.json` 绑定即可，**仍不用改代码**（见 §6）。

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

> **重要：代码不写死骨名。** 因为 Rigify(human) 导出的形变骨是 `DEF-` 前缀、且脊柱编号随版本变化。你**在 `character.json` 的 `boneMap` 里把"语义角色 → 你导出里的真实骨名"写一遍即可**，代码按映射找骨、找不到就跳过。怎么知道真实骨名？开发模式下打开通话，**控制台会打印 `[room] bones: [...]`** 列出角色全部骨名，照抄填进 boneMap。
>
> `boneMap` 只负责**数量固定、语义单一、由系统主动驱动**的骨（头、胸、肩、眼）。**会晃动的辅助骨（头发/尾巴/飘带等，数量不固定）不走这里，走 §4.5。**

### 4.1 语义角色（代码用这些"角色"，你映射到实际骨）
| 角色 | 用途 | 是否必需 |
|---|---|---|
| `head` | Phase 3 看你转头 + 头部潜意识微转 | 想要看你/头微动则需要 |
| `chest`（或 `spine`） | 程序化呼吸起伏 | 想要呼吸感则需要 |
| `shoulderL` / `shoulderR` | 肩膀高低微动 | 可选锦上添花 |
| `leftEye` / `rightEye` | 眼骨转眼（没有眼骨就用 §3.3 形态键 `eyeLook*`） | 可选 |

### 4.2 `character.json` 里的 boneMap（示例）

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

> 不写 boneMap 时，代码会按一组默认候选名尽力匹配——Rigify 候选（`DEF-spine.006/.005`、`DEF-spine.003`、`DEF-shoulder.L/R`、`DEF-eye.L/R` 及 `Head`/`Chest` 等常见名）在前，ARP 候选（`head.x`、`spine_02.x`/`spine_03.x`、`spine_01.x`、`shoulder.l/r`、`eye.l/r`、`c_eye.l/r`）追加在后，两套互不冲突；匹配不到的角色相关效果静默跳过，不报错。**最稳妥还是照控制台打印的真实骨名显式写 boneMap**——ARP 导出骨名以实际控制台打印为准，若与上表有出入按真实名补齐。

### 4.3 最小可用
- 只想要"看你"：映射 `head`（+ 可选眼骨，或用 §3.3 眼形态键）即可。
- 想去"塑料站桩感"：再映射 `chest`（呼吸）和 `shoulderL/R`（肩微动）。
- 这些骨**有就生效、没有就跳过**，可增量补；半身未绑骨时一切照旧运行。

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

**`character.json` 里的可选覆盖**（不想开 Blender 改属性时，也能在这一层调）：
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

**设置面板里的"物理强度"总调节**（视频通话 → 设置 → 物理骨骼）：一个 0–1 的滑杆，直接写 `RoomSettings.physicsBones.default.gravity`（0 = 完全不摆）。这是目前唯一暴露的可视化调节，`stiffness`/`damping` 仍只能通过 Blender 自定义属性或（如果日后接入）`character.json` 调整。**这个滑杆读写的是 `RoomSettings`（本地存储），不是本节下面这份 `character.json`**——见下方提示。

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

**`character.json` / `RoomSettings` 可选覆盖**：
```json
{ "idleClip": "idle_calm" }
```
> 缺省走自动选择（`idle` 优先，否则第一个 clip）。设置面板暂不加可视化开关。

### 4.7 句级表演层（意图映射）—— 对模型资产的要求：**零新增**

> 系统会把 AI 回复里的 `*动作描写*`（她凑近了一些、歪着头看你…）在后端翻译成受控的表演指令，
> 台词气泡显示到哪一句，角色就演到哪一句。详见 `cc-tasks/12-perform-intent-mapping-client.md`。

对建模/绑骨侧来说**不需要任何新资产**，表演层完全复用你已经做好的东西：

| 表演能力 | 用到的资产 | 缺了会怎样 |
|---|---|---|
| 句级表情（开心/低落/惊讶…） | §3.1 表情形态键 | 缺哪个表情键，哪个表情静默跳过（有 fallback 链） |
| 点头/摇头/歪头（左右）/低头 | `boneMap.head` | 无头骨则头部手势全部跳过，其余照常 |
| 视线（看你/移开/低垂/游移） | 眼骨或 §3.3 `eyeLook*` 形态键 | 都没有则视线不动 |
| 前倾/后仰/蜷缩/挺直（posture） | `boneMap.chest`(或 `spine`) + `shoulderL/R` | 缺哪根骨该姿态少一分量，不报错 |
| 动作能量（幅度/呼吸快慢缩放） | 上述同一批骨 | 同上 |

要点：

- **做全 §3 形态键 + §4 boneMap 四类骨，表演层就是满配**；已按本指南导出的模型直接受益，不用重导。
- 表演与 §4.6 idle clip 的分层规则不变：头骨归程序化独占，posture 在胸/肩上以叠加方式写入，
  与 clip、呼吸互不打架。
- 表演指令来自后端映射（`Emerald-presence` 的 `performance_mapping` 配置，可整体关闭）；
  关闭后角色回到"只有 mood 基调表情"的现状。

---

## 5. 场景与道具
### 5.1 场景（`scene/*.glb`）
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

2. **加的是规范外的全新表情**（如自定义 `wink`、`dimple`、某专属脸）
   → **不用改代码**，但要在角色目录放一个 `character.json` 写一行**绑定**，把新形态键挂到某个触发上：
   ```json
   {
     "expressions": {
       "开心": { "smile": 0.85, "dimple": 0.4 },
       "平静": { "calmBreath": 0.3 }
     }
   }
   ```
   代码会把 `character.json.expressions` **合并覆盖**到内置情绪映射上——于是新形态键随对应情绪触发，零代码。

3. **加的是全新"触发通道/输入信号"**（如"听到音乐就摇摆""根据天气变化"这种前所未有的驱动源）
   → 这才需要动代码（新增一个驱动器）。因为这是新逻辑，不是新资源。

> 一句话：**新资源（形态键/骨骼/物理链/道具）不用改代码**（标准名/标记自动生效，自定义名用 `character.json` 绑定）；只有**新逻辑/新输入源**才改代码。这就是"统一度量衡"的意义——把"内容"和"代码"解耦。

`character.json`（全部字段可选，缺失走默认）：
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
> 设置面板里的可视化调节最终也写进同一份设置/预设，`character.json` 作为模型自带默认。
> `hairSwayLeft/Right` 兜底仅在角色**没有**物理链时才有意义，正常有骨骼的角色不用管。
>
> ⚠️ **现状**：`character.json` 目前只是本文档定义的**约定**，代码里还没有读取/合并它的实现（`src/` 与 `src-tauri/` 都没有对应逻辑）。真正生效的覆盖路径现在只有：Blender `phys_*` 自定义属性、以及设置面板（视频通话）写入的 `RoomSettings`（localStorage）。谁要落地 `character.json` 加载，需要另开一次改动。

---

## 7. 导出清单（Blender → glTF .glb）
- [ ] 单位米制、面朝 +Z、Y 向上。
- [ ] 勾选导出 **Shape Keys** 及名称；按 §3 命名。
- [ ] 若做转头/呼吸/肩动：绑相应骨，并在 `character.json` 的 `boneMap` 映射真实骨名（见 §4；DEV 控制台会打印骨名供照抄）。
- [ ] 若头发/尾巴/飘带做了骨骼：链根骨打好 `phys_chain` 自定义属性（见 §4.5），导出时勾选 **Custom Properties**（并在 DEV 控制台确认 `[room] phys chains` 非空）。
- [ ] 没做物理链的角色，可选做 `hairSwayLeft/Right` 形态键作兜底（非必需）。
- [ ] 角色内置动画 clip **可选导出**，命名 `idle`（见 §4.6）；不导出则系统仍用纯形态键+骨骼驱动。
- [ ] 场景/道具真实米制、原点规范；场景灯可不导出。
- [ ] 文件名纯 ASCII，放对文件夹。
- [ ] 想覆盖默认表情/构图/物理参数 → 放 `character.json`。
- [ ] **ARP（Auto-Rig Pro）导出**（已实测验证的路径）：用 Blender 通用 glTF 导出即可，但必须勾 **Data → Armature → 仅导出形变骨骼**（否则 300+ 控制/参考骨全进包，动画通道数爆炸）；动画只保留命名 `idle` 的单个 action；自定义属性经实测在通用导出下存活；ARP 控制器形状网格（`cs_user_*`）导出前排除；真实米制、面朝 +Z、Shape Keys / Custom Properties 勾选。

---

## 附：当前内置情绪 → 形态键映射（参考，可被 character.json 覆盖）
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
