# FIX-05 · 叶瑄说话时任务栏图标不亮、无弹窗提醒

> 前端（Emerald-client，Tauri + React）。先读 `ARCHITECTURE.md` + `cc-tasks/11c-存在感弹窗.md`（若存在）。
> ⚠ 先和用户确认"提醒触发范围"，再动手——见下方决策。

## 现象

叶瑄发言时，桌面任务栏的应用图标不会闪/亮，也没有弹窗提醒。

## 现状（已核对，根因）

### 任务栏不亮：根本没有调"请求用户注意"的 API

- 弹窗窗口 `pet` 和 `presence-nag` 在 `src-tauri/tauri.conf.json` 都是 **`skipTaskbar: true`**（L30、L44），本就不进任务栏。
- `presence_nag` 命令（`src-tauri/src/actions.rs:85-111`）只做 `window.show()` + `window.set_focus()`，**没有任何 `request_user_attention(...)`** 调用 → 主窗口任务栏图标不会闪烁/高亮。
- 全仓 grep 无 `request_user_attention` / `UserAttentionType`。→ 任务栏注意特性从未实现。

### 没有弹窗：默认关闭 + 仅特定动作触发

- `src/shared/presenceNag.ts:11-13` `isPresenceNagEnabled()` 默认 **false**（`getUIPref(PREF_KEY, false)`）。
- `src/shared/api/ws.ts:294-300` 处理 `presence_nag` 动作时，**第一行 `if (!isPresenceNagEnabled()) return;`** → 未手动开启则直接吞掉，不弹窗。
- 且弹窗只由后端下发的 **`presence_nag` 这个特定 WS 动作**触发；**普通对话回复不会触发**任何弹窗/提醒。

→ 综合：默认没开 → 不弹；即使开了，也只有后端 presence_nag 动作才弹，普通"叶瑄说话"无提醒；任务栏永远不亮（无 API）。

## 设计决策（先定，需用户拍板）

**"叶瑄说话要提醒"指哪种？**

- **A · 仅主动消息（presence_nag）提醒**：保持只在后端存在感催促时提醒——但要让它真的可见。
- **B · 任何新消息且窗口不在前台时提醒**：聊天窗失焦/最小化时，收到任意叶瑄消息就闪任务栏 + 可选弹窗。更符合"叶瑄说话就提醒"的直觉。

> 建议先问用户要 A 还是 B。多数 IM 期望是 B（失焦才提醒，前台不打扰）。

## 实现要点

1. **任务栏闪烁（两种方案都需要）**：新增一个 Tauri 命令对**主聊天窗**调
   `window.request_user_attention(Some(UserAttentionType::Informational))`（Windows 上是任务栏图标高亮/闪烁）。
   - 仅在窗口**不在前台**时请求；窗口获焦后清除（`request_user_attention(None)`）。
2. **弹窗可见性**：
   - 复核 `presence-nag` 窗 `show()` 后是否真的可见（transparent + decorations:false + center:true，确认渲染内容非空、未被 alwaysOnTop 的 pet 窗遮挡）。
   - 默认值：若选 B 或希望开箱即用，把 `isPresenceNagEnabled` 默认改为 true（或在首启引导里提示开启）。
3. **触发范围（按 A/B）**：
   - A：维持只听 `presence_nag` 动作，但加任务栏闪烁。
   - B：在 WS 收到普通 assistant 消息时，若聊天窗失焦，则触发任务栏闪烁（+ 可选走 presence-nag 弹窗或系统通知）。
4. （可选）接入系统级通知：引入 `@tauri-apps/plugin-notification`，失焦时发系统通知，比自绘弹窗更稳，也天然带任务栏提示。

## 验收

- 聊天窗失焦/最小化时，叶瑄发言 → 任务栏图标闪烁/高亮；点开后清除。
- 按选定范围（A/B）触发弹窗或系统通知。
- 前台聚焦时不过度打扰（按 B 时前台不闪）。
- pet 窗、presence-nag 窗其它行为不回归。

## 备注

- `skipTaskbar:true` 的弹窗窗口本身不会点亮任务栏，必须对**主窗口**调 `request_user_attention`——别试图让弹窗窗口进任务栏。
- 这条强烈建议先问用户 A/B，再实现；触发范围决定改动面。
