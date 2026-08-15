# pet-window-reference.md - 桌面陪伴 UI 参考

本文从旧 `Emerald-desktopUI` 仓库（通常是本仓库的 sibling）中的 `pet.jsx` 和 `spec.jsx` 提取有用的设计意图。
它仍是已实现 PresenceKit-desktop pet window 的调参参考，不要求保留旧 JSX 实现或文件结构。

## 当前状态

Pet window 已在 `src/windows/pet/` 实现为透明/置顶的 Tauri window，包含粒子、3D 和 Live2D stage。它从主 window 接收 state 和 speaking event，支持鼠标感知的 retreat/nuzzle/drag 行为，并且不会打开自己的 WebSocket。下文描述的更丰富 concrete behavior loop 仍属于 post-v0.1 参考资料。

相关的新客户端入口：

- `src/windows/chat/ChatWindow.tsx`
- `src/shared/state/store.ts`
- `src/windows/chat/components/Ribbon.tsx`
- `src/windows/chat/components/ChatPanel.tsx`
- `src/windows/chat/components/SubFlow.tsx`
- `src/windows/chat/components/SubStatus.tsx`
- `src/shared/theme/globals.css`
- `src-tauri/tauri.conf.json`

## 核心原则

Pet 是 state-driven，而不是 message-driven。即使没有 chat bubble，用户也应能感到 companion 在场。

持久化 state model 为：

- `mood`：长期情绪基调。
- `focus`：短期注意力目标或姿态。
- `presence`：active、idle 或 away availability。
- `mode`：`companion` 或 `chat-only`。
- `wantToSpeak`：某件事差一点成为消息时的瞬时 signal。

消息只是这种 state 的一种表现。Pet window 还应通过呼吸、视线、姿势、aura、延迟，以及小型失败/未完成行为来表达 state。

## `spec.jsx` 中的设计原则

### 1. State Before Message

Mood 和 focus 必须通过 ambient signal 持续可见。不要把 mood 只做成 tag、icon 或文字行。Pet 应在说话前就传达 mood。

连续 signal 示例：

- 呼吸节奏和深度。
- 视线锁定强度。
- 眨眼间隔和不规则性。
- Aura 色相和强度。
- 身体倾斜和微漂移。
- Reaction delay。

### 2. Permanent Micro Motion

完全静止的 pet 会显得死气沉沉。即使 idle，pet 也需要细微运动：

- 呼吸。
- 微小位置漂移。
- 眼睛移动。
- 偶尔眨眼。
- 姿势的轻微变化。

旧 spec 将大约超过 800ms 的静止视为 companion illusion 的失败。新实现不必复制这个精确数字，但应保留这一原则。

### 3. Delay Creates Personality

并非每个反应都应立即发生。延迟是 character expression 的一部分：

- 低落 mood 可以反应更慢。
- 分心 mood 可以产生延迟或间接的视线响应。
- 向 cursor 移动前的犹豫，比实际移动本身更重要。

这应当被有意实现，不能变成偶然的 UI lag。

### 4. Failure Is Valuable

有些行为应当失败或停留在未完成状态。旧 prototype 为 mouse-nudge behavior 使用了 40% 的失败概率。具体概率可以变化，但设计意图应保留：

- Pet 有时开始朝用户移动，又放弃了。
- 有时它想说什么，最后没有说。
- 有时它在完全投入前先移开视线。

如果每个 action 都总能完成，pet 会像按钮；偶尔失败会让它更有生命感。

### 5. Asymmetric Attention

Pet 不应总是直视 cursor。注意力应有所变化：

- focused on user 时直视。
- distracted 时游移。
- thinking 时向下看。
- 对 UI context 作出反应时看向 sidebar/chat/screen。
- 偶尔快速瞥一眼，让人不易察觉。

如果 Dream UI 加入更柔和、更含混的状态，这一点尤其重要。

## `pet.jsx` 中的行为模型

旧 pet 实现包含有用的行为分类，尽管其中的 SVG placeholder character 不能视为最终美术。

### Visual input

Pet visual 对以下输入作出反应：

- 当前 mood。
- 当前 focus/activity。
- Presence state。
- Mouse position。
- Chat panel bounds。
- Sidebar bounds。
- `wantToSpeak`。

对于新客户端，对应输入应来自：

- `src/shared/state/store.ts` 中的 `StateEngine`。
- `ChatWindow.tsx` 中的 chat 和 sidebar geometry。
- 现有 API wrapper 提供的 backend mood/activity/sensor state。
- 未来通过 WebSocket 传入的 backend `state_update` event。

### Continuous animation

旧 pet 使用 `requestAnimationFrame` 实现：

- 呼吸缩放。
- 身体倾斜插值。
- 眼睛偏移插值。
- 眨眼计时。
- Aura 色相/强度插值。
- 微漂移。
- Nudge movement。

未来实现应让 animation 留在 pet surface 内部，同时把 business state 保持在 pet renderer 之外。

