# Design Constraints & Architecture PTSD

> 这个文件不是 roadmap。
> 这是系统边界、历史事故、以及“为什么不要随便优化”的记录。

> 2026-07-12 客户端审计：第 1–12 条仍是有效约束。Dream API 已统一改为
> Tauri `invoke` → Rust `reqwest.no_proxy()`，不再存在本文件末尾曾记录的浏览器 `fetch`
> 绕代理旧路径；原始事故说明已移除，避免被误当作当前实现。

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

因此：任何大改前，优先做只读审计。跨仓后端约束的实现细节以
`Emerald-presence` 的架构与测试为准；本仓只记录和执行其客户端边界。

---

# 8. 生成文本不等于事实

文学输出、摘要和临时情绪痕迹都不能直接固化为长期人格事实。任何进入 memory 的内容必须
经过独立的候选、验证和衰减语义；`summary ≠ truth`。否则一次对话、外部工具内容或短暂状态会
被误写成永久人格记忆。

---

# 9. 连接替换不是普通网络错误

legacy WS 采用单连接语义，新连接替换旧连接是预期行为。独立 Pet Webview 不得自行连 WS，
必须订阅主窗口转发的 Tauri 事件；watchdog、心跳和重连也不得演变为多窗口抢占连接。传输状态
要与“后端业务失败”分开呈现和诊断。

---

# 10. 空结果、降级和错误必须可观察

“0 entries”不等于“没有历史”。网络错误、鉴权失败、响应畸形、明确空结果和 fallback 必须在
调用方可区分；不得把鉴权或网络失败伪装成空状态。新增 fallback 时，同时记录触发条件和可见
诊断路径。

---

# 11. RP 层不得控制退出语义

`/stop`、hard exit 等退出语义属于 system-level，必须在 LLM/RP 文本解释之前处理。沉浸感不能
接管用户的退出权限；逃生语义优先于角色扮演。

---

# 12. 旧路径和 fallback 会绕开新边界

共享 helper、fallback 和遗留请求最容易悄悄绕过鉴权、代理或数据边界。新 HTTP 一律经 Tauri
`invoke` → Rust `reqwest.no_proxy()`；不要恢复浏览器 `fetch` 直连后端。代码检索只能发现路径，
不能证明旧假设仍成立，因此改动后还要核对实际运行链路与本文档。
