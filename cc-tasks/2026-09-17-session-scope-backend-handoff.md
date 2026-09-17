# 9.17 跨仓交接：固定会话角色与请求归属

状态：open；本次仅本仓文档交接，未修改后端或手机。
用户确认：本机固定会话角色，其他设备/管理面切换角色不得改变本机会话。

## 当前已核对的缺口

- 桌面 sendChat → send_chat → /desktop/chat 只提交正文、引用和语音凭据，无显式角色/请求身份。
- 后端 admin/routers/chat.py::desktop_chat 进入 legacy_desktop_context / run_legacy_owner_turn，未消费请求 char_id。
- 后端 /chat-log 支持 char_id，但桌面 load_chat_log_dates/day 未传递；只改读取会使发送与历史作用域不一致。
- 后端上传路径也读取全局 active character，附件必须和普通发送一起绑定。
- shared/api/pseudoStreamText.ts 会认领第一个带 char_id、无 round_id 的 stream；它甚至不比较预期 char_id。
- activeCharacter.ts 的 prompt-assets 镜像只能显示，不足以证明服务端执行会话。

## 后端交付要求（待契约评审，不是已上线字段）

1. 为 owner 的 desktop/mobile 会话提供已授权角色 scope，明确角色可用性和删除/撤权结果。
2. 发送、上传、wake、历史、思考读取及其相邻主动/通知路径核对同一 owner/character 边界；
   不通过临时切换全局 active character 实现请求隔离。
3. 请求开始冻结 scope；response、stream、channel、segments 保留 request_id、domain、char_id，
   transport msg_id 与 canonical turn_id 明确分离；group 另含 round_id。
   turn_id 尚未生成的早期 stream 必须允许明确的后续绑定，不伪造 turn_id。
4. 声明支持能力/版本。旧服务端不支持固定会话时，桌面不能静默发送给全局角色。
5. request_id 的关联与幂等是两件事。重试是否复用 ID、服务端去重窗口、失败/未知结果、附件去重
   需单独定义；不能把新增关联字段当成已经实现 exactly-once。
6. 管理面展示 capability/effective state 和必要的无正文关联诊断；新落盘/队列/trace 必须配套观测。
7. 手机核对 Flutter/Android 会话选择、后台、relay、poll/ack、TTL、权限与降级，不新增桌面运维 UI。
8. 同步后端 docs/three-repo-interface-catalog.md、协议 fixture 与回归测试，交付可供桌面消费的版本。

## 桌面后续接入与删除条件

- 只在明确支持新契约时绑定本机会话角色；角色名/头像镜像与执行 scope 分开。
- 新请求、历史读取和收到的身份必须精确匹配；旧请求回复仍属于原 scope，不能写到新角色消息列表。
- scope 切换清理/隔离 pending、stream、history、reasoning 和延迟回调；其他设备切换不触发本机切换。
- 所有生产端点及手机生产者均输出新字段，旧版本降级策略通过后，才删除 legacy pseudo-stream/hash shim。
- 旧无 ID 历史不编造关联；新带 canonical ID 的记录不得按正文合并。

验收：桌面 A/手机 B 同时聊天；管理面切换 C；A 上传/历史/思考仍是 A；旧回包不污染新会话；
Dream/Activity 并发不互相认领；WS 重连/乱序/无 canonical/超时/重试均可收敛。
对应真实运行项在 docs/runtime-acceptance-matrix.json，当前 not-run。
