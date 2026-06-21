# FIX-07 · 梦境「潜意识」面板：legacy/惰性字段梳理 + 状态条统一

> 前端（Emerald-client，Tauri + React）。动手前读 `ARCHITECTURE.md`。
> 后端只读契约见 `qq-st-bot/docs/known-issues.md` §H1（hidden_state 现实写入链未接线）。
> 本文已替「哪些可用、哪些要改」做出判定（用户授权），CC 按「实现要点」施工即可，无需再问设计意图。
> **改造档位：外科手术式**（保留面板结构，只换条子/裁惰性字段/修主题桥）。
> **组件策略：抽成共享组件**（HudMeter / HudPill / HudGroup 从状态页抽出，两个面板共用）。

---

## 背景与目标

梦境侧栏有三个 tab：`动向(flow)` / `状态(status)` / `潜意识(subconscious)`（`DreamWindow.tsx` L26、L465、L530）。

- **状态页** `DreamStatusSidebar.tsx` 用的是一套干净的「条子」UI：`.dream-hud__meter`（5px、渐变填充、25/50/75 刻度、width 过渡）、`.dream-hud__pill`（胶囊标签）、`HudGroup` 包 `DreamGlowPanel`。数据来自**实时轮询**的 `dreamState`。
- **潜意识页** `SubHiddenStatePanel.tsx`（582 行）数据来自一次性拉取的 `/debug/user-hidden-state`，自带一套粗糙的内联 `ScalarBar`（扁平 4px oklch、无刻度无渐变）、用 `--forest-*` 主题桥 hack 重映射 token、标注「READ ONLY · Phase 4.5」。

目标两条：

1. **把潜意识页的条子换成状态页那套好看的**，并抽成两页共用的共享组件。
2. **梳理 legacy / 增长缓慢（惰性）字段**：按下方判定表，该提升的提升、该降级标注的降级、该裁的裁。

---

## 关键事实（已核对）

### 数据真伪：H1 决定了哪些字段是「活的」

`known-issues.md §H1`：hidden_state 的**现实侧写入链全仓零调用**。运行时只有三条路径会改 `hidden_state.json`：

| 路径 | 触发 | 影响字段 |
|---|---|---|
| `integrate_afterglow_and_save` | 出梦后 afterglow 回流 | `embodied_ease` / `body_memory`（部分） |
| `apply_time_decay` | 12h 调度 tick | 全部朝基线衰减 |
| `consolidate_baselines` | 7d 调度 tick | baseline |

**后果**：不做梦时，`sensitivity / touch_need / embodied_ease / body_memory` 只随时间朝基线衰减，现实对话信号从不写入；`last_update_source` 永远是 `time_decay` / `init`，不会出现 `reality_behavior`。这就是用户说的「增长缓慢」——它们不是慢，是**接线前惰性**。

唯一**每次都重算、真正注入梦境 prompt** 的是 `dream_snapshot`（bucket 投影）。这是面板里最有信息量的部分，目前却被埋在第 4 张卡。

> 注意：`embodied_ease` 与 `body_memory` 是「半活」——afterglow 会写，所以做完梦它们会动，但**不是实时**、也不反映现实对话。文案要讲清这个时机。

---

## 字段判定表（用户已授权，按此施工）

| 面板区块 | 字段 | 判定 | 动作 |
|---|---|---|---|
| 驱动源 `SourceOverview` | 各字段 `last_update_source` + 「全惰性」提示 | **可用 · 降级** | 这是「现实写入是否接线」的诊断指示器，保留但压缩成一条状态行/小徽章组，别占整张大卡。当前几乎永远显示「全惰性」警告，把它做轻。 |
| 梦境读取到的状态 `dream_snapshot` | 敏感度/触碰趋向/身体松弛/记忆线索 bucket | **核心 · 提升** | 唯一实时注入梦境的真投影。**提升为首屏主区**，bucket 用共享 `HudPill` 渲染。 |
| 身体放松度 `embodied_ease` | value 0–100 + 偏离中心 + 来源 | **可用 · 改条子** | afterglow 会写的真实读数，但非实时。换共享 `HudMeter`，副标注「仅出梦回流 + 时间衰减驱动」。 |
| 身体记忆线索 `body_memory` | cue/response_tag/weight 表 | **可用 · 压缩** | 保留表，weight 列换 mini `HudMeter`。空态文案保留。 |
| 即时敏感（dev）`sensitivity` | current/baseline/偏离基线 | **惰性 · 标注保留** | 维持 dev 模式后可见；换条子；加角标「H1 接线前仅衰减驱动，不反映现实」。 |
| 触碰亏缺（dev）`touch_need` | deficit/baseline | **惰性 · 标注保留** | 同上。 |
| 开发者信息（dev） | schema_version / last_decay_tick | **元信息 · 保留** | 维持 dev only，不动。 |

判定原则：**不物理删字段**（后端 H1 接线后它们会活过来，删了又得加回），而是**用视觉层级 + 文案如实表达活/半活/惰性**——活的提到首屏，惰性的压到 dev 区并打「接线前」角标。

---

## 实现要点

### 1. 抽共享组件（先做，状态页与潜意识页共用）

新建 `src/windows/dream/components/hud/`，把状态页里现在私有的三个内联组件抽出来，**两个面板都改成 import 它们**：

