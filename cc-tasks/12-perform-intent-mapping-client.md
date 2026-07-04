# Brief 12 · 句级表演意图映射 — 客户端侧

> 配对文档：`Emerald-presence/cc-tasks/20-句级表演意图映射-后端.md`（后端侧）。
> **协议契约以本文 §1 为准**，两份文档中的契约文本一致；先施工哪侧都可以，双方都必须容忍对侧未升级。
>
> 背景：LLM 输出本来就带 `*动作*` 叙事段（NMP，`core/narrative_parser.py` 解析为 `do`/`feel` 段），
> 但 `message_segments` 目前是 say-only 投影，动作描写在桌面端被丢弃。本单把这些自由文本动作
> 经后端意图映射为**受控表演 spec**，随 segments 按段下发；客户端在 VN 气泡 reveal 到对应句时
> 本地生成 directive 喂入现有 `avatarDirective` 槽位——表演与台词逐句同步，聊天 LLM 的 prompt
> **完全不动**（不引入任何会破坏沉浸感的控制标记）。
>
> 分层语义：mood 基调层（后端 Phase A v8 的 mood 变化推送，分钟级）继续作为底色；
> 本单新增**句级表演层**短时覆盖它；`spec` 中为 null 的通道不覆盖、回落基调层。

## 1. 协议契约（wire format，权威定义）

`message_segments.segments[]` 的每个元素从 `{type, text}` 扩展为可选携带 `perform`：

```jsonc
{
  "type": "say",
  "text": "才、才没有等你很久呢",
  "perform": {                  // 可选字段；整体缺失 = 无表演标注
    "expression": "happy",      // 9 词汇之一（同 avatar_directive）| null=不覆盖基调层
    "intensity": 0.7,           // 0~1，缺省 0.6
    "head": "tilt_r",           // nod|shake|tilt_l|tilt_r|dip|null
    "posture": "lean_in",       // lean_in|lean_back|shrink|straighten|null
    "gaze": "away",             // user|away|down|wander|null
    "energy": 0.4               // 0~1 幅度/速度总缩放，缺省 0.5
  }
}
```

- 所有 `perform` 内字段均可缺省；未知字段忽略；非法值按无效处理（该字段视为 null）。
- 旧后端（无 perform）→ 客户端行为与现在完全一致。旧客户端（不识别 perform）→ 忽略额外字段，无副作用。
- `content` 字符串、msg_id 关联语义、say-only 投影规则全部不变。

## 2. 类型与传输层（`src/shared/api/types.ts`、`ws.ts`）

1. 新增 `PerformSpec` 接口（上表 6 字段，全部可选）；`NarrativeSegment` 增加 `perform?: PerformSpec`。
2. `ws.ts` 的 `message_segments` case 已整体透传 segments，无需改动（确认即可）。

## 3. directive 槽位扩展（`src/windows/room/avatarDirective.ts`）

1. `AvatarDirective` 增加 `posture: string | null` 和 `energy: number`（缺省 0.5）；
   `VALID_GESTURES` 扩为 `nod|tilt|tilt_l|tilt_r|lean_in|shake|dip`（`tilt` 保留 = `tilt_r` 别名，
   兼容后端现有 WS 指令词汇）。新增 `VALID_POSTURES = lean_in|lean_back|shrink|straighten`。
2. 新增本地注入 API（供 VN presenter 调用，不走 WS）：
   ```ts
   export function setLocalPerform(spec: PerformSpec): void;   // 转成 ActiveDirective 写入 _active
   export function clearLocalPerform(): void;                  // 仅当 _active 来自本地时清除
   ```
   - spec→directive 映射：`head`→gesture；`posture`→posture；`gaze` `user/away`→同名 mode，
     `down`→`{mode:'point', x:0, y:-0.7}`，`wander`→`idle`；`expression/intensity/energy` 直传；
     `speaking` 置 null（继续由 VN talking 驱动）；`ttl_ms` 固定 30_000（句级表演的实际生命周期
     由 presenter 的 set/clear 控制，TTL 只是兜底）。
   - 给 `ActiveDirective` 加内部标记 `origin: 'ws' | 'local'`。优先级规则：**最后写入者胜**
     （WS `avatar_directive` 插播会顶掉本地句级表演，反之亦然；两者本就不该同时高频出现），
     但 `clearLocalPerform` 只清 local 来源，不误杀 WS 指令。
3. WS 路径 validate 不变（后端 WS 指令暂不发 posture/energy，字段缺省即可）。

## 4. turnIngest 段结构升级（`src/windows/room/turnIngest.ts`）

1. `AssistantTurn.segments: string[]` → `{ text: string; perform?: PerformSpec }[]`。
2. `applySegmentsToTurn` 收整段对象（调用方不再 map 成 string）；空 text 过滤逻辑保留。
3. `effectiveParts` 返回值增加 `performs: (PerformSpec | undefined)[]`，与 `parts` 等长对齐；
   `splitReply` fallback 路径（canonical/buffer 按 `\n+` 切）产出全 undefined performs。
   注意 `normalizeChatDisplayText` 只作用于 text，performs 对齐关系不能被过滤打乱
   （先过滤空段再建 performs，或过滤时同步删除对应 perform）。

## 5. VN presenter 触发（`src/windows/room/useVnPresenter.ts`）

