# 后端情绪与表达合同（2026-10-25）

后端升级为单一 schema v3 情绪状态，current/intensity/has_signal/source_turn_id/source_at/expires_at 仍只描述明确表达；新增 affect 是内在模拟投影。桌面轮询继续消费外层表达，内部 anger 不应直接覆盖 outward smile，不增加本地情绪写入或独立衰减模型。手机同样维持既有表达轮询。

avatar_directive 新增可选 char_id/version/source_turn_id/source_at/expires_at。统一 WS action 入口先校验角色、数字、来源时间、截止和来源顺序；重复/过期/错角色的包直接 ACK 收件而不发给窗口，投递延迟从 ttl_ms 扣除。未带版本字段的旧包仍兼容；有版本的部分字段缺失则拒绝。Room 的调用基线已随角色切换 reset；共享 avatar 状态读出时也清除来自旧角色的 WS 表情，嘴型、眨眼、原生动作和逐句 perform 的所有权不变。

后端管理面新增 affective_engine.enabled，默认开启，热关闭恢复仅明确表达余韵。桌面没有新心理设置控件；细分控制留在后端管理面。/mood/state（state.read）提供内在投影/事件计数但无来源正文；/mood/events（memory.read）提供事件与重评，当前桌面没有独立事件编辑/展示面。角色权限、消息投递、request_id/turn_id/msg_id 关联、TTS/STT 和设备许可均沿现有链路。

源码情绪消费者与前后端 ABI 已核查，确定性门控测试、TypeScript 检查和构建用于工程验收。后端隔离浏览器验证不代替原生 Tauri 窗口、Live2D/GLB动作恢复、真实语音或手机设备验收。真实模型拟人评估与设备切角为 observe；本次不新增表情、目光素材或混合声线。后端详细实现及分单记录见同级后端仓库的 docs/affective-engine.md 与 docs/work-orders/affective-engine-2026-10-25.md。
