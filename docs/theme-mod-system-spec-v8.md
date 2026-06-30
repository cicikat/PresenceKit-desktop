# 角色自驱 v8 跨仓规格（交付 Claude Code 一次性执行）

> 目标：让视频通话里的角色从"手动/本地 mood 驱动的站桩机"升级为**后端情绪/行为驱动**——她的表情、视线、姿态、说话由后端角色 pipeline 实时产出，前端房间只负责渲染。
>
> **本规格跨两个仓库：**
> - 客户端 `D:\ai\Emerald-client`（前端渲染消费）
> - 后端 `D:\ai\Emerald-presence`（情绪/行为产出）
>
> 设计原则：**复用现成通道、对现有行为零破坏、可降级**。后端不发指令时，前端**回退到 v5–v7 的本地 mood 驱动**（即现状），所以 v8 是纯增量、可灰度。
>
> 现状事实（已核）：
> - 后端→桌面端已有 typed action 通道：`channels/desktop_ws.py` 推 `{type:"action", action:{...}}` 并等 ack；`_push_desktop_action(payload)`（`core/tool_dispatcher.py`）是统一出口，`core/pipeline.py` 已在用（如 `minimize_window`/`show_notify`）。
> - 客户端已统一消费：`src/shared/api/ws.ts` `case 'action': this.emit('action', msg.action)` → 任何组件可 `wsClient.on('action', ...)`。
> - 说话流事件已存在：`message_stream_start/delta/end`、`message_segments`（客户端可据此判"正在说话"，**无需后端额外改**）。
> - mood 现由后端产出（`/mood` 路由 + pipeline 计算），客户端 EngineState.mood 已是 backend 来源。

---

## 1. 指令契约（两端唯一事实来源）

新增一种 action：`type: "avatar_directive"`。Payload（全部字段除 `kind` 外可选，缺省走默认/保持）：
```jsonc
{
  "type": "action",
  "action": {
    "kind": "avatar_directive",
    "expression": "开心",        // 七情绪之一，或命名表情(见模型说明书 character.json)；缺省=不改表情
    "intensity": 0.8,            // 0–1，表情强度，默认 0.6
    "gaze": {                    // 视线目标；null=不接管(回退 Phase3 摄像头或待机)
      "mode": "user",            // "user"看你 | "away"避开 | "point"指定 | "idle"游移
      "x": 0.0, "y": 0.0         // mode=point 时的归一化方向 (-1..1)
    },
    "gesture": "nod",            // "nod"|"tilt"|"lean_in"|"shake"|null，默认 null
    "speaking": null,            // true/false 显式说话态；null=由前端用流事件自行判断
    "ttl_ms": 4000               // 指令有效期；过期后回退本地 mood 驱动；默认 3000
  }
}
```
- **向后兼容**：客户端遇到未知 `kind` 的 action 忽略即可（不影响现有 `minimize_window` 等）。
- **安全**：前端对字段做白名单+clamp（expression 必须在已知集合或角色声明集；intensity/x/y clamp；gesture 枚举）；非法字段丢弃不报错。

---

## 2. 客户端改动（`D:\ai\Emerald-client`）

### 2.1 指令接收与降级（新建 `src/windows/room/avatarDirective.ts`）
- 维护一个"当前指令"状态：`{ directive, receivedAt }`，提供 `getActiveDirective(now)`：超过 `ttl_ms` 返回 null（过期）。
- 在 RoomWindow 挂载时 `wsClient.on('action', a => { if (a.kind === 'avatar_directive') setDirective(validate(a)) })`，卸载解绑。
- `validate()`：字段白名单 + clamp（见 §1 安全）。

### 2.2 渲染层：指令优先、本地兜底
改 `useRoomScene` 的驱动逻辑为分层合成（优先级从高到低）：
1. **表情**：有有效 directive.expression → 用它（+intensity）；否则用本地 `MOOD_MORPHS[engineMood]`（现状）。
2. **视线**：directive.gaze 非空 → 按 mode 驱动 `eyeLookLeft/Right/Up/Down` + `Head` 骨；否则若 Phase 3 摄像头开启 → 用摄像头"看你"；否则待机微游移。
   - `mode:"user"` → 眼/头朝镜头前方（看你）；`"away"` → 偏移避开；`"point"` → 朝 (x,y)；`"idle"` → 缓慢游移。
3. **说话/口型**：directive.speaking 显式优先；否则用现有"收到新消息→talk 窗口"逻辑（也可升级为监听 `message_stream_start/end` 精确开合，见 2.3）。
4. **姿态/手势**：directive.gesture 映射到有限动作——`nod`/`shake` 用 `Head` 骨小幅旋转动画；`tilt` 头微歪；`lean_in` 角色 z 轻微前移。无 `Head` 骨则跳过 graceful。
- 平滑：所有目标仍用 lerp 过渡，避免突变。

### 2.3 说话态精确化（可选小升级）
RoomWindow 监听 `message_stream_start`（她开始说）→ speaking=true 驱动 `mouthOpen` 伪口型；`message_stream_end` → speaking=false 闭合。比"按文本长度估时长"更准。directive.speaking 若显式给出则优先。