- `HudMeter.tsx` —— 由 `DreamStatusSidebar.tsx` 的 `HudMetric` 升级而来。需要兼容潜意识页的诉求，props 设计为：

  ```ts
  interface HudMeterProps {
    label: string;
    value: number | null;          // 原始值
    max?: number;                  // 默认 100；潜意识页有非 100 量纲时传入
    displayValue?: string;         // 覆盖右侧文字（如 "+3.2"、"—"、保留 1 位小数）
    background: string;            // 填充色：渐变字符串或 oklch，统一走这个口子
    ticks?: number[];              // 默认 [25,50,75]；传 [] 关闭刻度
    delta?: number | null;         // 可选，渲染 ↑/↓/→ 趋势角标
  }
  ```
  - 沿用 `.dream-hud__meter` / `.dream-hud__meter-fill` / `.dream-hud__meter-tick` 这套 class（`DreamTokens.css` 现有，**不新增 CSS**）。
  - 内部 `clampPercent(value/max*100)`，`value===null` 时填充 0、右侧显示 `—`。

- `HudPill.tsx` —— 由状态页 `HudLabel` 的 pill 部分 + 潜意识页 `BucketPill` 合并。props：`{ value: string; tone?: 'emotion'|'boundary'|'intimacy'|'obsession'|'scene'|'neutral' }`，沿用 `.dream-hud__pill--*` class。bucket 中文映射（低/中/高/防备/平稳/放松）作为可选 `labelMap` 传入，默认走潜意识页现有的 `BUCKET_LABELS`。

- `HudGroup.tsx` —— 直接搬状态页的 `HudGroup`（包 `DreamGlowPanel title topSheen={false}`）。

> 抽取时核对两边差异：状态页 `HudMetric` 是 0–100 百分比 + 刻度；潜意识页要任意 `max` + 小数 + delta 角标。上面的 props 已覆盖两者。**抽完务必回改 `DreamStatusSidebar.tsx` 用新组件**，确保两页一致、状态页视觉不回归。

### 2. 改造 `SubHiddenStatePanel.tsx`（外科手术，保留整体结构）

- **删掉内联 `ScalarBar` / `MetricRow` 里的自绘 bar / `BucketPill` / `SourceBadge` 的条状部分**，全部改用 §1 的共享组件。`PanelCard` / `SectionHeader` / 表格骨架可保留。
- **去掉 `--forest-*` 主题桥**：`DreamWindow.tsx` L539–544 给潜意识 aside 注入的 `--forest*` 覆盖一并清掉，组件内直接用 `--dt-*` token（与状态页同源），主题统一。
  - 注意 `SubHiddenStatePanel` 内所有 `var(--forest-1)` / `var(--on-forest)` / `oklch(...)` 硬编码色，迁到 `--dt-surface-*` / `--dt-ink-*` / `--dt-border-*`。
- **重排层级**（仅调顺序，不改数据流）：
  1. 顶部保留 `READ ONLY · Phase 4.5` + 刷新 `↺` 行。
  2. **`dream_snapshot` 提到第一张卡**（用 `HudGroup` + `HudPill`）。
  3. `embodied_ease`（`HudMeter` + 「出梦/衰减驱动」副标）。
  4. `body_memory` 表（weight 列 mini `HudMeter`，`ticks=[]`）。
  5. `SourceOverview` **压缩为一行诊断状态条**（保留「全惰性 / 检测到现实写入」两态，做小）。
  6. dev 模式：`sensitivity` / `touch_need` / 开发者信息——每个加「H1 接线前仅衰减」角标。
- 数据获取（一次性 fetch + 手动刷新 + prev diff）**不动**，这是 debug 端点的合理用法。

### 3. 不动后端

`/debug/user-hidden-state` 只读契约不变。本任务纯前端。H1 现实写入接线是另一条独立任务（`qq-st-bot/cc-tasks/08b-hidden-state-接现实写入.md`），不在本次范围。

---

## 验收

- 潜意识页所有进度条/胶囊与状态页视觉一致（5px 渐变条 + 25/50/75 刻度 + 胶囊），无残留扁平 4px oklch 条。
- 状态页 `DreamStatusSidebar` 已改用共享组件且视觉无回归。
- 潜意识页不再依赖 `--forest-*` 桥；切换主题时与状态页同步变色。
- `dream_snapshot` 在首屏第一张卡；`sensitivity`/`touch_need` 在 dev 区且带「接线前惰性」角标。
- dev 模式开关（`display.physiological_arousal`）行为不变。
- `npm run build` 通过，无 TS 报错；潜意识/状态两 tab 均能正常拉数、刷新、空态显示。

---

## 涉及文件

| 文件 | 改动 |
|---|---|
| `src/windows/dream/components/hud/HudMeter.tsx` | 新建（抽取 + 升级） |
| `src/windows/dream/components/hud/HudPill.tsx` | 新建 |
| `src/windows/dream/components/hud/HudGroup.tsx` | 新建（搬迁） |
| `src/windows/dream/components/SubHiddenStatePanel.tsx` | 重排 + 换组件 + 去 forest 桥 |
| `src/windows/dream/components/DreamStatusSidebar.tsx` | 回改用共享组件 |
| `src/windows/dream/DreamWindow.tsx` | 清掉 L539–544 `--forest*` 注入 |
| `src/features/dream/DreamTokens.css` | 不新增；如有 mini-meter 微调在此 |
