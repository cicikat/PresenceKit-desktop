# docs/memory.md — 记忆与潜意识 UI 边界

本文记录 Emerald-client 内与记忆、潜意识状态、hidden state 观察相关的前端边界。后端记忆系统本体仍以 `D:\ai\Emerald-presence\` 为准。

---

## Phase 4.5 潜意识状态面板

Phase 4.5 的 User Hidden State Debug UI 已从 debug-only 入口提升为单用户可访问的「潜意识」状态面板。

入口：

- Dream 窗口左侧 Ribbon 的「潜意识」按钮。
- Dream Sidebar tab key：`subconscious`。
- 组件：`src/windows/dream/components/SubHiddenStatePanel.tsx`，由 `src/windows/dream/DreamWindow.tsx` 挂载。

数据路径：

```text
DreamWindow subconscious tab
  → SubHiddenStatePanel
  → loadHiddenStateDebug()
  → Tauri load_hidden_state_debug
  → GET /debug/user-hidden-state
```

开发者字段显隐：

- `load_hidden_state_debug` 会只读参考 `GET /dream/settings`。
- 当 `display.physiological_arousal === true` 时，面板显示 sensitivity / touch_need / schema / decay 等更细信息。
- 该开关与 Dream 状态页「隐藏状态 · 生理唤醒」共用同一 display flag。

---

## 常态展示字段

开发者模式关闭时，面板常态展示：

| 字段 | UI 文案 |
|---|---|
| `embodied_ease` | 身体放松度 |
| `body_memory` | 身体记忆线索 |
| `dream_snapshot` | 梦境读取到的状态 |
| `last_update_source` | 最近来源 |

`body_memory` 为空时显示「暂无身体记忆线索」。

---

## 只读约束

潜意识面板只读：

- 不提供编辑按钮。
- 不提供滑块或手动保存。
- 不提供 reset。
- 不调用 hidden state 写接口。
- 不直接调用 integrator。
- 不直接调用 `save_hidden_state`。
- 不直接修改 JSON。

本轮没有新增写接口。Hidden state raw 数值、source 和 dream snapshot bucket 只显示在 UI 中，不注入 Reality prompt、Dream prompt、memory，也不新增 Phase 7 afterglow soft hint。
