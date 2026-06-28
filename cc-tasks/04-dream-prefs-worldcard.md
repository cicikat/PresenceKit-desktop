# Brief 04 · 梦境上下文注入核实（已查清）+ 世界卡改"破限式"（诉求④之二）

前端：`DreamPrefsPane.tsx`、`dream-types.ts`、`dream.ts`、`lib.rs`。
后端（已挂载核实）：`D:\ai\Emerald-presence\core\dream\*`。

## 一、梦境上下文选项"是否真有对应" —— 后端结论：全部真注入，没有假开关

| UI 项 | 字段 | 后端是否真生效 | 注入位置 / 行为 |
|---|---|---|---|
| 记忆读取 | `memory_access` | ✅ 真 | `core/dream/dream_context.py`：`card_only`=只给关系态+入梦理由（最小）；`relationship_summary`=默认；`full_snapshot`=再加情节记忆+中期上下文。控制 D4 frozen_reality 快照内容。 |
| 感知边界 | `boundary_level` | ✅ 真 | `core/dream/body_projection.py` `_render_d5`：`vague`=模糊文字、`body_perceptible`=定性标签、`numbers_visible`=数值、`threshold_break`=数值且在 pipeline 解封上限。控制 D5 她的身体投影。 |
| 清明模式 | `lucid_mode` | ✅ 真 | `core/dream/dream_prompt.py`：`非清明` vs `清明` 切换 **D1 觉知文本**(`_D1_NON_LUCID_AWARENESS`/`_D1_LUCID_AWARENESS`, ~293) **和 D8 导演注记**(`_D8_DREAM_DIRECTOR_NON_LUCID`, ~387)。两条提示词分支，确有区别。 |
| 梦境 Lorebook | `enable_dream_lorebook` | ✅ 真 | `world_loader.match_dream_lore` / `load_dream_lore_entries`，独立于现实 lorebook。 |
| 世界卡 | `world_layer` | ✅ 真 | 见下，加载独立世界包。 |
| 破限预设 | `jailbreak_presets` | ✅ 真 | D0 预设，多选叠加。 |

**结论：梦境上下文这一页没有需要标"未完待续"的假开关。** 清明模式/感知边界都有实打实的提示词分支。

> 顺带：chat 那边的"对话模式"才是死设置（见 brief 03），别和这里搞混。

## 二、世界卡改"破限式选择" —— 可做，但 D3"多选"撞到后端单世界设计

### 后端事实（`core/dream/world_loader.py`）
- 每个世界 = 一个**文件夹** `characters/dream_worlds/{world_id}/`，内含 `ruleset.md`(D2 世界规则) + `mes_example.md`(D3 示例对话) + `vocab.json`(术语) + `lorebook.yaml`(梦境世界书)，外加 `_default/` 兜底。**所以"世界卡是好多文件"= 每个世界一个文件夹。**
- `_KNOWN_WORLDS = {reality_derived, abo, vampire, cat, flower_bud, custom}` 是**写死的白名单**，正好对应前端那 6 个硬编码枚举。`load_world(world_id)` **只吃一个 world_id**，未知值回退 `reality_derived`。
- 即后端 **当前是"单世界"架构**：一次入梦注入一套 ruleset + 一套 mes_example。`world_id` 在 `lib.rs ~832/844` 按单字符串透传。

### 这对 D3"多选"意味着什么（重要，请茶茶看）
"多选叠加世界卡"**不是前端换个芯片 UI 就行**，它要后端改：
1. `world_id`(单串) → `world_ids`(数组)，`dream_settings` / `dream_prompt` 都要改；
2. `load_world` 要支持**合并多个世界包**：ruleset 怎么拼？vocab/lorebook 取并集？两个世界规则冲突（ABO + 吸血鬼同场）怎么裁决？这是有语义代价的设计题；
3. `_KNOWN_WORLDS` 白名单要改成从文件夹动态发现，否则新世界加不进来。

### 已定 = 档1（动态单选，彻底去白名单）
茶茶要能"直接把新世界文件夹丢进 `characters/dream_worlds/` 就生效"，所以**白名单必须删掉、改成动态扫描**。

**后端（`core/dream/world_loader.py`）：**
1. 删 `_KNOWN_WORLDS` 写死 frozenset，新增 `discover_worlds() -> list[str]`：扫 `_WORLDS_BASE`(`characters/dream_worlds/`) 下的子目录，排除 `_default`，返回目录名列表（即 world_id 列表）。
2. `load_world`（~47 的 `if world_id not in _KNOWN_WORLDS`）改为：若该 world 目录不存在再回退 `_FALLBACK_WORLD`；目录存在就用。`_default/` 仍作字段级兜底。
3. `load_dream_lore_entries`（~167 同样用了白名单）一并改为按目录存在性判断。
4. 加一个列表端点（admin 路由，仿 `dream_presets` 那条 prompt-assets 的产出）：返回 `discover_worlds()` 的 `[{id,label}]`，label 可读 `{world}/meta.json` 的标题或就用 id。
   - 可选增强：每个世界放一个 `meta.json{ "label": "吸血鬼" }` 给中文名；没有就回落 id。

**前端：**
- `PromptAssetsResponse`（`types.ts`）加 `world_cards: PromptAssetOption[]`；`backend.ts normalizePromptAssets`（~118-125）加这字段（仿 `dream_presets`）。
- `DreamPrefsPane` 世界卡处（~932-939）：把 `SelectPref<WorldLayer>` 的硬编码枚举换成"从 `world_cards` 动态渲染的单选芯片"，选中仍写单 `world_layer` 字符串。
- 删/弱化前端 `WorldLayer` 联合类型与 `WORLD_LAYER_LABELS` 硬编码（~41-48）——改用后端列表；`normalizeDreamSettings`(~178) 对旧值/未知值的兜底保留（坏值回落第一个可用世界或 reality_derived）。
- 语义仍是单世界（不叠加），但体验已是"像破限那样从列表里挑、且新世界即插即用"。

> 多世界叠加（档2）后端要 `world_ids` 数组 + 合并/裁决逻辑，本次不做，需要时另立项。

## 验证步骤
- 档1：世界文件夹增减后前端列表自动跟着变；选中保存、`当前状态`页「当前世界」(~659) 正确回显；旧值 `abo` 等仍兼容。
- 若上档2：ABO+另一世界同选时，后端 prompt 里 D2/D3 能正确合并且不串味；冲突有明确裁决。
- 注入核实结论（本 brief §一）若后端日后改动需复核。
