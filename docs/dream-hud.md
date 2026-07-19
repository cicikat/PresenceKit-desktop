# Dream HUD

后端版本：v2.1（`core/dream/dream_hud.py`）  
前端版本：v1.1（`DreamStatusSidebar.tsx`）

---

## 数据来源

以下字段通过 `derive_hud_v1()` 在 `GET /dream/state` 时计算，来源均为 dream-local 数据，从不读取 mood_state 或现实 pipeline 存储。

| 字段 | 基础来源 | 派生公式（v0 基础值） |
|------|---------|-------------------|
| `emotion_tension` | `dream_state.emotional_tension` (0.0–1.0) | `raw_tension × 100 + anchor_charge × 10` |
| `boundary_intrusion` | `body.heat`, `emotional_tension`, `boundary_level` 设置, `scene_state` | `heat×0.4 + tension×0.4 + boundary_factor + scene_intrusiveness×15` |
| `intimacy_tendency` | `body.heat`, `body.sensitivity`, `emotional_tension` | `(heat + sensitivity + tension) / 3`；cat 世界用 attachment 公式 |
| `obsession` | `emotional_tension`, `symbolic_anchors` 数量, `anchor_charge`, `anchor_repeat_ratio` | `tension×0.7 + anchor_score×0.3 + ac×25 + arr×30` |
| `dream_stability` | `emotional_tension`, `boundary_intrusion`, `scene_state`, `symbolic_pressure` | `100 - tension×0.4 - boundary×0.2 + sp×10` |
| `dream_depth` | `body.heat`, `body.sensitivity`, `anchor_charge`, `symbolic_pressure` | `(heat + sensitivity + 10)/3 + ac×20 + sp×20` |
| `physiological_arousal` | `body.heat`, world 修正矩阵 | `heat × mult + offset`；ABO 世界满足条件时额外 +10 |

**计算顺序（每次 GET /dream/state）：**

1. 读取 dream_state（含 body_state、emotional_tension、symbolic_anchors、scene_state）
2. 计算 v0 基础值
3. 从 symbolic_profile.yaml 获取 anchor_charge（ac）和 symbolic_pressure（sp）
4. 注入 anchor_charge 到各字段
5. 应用 world 修正矩阵（乘数 + 偏移）
6. cat 世界 intimacy_tendency 替换为 attachment 公式
7. 追加 anchor_repeat_ratio boost（obsession +arr×30）和 symbolic_pressure boost（dream_depth +sp×20）
8. 应用 tag_pressure 方向修正（obsession/intrusion/intimacy/depth/stability 各有权重）
9. clamp 到 [0, 100]
10. EMA 平滑（加载 dream_hud_state.json 中的旧值）
11. 解析 emotion_label 和 scene_label
12. 计算 physiological_arousal（不经 EMA）
13. 返回整数 0–100 的 hud dict；若 dream_active 则写回 dream_hud_state.json

---

## 状态文件

**文件名：** `dream_hud_state.json`

**路径（v1 layout）：** `data/runtime/dreams/{char_id}/state/{uid}/dream_hud_state.json`  
**路径（legacy layout）：** `data/dreams/state/{uid}/dream_hud_state.json`

梦境进行期间由 `GET /dream/state` 懒创建，梦境关闭时由 pipeline 删除。

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `emotion_tension` | float 0–100 | EMA 平滑后的情绪张力，α=0.6（快速响应） |
| `boundary_intrusion` | float 0–100 | EMA 平滑后的边界侵入，α=0.5 |
| `intimacy_tendency` | float 0–100 | EMA 平滑后的亲密倾向，α=0.5 |
| `obsession` | float 0–100 | EMA 平滑后的执念强度，α=0.35（缓慢衰减） |
| `dream_stability` | float 0–100 | EMA 平滑后的梦境稳定度，α=0.35 |
| `dream_depth` | float 0–100 | EMA 平滑后的梦境深度，α=0.35 |
| `anchor_history` | list[list[str]] | 近 5 次 GET /dream/state 时的 symbolic_anchors 快照，用于计算 anchor_repeat_ratio |

EMA 公式：`smooth = α × raw + (1 - α) × old`  
首轮（old 不存在）：`old = raw`（种子值，效果为直通）

---

## 世界包配置

世界包目录：`characters/dream_worlds/{world_id}/`

### symbolic_profile.yaml

为世界定义象征锚的权重和标签。

```yaml
symbolic_profile:
  花苞:
    weight: 0.85
    tags: [enclosure, soft]
  刺:
    weight: 0.65
    tags: [intrusion, obsession]
  门:
    weight: 0.60
    tags: [transition]
  default:
    weight: 0.50
    tags: []
```

- `weight`：float 0–1，锚的象征强度
- `tags`：影响 tag_pressure 的方向标签；有效标签为 `obsession`、`intrusion`、`intimacy`、`depth`、`stability`，其余静默忽略
- 顶层键可以是 `symbolic_profile:` 包裹的嵌套结构，或直接平铺
- `default` 键作为未命中锚的默认权重

**缺失时：** 自动 fallback 到 `characters/dream_worlds/anchor_weights.json`（只含 weight，tags 为空）。

### hud_labels.yaml

为世界定义 emotion_label 的显示文本。

```yaml
labels:
  emotion_tension:
    low:  平静
    mid:  克制
    high: 绷紧
  boundary_intrusion:
    low:  警觉
    mid:  不安
    high: 被迫靠近
  intimacy_tendency:
    low:  疏离
    mid:  想靠近
    high: 强烈依恋
  obsession:
    low:  挂念
    mid:  放不下
    high: 戒不掉的执念
```