### 2.4 与 Phase 3 摄像头的关系
gaze 来源优先级：**后端 directive.gaze > 摄像头(看你) > 待机游移**。即后端可临时夺走视线（"她害羞地别开眼"），平时交给摄像头/待机。三者都走同一套 `eyeLook*`+`Head` 输出，互斥选择。

### 2.5 验收（客户端）
- [ ] 无后端指令时，房间表现与 v7 完全一致（本地 mood 驱动），零回归。
- [ ] 收到 `avatar_directive` 后，表情/视线/口型/手势按指令变化；`ttl_ms` 过期平滑回退本地。
- [ ] 非法/未知字段被忽略不崩；未知 action.kind 不影响其它 action。

---

## 3. 后端改动（`D:\ai\Emerald-presence`）

> 统一通过 `_push_desktop_action({"kind":"avatar_directive", ...})`（`core/tool_dispatcher.py` 的现成出口）发送。下分两阶段，**Phase A 先上、低风险**。

### 3.1 Phase A — 复用现有信号（最小改动、立刻有"自驱感"）
在不让 LLM 额外产出的前提下，把后端已知状态映射成指令：
1. **情绪联动**：在 pipeline 中**mood 确定/变化处**，emit `avatar_directive{ expression: <mood>, intensity: <由强度/唤醒度估算>, ttl_ms: 6000 }`。（mood 已是后端产物，找到设置 mood 的位置追加一次推送即可。）
2. **说话态**：回复投递（stream start/end 或 segments 推送）前后，emit `speaking:true/false`——或**省略**，交给客户端用流事件自判（2.3）。Phase A 可不发 speaking。
3. **节流**：mood 未变不重复发；变更或每 N 秒最多一条。

> Phase A 效果：通话中她的表情会真实跟随后端情绪状态（而非前端写死的 mood 表），且说话时动嘴——已显著"活"起来。

### 3.2 Phase B — LLM 自编"舞台指示"（真·自驱，后续实现）
让角色**自己决定**每轮的表情/视线/姿态：
1. 在角色生成的 system/prompt 约定一个轻量结构化输出（如在回复后附一段可解析的 stage 指示，或用现有工具调用机制产出一个 `avatar` 工具调用）。
2. `core/llm_output_validator.py` / pipeline 解析出 `{expression, gaze, gesture}`，emit 对应 `avatar_directive`（与文本回复同步）。
3. 复用现有 `behavior_id`（`core/scheduler/triggers/sensor_aware.py`）：主动行为（如察觉你分心 → "歪头看你"）也可 emit 指令，让她在你没说话时也有自发反应。
4. 安全/一致：expression 限定在角色声明的表情集；越界丢弃。

> Phase B 是"她自己演"，Phase A 是"按情绪状态演"。先 A 后 B，schema 同一份，前端无需改第二次。

### 3.3 验收（后端）
- [ ] Phase A：mood 变化时桌面端收到 `avatar_directive`，通话角色表情随之变；不影响 QQ/移动等其它 channel。
- [ ] 推送经 `_push_desktop_action`，桌面端未连时 graceful（现有 ack/超时逻辑已处理）。
- [ ] 节流生效，不刷屏。

---

## 4. 分期与依赖
- **前端 §2（含降级）必须先就绪**——它保证"没指令=现状"，是 v8 的安全垫。
- **后端 Phase A（§3.1）**：最小改动，上线即有自驱感。
- **后端 Phase B（§3.2）**：等 Phase A 稳定 + 角色 prompt 改造，再做 LLM 自编指示。
- Phase 3 摄像头（前端 finishing 之后）与 v8 gaze 正交：directive 可夺视线，平时摄像头/待机。

## 5. 红线
- **零回归**：后端不发指令时，房间行为必须等于 v7 本地驱动。
- 复用 `_push_desktop_action` / `wsClient.on('action')`，**不新增传输层**。
- 指令字段一律前端白名单+clamp；未知 kind/字段忽略不崩。
- expression 不得超出已知/角色声明集合；越界丢弃。
- 不破坏其它 channel（QQ/移动/桌面消息）与现有 action 类型。

## 6. 建议落地顺序
前端 §2.1→§2.2→§2.3（接收+降级+渲染合成）→ 后端 §3.1 Phase A（mood→指令）→ 联调 → 后续 §3.2 Phase B。

---

## 附：数据流总览
```
后端 pipeline (mood/情绪/LLM 舞台指示)
        │  _push_desktop_action({kind:"avatar_directive", ...})
        ▼
desktop_ws  ──WS {type:"action"}──►  客户端 ws.ts  ──emit('action')──►  RoomWindow
        ▼                                                                   │
   (无指令/过期)                                                      avatarDirective.ts
        ▼                                                                   │
   本地 mood 驱动(兜底, v5–v7) ◄──────合成/降级──────►  指令驱动(表情/视线/口型/手势)
                                                                            │
                                                              morph(eyeLook*/smile/...) + Head 骨
```
> 一句话：v8 把"她的内在状态"(后端)接到"她的外在表现"(前端渲染层)，中间靠一条已存在的 action 通道 + 一个可降级的指令层。站桩机 → 有内在驱动的她。
