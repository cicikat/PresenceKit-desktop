# Brief 08 · 字数反坍缩 / 上线触发去抖 / 状态黑屏 / 历史空白 / 主动触发止血

> 来源：茶茶一次性提的 5 个问题。本文是**工单**，cc 按各节施工。
> 归属先说清楚：本仓库（Emerald-client）只是可视化壳，**记忆 / prompt / 调度 / 触发决策的真值全在 `D:\ai\Emerald-presence\`**。
> 所以 #1、#5 是后端单（需要在 Emerald-presence 里改），#2、#3、#4 是前端单（本仓库）。
> 已核对代码，本仓库内**没有**任何“纠偏提醒 / 坍缩检测 / 主动累积”逻辑，全部落在后端——这点是判断依据，别在前端找。

优先级建议：#3 #4（前端可见 bug，先修）→ #2（前端去抖，止血）→ #1（后端功能）→ #5（后端诊断，多半要拉 fable）。

---

## #3 · Chat 侧栏「状态」tab 一点进去黑屏（前端 · 先修）

**根因判断（两层）**
1. 直接原因：`SubStatus` 渲染期抛异常。全仓库**没有任何 ErrorBoundary**（已 grep 确认：`ErrorBoundary/componentDidCatch/getDerivedStateFromError` 均无命中）。React 未捕获异常会卸载整棵树 → 整个 app 变黑，症状正好是“一点进去就黑屏”，而不是只黑那一块。
2. 静态审查 `src/windows/chat/components/SubStatus.tsx` 没发现明显的 undefined 调用（`chatThemeFontSize`、`MOOD_HUE`、`MOOD_LABEL_EN`、`loadSensorRealtime`、`isSensorNoData` 等 import 目标都存在且导出正常），所以**必须跑起来看控制台真实堆栈**才能定位，不要凭猜改。

**施工**
1. **止血（无论根因都要做）**：加一个 `ErrorBoundary` 组件（`getDerivedStateFromError` + `componentDidCatch`，`componentDidCatch` 里 `console.error` 出 stack），把 `src/windows/chat/components/Sidebar.tsx` 里 tab 内容区（`SubFlow/SubGarden/SubDiary/SubStatus` 那个 switch 块，约 72–81 行）包起来，fallback 渲染一句“状态面板出错”+ 重试按钮。这样单个 panel 崩了不再拖垮整个窗口，且 stack 会进控制台。
2. **定位真因**：dev 模式打开（`start-dev.bat`），点「状态」，读控制台第一条报错。重点怀疑运行时（非静态）问题：
   - `useTelemetrySignals` 里 `engine.subscribe(calc)` 的返回值当 cleanup 用（`return () => { unsub(); ... }`）——若 `engine.subscribe` 某条件下返回非函数，卸载时 `unsub()` 抛错；确认 `store.ts` 的 `subscribe` 恒返回函数。
   - `spikeTickRef` 那段 `setInterval` 在 `calc` 内部再次注册、并被 `engine.subscribe(calc)` 每次 state 变更触发——排查是否有未清理的 interval 递归导致 setState 风暴/越界。
   - `engine.get()` 返回的 `mood` 若不在 `MOOD_AURA_BASE`/`MOOD_HUE` 键内（例如后端新加的 mood 串），代码里都有 `?? fallback`，理论安全；但确认 `state.activity` 结构是否总是 `{text,arc}`。
3. 修掉根因后，保留 ErrorBoundary（这是长期该有的东西）。

**验证**
- 点「状态」tab 正常渲染 MOOD 卡 / ACTIVITY / PRESENCE / 四条信号 / 2 分钟轨迹，不黑屏。
- 故意在 SubStatus 里 `throw new Error('x')` → 只有 panel 显示 fallback，其余窗口正常 → 证明 ErrorBoundary 生效后再删掉这行。
- flow/diary/garden 三个 tab 回归正常。

---

## #4 · 先开前端后开后端时，历史聊天记录不推送、聊天页空白（前端 · 先修）

**根因判断**
`ChatPanel.tsx` 的启动加载 `useEffect` 依赖数组是 `[]`，`init()` 一辈子只跑一次。前端先起来时后端还没上，`loadChatLogDates()` 抛错 → 进 `catch` → `setHistoryStatus({kind:'error'})`，**之后没有任何重试**。等后端起来了也不会自动重新拉，于是页面一直空白。顺带 `_desktopWakeFired` 也不会触发（问候也没了）。

**施工（本仓库 `src/windows/chat/components/ChatPanel.tsx`）**
1. 把 `init()` 抽成可重入函数（注意现有 `mounted` guard 和 `_desktopWakeFired` 一次性 guard 要保留：历史可重拉，wake 仍只发一次）。
2. 触发重试的时机，二选一或都做：
   - **首选**：订阅 WS 连接成功事件（`src/shared/api/ws.ts` 的 `wsClient`，Rust bridge 在 `ws_bridge.rs`；找 `hello_ack`/open 回调）。WS 一旦 open 就说明后端活了 → 若 `historyStatus.kind === 'error'` 或消息列表为空，重跑 `init()`。
   - **兜底**：`historyStatus.kind === 'error'` 时起一个轻量轮询（比如 5s 一次，最多几次或直到成功），`loadChatLogDates()` 成功即重跑并停轮询。
3. 重试成功要把 `historyStatus` 从 `error` 切回 `ok/empty`，并正确 setMessages（复用现有 `init` 的组织逻辑，别写第二套）。
4. UI：`error` 态期间给个“正在等待后端…/重试”而不是纯空白，减少突兀。

**验证**
- 先开前端（后端关）→ 显示等待态而非空白 → 再开后端 → 数秒内自动补齐历史 + 触发一次重开问候。
- 正常顺序（先后端后前端）行为不变（回归）。
- 反复开关后端，历史不重复 append、不双发问候（现有 dedup：`recentHistoryHashesRef` / `wsMsgIdToLocalIdsRef` 要仍然生效）。

---

## #2 · 上线主动触发：10 分钟内重登/刷新不触发，超过 10 分钟才触发（前端 · 止血）

**现状与判断**
- “上线触发”= `ChatPanel.tsx` 里的 `desktopWake()`（打后端 `POST /desktop/wake`）。目前用模块级布尔 `_desktopWakeFired` 保证“每个 page session 只发一次”。
- 问题：**刷新（F5）/ 重开窗口会重置模块变量** → wake 重新发一次。这正是茶茶要排除的“重登刷新前后端”误触发。
- 是否真开口说话的最终决策在后端 `/desktop/wake`（客户端当前传的是 `historyCursorSec`=最后一条 assistant 时间，不是真实“上次在线时刻”）。所以 10 分钟阈值**放前端做去抖最干净**，不依赖后端改动即可止血。

**施工（本仓库）**
1. 持久化一个“上次成功触发 wake 的时间戳”。**必须跨刷新/重启存活**，所以别用模块变量或内存——用 Tauri 侧持久化（app_data_dir 下小 json，或复用现有本地配置存储；参考 `save_avatar`/`avatars.json` 的落盘方式）或至少 `localStorage`（能扛刷新，扛不住清缓存，可接受）。
2. 发 wake 前读该时间戳：`now - last < 10min` → **跳过 wake**（视为重登/刷新），不改历史加载逻辑（历史照拉）。`>= 10min` 或无记录 → 正常发 wake，成功后写入当前时间戳。
3. 阈值设成常量 `WAKE_MIN_GAP_MS = 10 * 60 * 1000`，注释写清“排除重登/刷新”。
4. `_desktopWakeFired`（同 session 只发一次）保留，和新时间戳去抖是两层，不冲突。

**验证**
- 开→关→10 分钟内再开 / F5：不触发问候。
- 间隔 >10 分钟再开：正常问候。
- 清 storage 后首次开：正常问候（无记录视为该触发）。

> 备注：如果茶茶更希望阈值由后端统一判定（跨设备/跨平台一致），那属于后端单：客户端改传真实 `last_seen`（上次在线时刻），由 `/desktop/wake` 比对 10 分钟。先按前端止血落地，后端方案留作 #5 一起跟 fable 谈。

---

## #1 · 角色长对话“字数坍缩”，加一层 len() 反坍缩纠偏（后端 · Emerald-presence）

> **本仓库无此逻辑，纠偏提醒在后端拼 prompt 处。cc 需切到 `D:\ai\Emerald-presence\` 施工。**

**需求拆解（按茶茶原话）**
- 现象：长对话里回复长度会“锁死”——要么一直长、要么一直短，缺随机性。
- 方案：仿照现有“重复字符纠偏提醒”，**加一条基于字数的反坍缩**：对最近若干条角色回复做 `len()`，分几个区间（如 极短/短/中/长/极长），当连续多条落在同一区间时，往 prompt 注入一条纠偏提示（“最近几条都偏X长，这次换个长度”之类）。
- 明确不做：**不要在代码里再叠“情感浓度”那一层**。茶茶的判断是——情感浓度高时 LLM 本来就会无视纠偏提示，这与纠偏刚好互相中和，交给 LLM 自己处理即可。所以代码只做字数区间检测 + 提示注入，别加情绪权重系数。

**cc 施工步骤**
1. 在 Emerald-presence 里定位现有“重复字符纠偏”的实现（grep：重复/纠偏/correction/repeat/penalty/reminder，以及 prompt 组装/system 附加提示的地方）。反坍缩提示要挂在**同一处**、走同样的注入通道，保持风格一致。
2. 取最近 N 条角色（assistant）输出的字符数（`len()`，注意中文按字符不是字节）。N 建议 3–5，可配置。
3. 分区间：给一组阈值（例如 <15 / 15–40 / 40–80 / 80–150 / >150，按实际语料调），把每条映射到区间。
4. 判定坍缩：最近 N 条**落在同一区间**（或方差过小）→ 触发。注入一条简短纠偏提示，方向是“打破当前长度惯性”，不指定具体字数（避免又锁死到另一个值）。
5. 只注入提示，**不硬裁不硬扩**输出；提示是软引导。
6. 配置化：N、阈值、开关放配置，方便茶茶调。

**验证**
- 构造/回放一段“连续 5 条都很长”的对话 → 确认下一次 prompt 里出现反坍缩提示；连续 5 条都很短同理。
- 长度本就有起伏时**不**注入（避免过度纠偏）。
- 与“重复字符纠偏”并存时两条提示不打架、不重复堆叠。
- 确认没有额外加情感浓度系数（按茶茶要求）。

---

## #5 · 主动触发累积太快 + 队列排查（后端 · Emerald-presence，大概率拉 fable）

> **本仓库只有两个触发相关的旋钮**（都是打后端）：`patch_proactive_gap`(PUT `/scheduler/config` `global_proactive_min_gap_hours`) 和 `get_proactive_gap_hours`(GET，读的是 `global_proactive_min_gap_seconds`)。**累积逻辑和队列都在后端 scheduler。**

**茶茶的诉求**
1. 主动触发累积太容易 → 角色说话过频、还老乱召回记忆说一堆废话 → **降频**。
2. 排查主动触发**有没有队列**；没有的话茶茶去找 fable 讨论怎么做。
3. 更大的顾虑：触发器整体乱——分前后端、分情况、分平台、分不同写入方式（日记/聊天/写信）。要一个**大致判断 + 止血**。

**我的大致判断（供茶茶决策）**
- **前端侧触发面其实很收敛**，别在前端找乱源。客户端只有：① `desktopWake`（上线，每 session 一次，见 #2）；② WS 推来的 `action`（含 `presence_nag`、`dream_invite`、`toy_invite`）——这些都是**后端已经决定要说/要弹**之后推给前端执行的，前端不产生“主动召回”。
- **所以“累积太容易 + 乱召回 + 说废话”几乎全是后端 scheduler + pipeline 的行为**，止血也得在后端。
- 已知 `known-issues.md` 里也记着相关隐患（花园事件 `events` 是循环逐条 `await _pipeline_send`、中间**没有节流**，多事件同 tick 会“一次说太多”）——这条印证了“可能缺队列/节流”。

**cc 施工（分止血 + 诊断两步）**
1. **止血（低风险，立刻能做）**：把 `global_proactive_min_gap`（最小间隔）调大，直接降频。先确认后端到底读 hours 还是 seconds——**本仓库 patch 发 `..._hours`、get 读 `..._seconds`，键名不一致**，cc 去后端核对 `/scheduler/config` 实际字段，顺手修掉这个前后端键名 mismatch（否则茶茶在设置里调完拿不到正确回显）。
2. **诊断队列（给 fable 讨论用）**：在 Emerald-presence 里查主动触发的调度：
   - 累积/阈值是怎么攒的（计时？事件计数？情绪/存在感累积？）——找出“太容易”的那个阈值。
   - **是否存在队列**：多个触发同时 ready 时是串行逐条发（像花园 events 那样无节流），还是有 queue/去重/合并/单飞（single-flight）+ 全局节流闸。
   - 触发的**分类维度**盘一遍：前端 vs 后端来源、按平台（desktop/QQ 等）、按写入方式（日记 / 聊天 / 写信）。整理成一张表：谁触发、走哪条 pipeline、有没有共用的节流/冷却、会不会互相叠加。
3. cc **不要**擅自重构触发架构（这是要跟 fable 谈的大改）。#5 的产出是：**一张现状盘点表 + “有没有队列”的明确结论 + 止血后的降频参数**，写回本 brief 或新开诊断 doc，供茶茶带去和 fable 讨论。

**验证**
- 止血：调大 gap 后，观察主动说话频率明显下降；设置面板回显数值正确（键名 mismatch 修复）。
- 诊断：产出“触发器现状盘点表 + 队列有无结论”，不动架构。

---

## 一句话判断汇总

| # | 问题 | 归属 | 性质 | cc 动作 |
|---|---|---|---|---|
| 3 | 状态 tab 黑屏 | 前端 | bug | 加 ErrorBoundary 止血 + 跑控制台定位真因 |
| 4 | 先前端后后端→历史空白 | 前端 | bug | init 可重入，WS open/轮询时重拉 |
| 2 | 上线触发重登刷新误发 | 前端 | 止血 | 持久化时间戳做 10min 去抖 |
| 1 | 字数坍缩 | 后端 Emerald-presence | 功能 | 加 len() 区间反坍缩提示，不叠情感浓度 |
| 5 | 主动触发累积/队列 | 后端 Emerald-presence | 止血+诊断 | 调大 gap 降频 + 盘点+查队列，大改留给 fable |