- 支持轴：`emotion_tension`、`boundary_intrusion`、`intimacy_tendency`、`obsession`
- band 阈值：low < 40，mid 40–70，high ≥ 70
- dominant axis = 当前 4 轴中值最高者
- 顶层键 `labels:` 可省略（直接平铺也支持）

**缺失时：** 使用内置 `_DOMINANT_LABEL_MAP` 的默认中文文本。

### scene_labels.yaml

为世界定义场景标签的显示文本。

```yaml
labels:
  stable:   被花包裹的暖房
  sinking:  花苞深处
  boundary: 花瓣轻轻收拢
  neutral:  柔软的花梦
```

- 键固定为：`stable`、`sinking`、`boundary`、`neutral`
- 判定逻辑（按优先级）：
  1. `scene_state` 字段有值 → 直接使用 scene_state（不查此文件）
  2. `dream_stability > 70` → stable
  3. `dream_depth > 70` → sinking
  4. `boundary_intrusion > 60` → boundary
  5. 其余 → neutral

**缺失时：** 使用内置 fallback：`稳定` / `下沉` / `边界波动` / `梦境中`。

---

## Fallback

| 缺失项 | 系统行为 |
|-------|---------|
| 无 `symbolic_profile.yaml` | 使用 `anchor_weights.json` 全局 fallback；tags 全部为空，tag_pressure 全部为 0 |
| 无 `anchor_weights.json` | 所有锚使用 default weight=0.5；无错误 |
| 无 `hud_labels.yaml` | emotion_label 使用 `_DOMINANT_LABEL_MAP` 内置映射 |
| 无 `scene_labels.yaml` | scene_label 使用内置 `_FALLBACK`（稳定/下沉/边界波动/梦境中） |
| pyyaml 未安装 | 所有 YAML loader 返回空 dict，记录 warning；不崩溃 |
| world_id 未识别 | world 修正矩阵无命中 → identity transform（不修正）；loader fallback 照常触发 |

---

## 生命周期

```
POST /dream/enter
  ↓ delete_hud_state(uid)          ← 清除上次中断梦境的残留状态
  ↓ status = DREAM_ACTIVE
  ↓ frozen_world, lucid_mode 冻结

GET /dream/state（梦境激活期间）
  ↓ load_hud_state(uid)            ← 读取 EMA 历史（首次返回空 {}）
  ↓ derive_hud_v1(state, settings, body, prev_smooth)
  ↓ save_hud_state(uid, smooth)    ← 懒创建/更新 dream_hud_state.json
  ↓ 返回 9 个 HUD 字段（int 0–100）

POST /dream/chat × n
  ↓ dream_pipeline.dream_turn()
  ↓ 更新 body_state + emotional_tension（写入 dream_state）
  ↓ 不触碰 dream_hud_state.json    ← HUD 仅在 GET /dream/state 时更新

POST /dream/exit
  ↓ force_exit_dream → _do_close_dream
  ↓ archive_current(uid, dream_id)
  ↓ clear_local_state(state)
  ↓ status = REALITY_AFTERGLOW
  ↓ delete_hud_state(uid)          ← 删除 dream_hud_state.json

GET /dream/state（梦境结束后）
  ↓ dream_active = False
  ↓ prev_smooth = {}（不加载文件）
  ↓ 计算 HUD 但不保存             ← 返回安全默认值，不写文件
```

**注意：** `anchor_history` 仅在 GET /dream/state 调用时追加。chat 调用不更新 anchor_history。若 UI 在两轮对话之间不轮询状态，anchor_history 条目数会少于实际聊天轮次数。

---

## 前端展示

**组件：** `src/windows/dream/components/DreamStatusSidebar.tsx`

| UI 分组 | 显示字段 |
|--------|---------|
| 叶瑄 · YEXUAN | emotion_label（pill）+ emotion_tension、boundary_intrusion、intimacy_tendency、obsession（进度条） |
| 场景 · SCENE | scene_label（pill）+ dream_stability、dream_depth（进度条） |
| 隐藏状态 · HIDDEN | physiological_arousal（仅 `display.physiological_arousal=true` 时显示） |

`display.physiological_arousal` 通过 PATCH /dream/settings 切换，保存在 settings 文件中，在 `DreamPrefsPane` 的"开发者模式"按钮控制。

---

## API 端点摘要

| 端点 | 方法 | 说明 |
|-----|------|------|
| `/dream/state` | GET | 只读；返回完整 HUD + 基础字段；梦境激活时更新 dream_hud_state.json |
| `/dream/settings` | GET | 返回全字段设置（含 display） |
| `/dream/settings` | PATCH | 部分更新；验证枚举；仅影响下次梦境 |

群梦模式沿用同一 HUD 组件。`GET /group/{id}/dream/state` 将 `char_tension` 投影为
`Record<char_id, number>` 并附带 `roster`，客户端逐角色渲染张力；`body`、场景与其余 HUD
字段仍按全群共享状态展示。群梦 settings 读取 `/group/{id}/dream/settings`，不会读取单人
`display.physiological_arousal` 作为群梦业务设置。
| `/dream/enter` | POST | 进入梦境；冻结 world/lucid；清除旧 HUD state |
| `/dream/chat` | POST | 独立 pipeline；更新 body_state；不触碰 HUD state |
| `/dream/exit` | POST | 硬退出；删除 HUD state；转为 REALITY_AFTERGLOW |
