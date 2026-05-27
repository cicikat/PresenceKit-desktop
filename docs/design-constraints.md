# Design Constraints & Architecture PTSD

> 这个文件不是 roadmap。
> 这是系统边界、历史事故、以及“为什么不要随便优化”的记录。

---

# 1. Dream 必须是独立 pipeline

## 原则

Dream / Reality 是同一人格系统，但不是同一运行链路。

Dream 不允许：

* 写入现实 short_term
* 进入现实 trigger 链
* 调用现实 post_process
* 污染现实 mood / memory / author note

Dream 只允许：

* 使用冻结上下文快照
* 写入独立 dream_log
* 输出有限 afterglow / summary（如未来需要）

## 为什么

早期曾出现“所有东西共享 pipeline”的倾向。

风险：

* 梦境内容污染现实人格
* 梦境 trigger 意外进入现实调度
* afterglow 被 capture_turn 吃进 short_term
* reality / dream 边界逐渐消失

Dream 的目标是：
“意识层漂移”
不是：
“另一条现实时间线”。

---

# 2. Trigger 只负责“是否触发”

## 原则

Trigger proposer 必须尽量纯。
trigger 不负责：

* tool 执行
* memory 写入
* prompt 注入
* UI 推送

副作用必须延迟到 execute callback。

## 为什么

历史上 trigger 有扩散成“半业务层”的趋势。

结果会导致：

* 无法定位副作用来源
* 调试困难
* scheduler 与 pipeline 耦合
* “为什么它会这样”无法回答

当前已完成收口。
未来不要重新把业务逻辑塞回 trigger。

---

# 3. Tool raw output 永不直接进入 memory

## 原则

raw_data 只能作为工具内部数据存在。

prompt / memory / UI 默认只吃：

* safe_summary
* memory_candidate
* user_visible_text

## 为什么

曾存在：
tool_result_string
→ 直接注入 system prompt
→ LLM 引用
→ capture_turn 写入记忆

风险：

* prompt injection
* HTML / 搜索结果污染人格上下文
* 外部数据进入长期记忆

ToolResult v0 已做第一层收口。
不要为了“省事”恢复裸字符串注入。

---

# 4. UI 复用靠 shared，不靠“mode 套娃”

## 原则

Dream UI 不是 Chat UI 的 theme。

应：

* 共享 shell / layout / input primitives
* 独立 message model / renderer

不要：
chat/modes/dream/modes/xxx 无限嵌套。

## 为什么

Dream 后续会包含：

* scene block
* narration
* time drift
* choice
* multi-presence
* afterglow

这些不是普通 chat message。

如果强行塞进 chat renderer，
未来会污染现实聊天结构。

---

# 5. 文档必须描述“真实运行状态”

## 原则

docs 不允许只写理想架构。

必须标注：

* 已接入
* shadow-only
* dead path
* future plan
* 未启用

## 为什么

曾出现：
“文档里的系统”
≠
“真实运行系统”

例如：
PerceptionEvent 已有结构，
但现实流程完全未接入，仅 shadow log。

如果不记录真实状态，
未来极易产生双轨 bug。

---

# 6. 不要为了“理论完美”暂停体验生长

## 原则

优先：

* 可运行
* 可体验
* 边界明确

而不是：
“先彻底重构底层”。

## 为什么

系统已经进入：
长期状态 + 多窗口 + 多 pipeline + 人格连续性阶段。

此时大重构极易：

* 无限延期
* 架构雪崩
* 功能停滞
* 人类主控失去系统地图

当前策略：
局部收口 > 全局重构。

---

# 7. AI 会脑补架构，人类必须保留地图

## 原则

Claude / CC / GPT 可以：

* grep
* patch
* 对 diff
* 做局部设计

但：
系统整体结构认知必须保留在人脑。

## 为什么

多 AI 并行开发后，
容易出现：

* Claude 知道一点
* CC 知道一点
* GPT 猜一点
* 人类反而不知道当前真实状态

因此：
任何大改前，
优先做只读审计。

第一章：系统不是单 pipeline

必须写：

Dream 不共享 reality prompt_builder
Dream 不走 reality post_process
duplicated logic 比 shared contamination 更安全
freeze snapshot 是故意的

因为以后一定有人：

“统一一下更优雅”
第二章：生成文本不等于事实

这是你最大的 PTSD。

必须写：

literary output 不直接写长期记忆
summary ≠ truth
emotional trace 必须 decay
temporary state 不得固化成人格事实

因为这是人格坍缩根源。

第三章：状态语义 ≠ 网络错误

这是今天 websocket 学到的。

必须写：

replaced by new connection 是 intentional replacement
不得自动重连抢占
watchdog 必须配 heartbeat
单连接假设来自旧桌宠时代

这个以后一定还会有人踩。

第四章：错误必须 observable

history 那轮特别典型。

必须写：

“0 entries” ≠ “没有历史”

还有：

fallback 必须 observable
auth failure 不得伪装为空状态
network/malformed/empty 必须区分
第五章：RP层不得控制逃生语义

这个其实特别值钱。

必须写：

/stop 是 system-level
hard_exit pre-LLM
roleplay 不得接管退出权限
escape semantics 高于沉浸感

这个属于“数字心理安全”。

第六章：系统会偷偷绕旧路

这是你代理 PTSD 那条。

必须写：

fallback 会绕过新边界
shared helper 会偷污染
老 fetch 会漏 auth
grep 只能找到代码，找不到旧假设

这个是维护哲学。

dream.ts 用浏览器原生 fetch()，WebView2 会经过系统代理 127.0.0.1:7897，该代理不转发 localhost 流量，返回 502。

修法：Dream 的 5 个端点改为和其他所有 API 一样走 Tauri invoke → Rust reqwest .no_proxy()，完全绕开代理。