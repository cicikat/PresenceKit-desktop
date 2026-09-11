# 工具链与动作旁白（2026-09-12，partial）

## 当前实现

- 后端 execute_structured 收口发出 owner reality 的 tool_activity，普通 Path A/C 与 autonomy 均覆盖。
- pipeline/autonomy 每轮生成独立 chain_id；每次工具调用生成 event_id。无参数、结果正文或凭据。
- running / success / error / unknown / pending_confirmation 只表达执行结果，不影响执行权限。
- 桌面消息流居中展示工具名，以线段连接同一链的调用，成功绿色、失败红色、未知/待确认黄色。
- 偏好「角色与对话」的显示工具调用默认开启，本地 chat.toolActivityVisible 独立于执行/存储开关。
- 旧 event_log 的可信 trigger:action_trace 尾部映射为 narration；不凭文本开头猜旁白。
- 近期回执复用既有 action_trace 的 30 条环形记录，通过既有 memory.read 历史 API 恢复。
  同 event_id 的动作旁白被工具回执替代，不重复显示。更早记录仅保留原旁白。
- 断流后未收到终态的 running 最多显示 10 分钟，再标未知；不会猜测成功。

## 三面检查与验证

管理面沿用 action_trace enabled/event_log_echo 和 /observability/tool-traces 查询，无新落盘文件。
桌面仅新增本地展示偏好；手机未消费新 WS 类型，原 poll/ack/relay 不变。
工具展示不进入聊天发送、TTS、StateEngine 或主动发言预算；执行闸门、确认、锁不变。
后端相关 57 项回归、前端 7 项回归、TypeScript 和生产构建通过。
Edge 浏览器 IPC 夹具验证工具连线、双色状态、去重、角色隔离、显示开关、输入提示删除通过。

open：真实 Tauri 与重启后的新后端联调；手机工具链 UI 为 roadmap。
partial：完整历史工具状态超过 30 条不保留，仅回退旧动作旁白；现有存储关闭时仅实时显示。