### Mouse nudge

Nudge behavior 有四个阶段：

1. Hesitate：移动前短暂停顿。
2. Going：向 cursor 部分移动。
3. Hold：仅在成功时短暂停在 cursor 附近。
4. Retreat：回到附近的 home position。

重要细节：

- 只有 cursor 足够近时才触发。
- 使用 mood-dependent trigger rate。
- 包含 failure path。
- 不要回到完全相同的 pixel；轻微不精确会更自然。

### Click reaction

点击 pet 不应像按普通 button。旧 prototype 将 click 视为轻微受惊或害羞：

- 标记 user interaction。
- 取消当前 nudge。
- 稍微移开。
- 短暂延迟后将 focus 移回用户。

如果未来 UI 需要 pet menu，优先考虑 long press、context menu 或 secondary control。普通 click 应首先保持 expressive。

### Want-to-speak signal

`wantToSpeak` 应在不一定发送消息的情况下可见。

旧 prototype 在 pet 上方显示小型 “UNSENT” envelope。具体视觉可以改变，但语义有用：

- Companion 差一点说了什么。
- Signal 是暂时的。
- 它应制造 tension，但不能强制出现 chat bubble。

Chat panel 已在 `src/windows/chat/components/ChatPanel.tsx` 有相关 typing flash path；当前 pet window 可以消费同一个 state signal。

## Mood 与 focus 映射

旧映射仍可作为调参参考。新的 `StateEngine` 已在 `src/shared/state/store.ts` 保留主要表格。

Mood 应影响：

- Breath period 和 depth。
- Blink interval 和 jitter。
- Eye follow strength 和 damping。
- Micro drift。
- Aura hue 和 intensity。
- Reaction delay。
- Lid droop 或可见的疲惫感。

Focus 应影响：

- Gaze target：cursor、chat panel、sidebar、screen edge、down 或 idle drift。
- Body tilt。
- Extra lid closure。
- 可选粒子，例如 thought 或 glance。
- 回到默认 focus 前的可选 duration。

Presence 应影响：

- Opacity。
- Scale。
- 是否允许行为。
- 是否允许 proactive signaling。
- Position strategy，例如自由移动还是停在角落。

## Companion Mode 与 Chat-Only Mode

旧 spec 分离了两种 mode：

- `companion`：pet 可见、behavior loop active，ambient state 完整表达。
- `chat-only`：pet 隐藏或淡出，proactive behavior 关闭，chat 仍是主要工具。

新客户端已有 `petVisible` ribbon toggle，并在 `ChatWindow.tsx` 调用 `engine.setMode("companion" | "chat-only")`。未来工作应把真实 pet-window behavior 接到现有 mode，而不是再加一个无关 switch。

## Dream UI 的影响

Dream UI 应建立在新客户端上，而不是旧 prototype 上。

建议形态：

- 从 chat mode 加 theme overlay 开始。
- 使用 `src/shared/theme/globals.css` 中的 `data-theme` token。
- 只有在影响多个 surface 时，才把 Dream-specific state 加到 `StateEngine`。
- 复用 `ChatPanel`、`PaneHost`、`SubDiary` 和 theme infrastructure。

除非 Dream 明确需要独立 transparency、always-on-top behavior 或独立 lifecycle control，否则不要一开始就做成 separate window。当前 app 没有 router，只有一个 Tauri window；在 Dream experience 被验证前，新增 route/window 会增加结构性工作。

最可能的 Dream UI touch point：

- `src/shared/theme/globals.css`：增加 `data-theme="dream"` 或 overlay token。
- `src/windows/chat/ChatWindow.tsx`：增加 mode/theme state 并向下传递。
- `src/windows/chat/components/Ribbon.tsx`：需要时暴露 Dream entry。
- `src/windows/chat/components/ChatPanel.tsx`：调整 Dream mode 的消息氛围、header 和输入呈现。
- `src/shared/state/store.ts`：只有 chat、sidebar、pet 共享时才加入 Dream-specific state。
- `src/windows/chat/components/SubDiary.tsx`：Dream 相关 diary filtering 可以复用既有 emotion/category UI。

旧文件只作为以下内容的参考：

- `pet.jsx`：行为 timing、mouse-aware reaction 和 pet presence 细节。
- `spec.jsx`：关于 aliveness、delay、failure 和 asymmetric attention 的设计原则。

旧文件不需要用于：

- Main layout。
- Chat rendering。
- Sidebar structure。
- Garden rendering。
- Diary pane。
- Theme token name。
- Floating pane mechanics。

## 删除说明

本文存在后，删除 `Emerald-desktopUI` 仓库不会再丢失高层 pet-window 设计原则。但删除仍应等项目明确决定 desktop pet 是：

- 仍计划实现：本文转为 implementation guide。
- 已放弃：将提到未实现 pet window 的文档改为明确说明它被有意延后或移除。