1. `message_segments` ingest 处（现 132–145 行）：不再 `.map(s => s.text)`，
   改传 `{text, perform}` 对象数组给 `applySegmentsToTurn`。
2. 新增触发追踪 ref：`firedRef: { msgId: string; segIdx: number } | null`。
   tick 循环内，在 segIdx 确定之后（`const segIdx = segIdxRef.current` 处）：
   若 `firedRef` 不等于当前 `(t.msgId, segIdx)` 且 `performs[segIdx]` 存在 →
   `setLocalPerform(performs[segIdx])` 并更新 firedRef。
   - 这自然覆盖三种时序：新 turn 从 0 句开始、dwell/click 推进到下一句、
     **segments 晚到 swap**（swap 前 performs 全空不触发，swap 后当前句立即补触发）。
3. 清场：turn 淡出完成回 `idle`（`turnRef.current = null` 的两处）与组件卸载 cleanup 中
   调 `clearLocalPerform()`，表演结束回落 mood 基调层。
4. `talking` 逻辑不动（speaking 继续走现有 prop 链）。

## 6. 3D 执行层（`src/windows/room/useRoomScene.ts`）

> 分层规范（Brief 07）不变：头骨仍归程序化独占，posture 写胸/脊/肩，必须遵守
> additive 规则（`animatedBoneNames.has(bone.name)` 选 `+=` 或基准值+偏移绝对写）。

1. **head 手势泛化**（现 gesture switch 处）：
   - `tilt_l` / `tilt_r`：`rotation.z = rest.z ± rampIn * 0.18`（现 `tilt` 语义 = `tilt_r`）。
   - `dip`：`rotation.x = rest.x + rampIn * 0.22`（低头保持，不振荡）。
   - `nod`/`shake` 振荡幅度乘 `(0.5 + energy)`（energy 0.5 时 = 现状 1.0 倍，向后兼容）。
2. **posture 层**（新逻辑，插在 gesture 层之后、呼吸微动之前）：
   - `lean_in`：`charGroup.position.z = -ramp * 0.1`（收编现有 lean_in gesture 代码）+
     呼吸骨（chest??spine）`rotation.x` 前倾偏移 ≈ `ramp * 0.06 * (0.5 + energy)`。
   - `lean_back`：反号，charGroup z 为 `+0.06`，胸骨后仰。
   - `shrink`：双肩 `position.y` 下沉偏移 + 胸骨 `rotation.x` 微前曲 + charGroup 轻微下移；
     幅度全部乘 energy 缩放。
   - `straighten`：胸骨 `rotation.x` 反向挺直 + 肩微抬。
   - 全部经 ~300ms rampIn 缓入；directive 失效/清除后 lerp 回基准（复用现有回落模式）。
   - 旋转偏移对 clip 驱动骨用 `+=`（additive），非 clip 骨走基准+偏移绝对写——
     与呼吸层同一套判断，**posture 的绝对写基准必须复用加载时捕获的 rest/base refs**。
3. **energy 调制**：呼吸 `depth` 乘 `(0.7 + 0.6 * energy)`；gesture/posture 幅度如上。
   无 directive 时 energy 视为 0.5（一切照旧）。
4. 表情/gaze/speaking 层零改动（perform 复用现有 directive 消费路径）。

## 7. Live2D 对应面（`src/shared/live2d/useLive2DStage.ts`）— P2，可截尾

语义对齐即可，允许降级：`tilt_l/tilt_r`→`ParamAngleZ` ±，`dip`→`ParamAngleY` 负向，
`posture lean_in/back`→`ParamBodyAngleX`（无该参数则 no-op），`energy`→现有姿态脉冲/呼吸幅度缩放。
时间不够就只做 gesture 词汇不报错（未知 posture 静默忽略），标注 TODO。

## 8. 旁路兼容

- `src/windows/pet/components/Model3DStage.tsx`（useCharacterRig）：gesture 联合类型变宽后
  保证编译通过、未知值走 default 即可，不要求实现新表演（桌宠不在本单范围）。
- QQ / mobile / ChatPanel 文字气泡路径零改动。

## 9. 文档更新

- `docs/backend-integration.md`：`message_segments` 章节补 perform 字段契约（§1 原文）+
  「本地 directive 注入与 WS avatar_directive 的 last-writer-wins 规则」。
- `docs/room-model-import-guide.md`：已由本次一并更新（§4.7 表演层）；实现若有出入需回改。

## 10. 验证步骤

1. **回归底线**：连旧后端（或后端 `performance_mapping.enabled: false`）→ 气泡、表情、
   mood 基调、WS avatar_directive 行为与现在逐项一致。
2. 后端开启映射后：发"你凑近一点嘛"，若回复含 `*凑近了一些*` → 对应句 reveal 时模型前倾 +
   表演随句子推进切换；点击快进气泡 → 表演立即跟随跳句。
3. segments 晚到：慢网络下先流式 reveal 再 swap → 当前句表演补触发，无重复触发、无跳帧。
4. turn 结束淡出 → 姿态/表情平滑回落 mood 基调；挂机 10 分钟无偏移累积（additive 规则）。
5. 手动从后端推一条 WS `avatar_directive` → 能顶掉句级表演，TTL 过后回落。
6. Live2D 模式切换后同一条回复不报错（P2 完成度按 §7 验收）。
7. `tsc` 通过；性能：rAF 帧内新增逻辑无分配热点（对象复用，不每帧 new）。
