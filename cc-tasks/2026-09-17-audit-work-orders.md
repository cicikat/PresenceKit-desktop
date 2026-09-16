# 9.17 审计复核与施工单

原始输入：`9.17审计结果.md`。本单按当前源码复核，不把建议当作已复现故障。
仅修改本仓（用户已确认）；后端、手机只读核对。完成实现及适当验证才勾选；设备验收单列。

## 复核判断

| 原项 | 判断与证据 | 施工决策 |
| --- | --- | --- |
| P0-1 | 成立：ChatPanel 的 HTTP、stream、canonical、history、timer 分别修改注册表和 loading。风险成立，尚未证明所有排列均有故障。 | WO-03 统一对账；保留一回合多个分段气泡。 |
| P0-2 | 成立；文件定位应为 shared/api/pseudoStreamText.ts，Dream/useDreamChat 与 ActivityCompanionPanel 均消费它。 | WO-04 跨仓契约交接；无明确请求 ID 时不声称精确归属。 |
| P0-3 | 成立：activeCharacter 从 UI 偏好读取 ID，Reality scope 用其过滤。 | WO-04 先确认全局角色跟随或本机固定会话语义。 |
| P1-1 | 两个物理坐标写入口成立；源码未找到实际 updateBounds 调用者，不能认定已发生竞争故障。 | WO-05 确认既有可信 Mod API 兼容策略后收口写入口。 |
| P1-2 | 协调集中成立；文件大小不是故障证据。 | WO-06 保行为提取生命周期协调，不重写底层 service。 |
| P1-3 | 成立；默认示例目前不声明 nativeSurfaces，不等于 native 能力已退役。 | WO-02 列实机矩阵，WO-07 实测；不得用 fixture 代替。 |
| P1-4 | “后端解析丢 turn_id”已过时：当前 chat_log.py 与 test_chat_log_turn_id.py 已有实现及测试源码。 | WO-01 修正交接文档；部署、真实重启读取仍未验证。 |
| P1-5 | 成立；现有 helper 测试不证明整条对账状态机。 | 并入 WO-03，覆盖事件乱序和生命周期。 |
| P2-1 | 成立：根架构含互相覆盖的历史叙述。 | WO-08 当前架构与历史记录分离。 |
| P2-2 | 不单独改名：重命名不是 authority 收口，会造成无效迁移。 | 并入 WO-03；明确 helper 非生命周期 owner。 |
| P2-3 | 边界需补；character.active 是现有兼容债，不能文档宣称已经消除。 | WO-09 文档分类，运行时迁移依赖 WO-04。 |
| P2-4 | 成立；已有 JSON 台账应扩充，不另建竞争真值。 | WO-02 统一登记近期 open 验收。 |

## 逐项施工

- [x] WO-00：逐条复核，区分真实风险、过时事实、设计建议；完成本工单。
- [x] WO-01：修正历史 turn_id 实现状态；保留真实部署/重启/思考恢复 open。无代码契约变更。
- [x] WO-02：扩充 runtime-acceptance-matrix.json，登记 Design Mod、Dream 请求隔离、Chat 重试/恢复实机项，验证台账；runtime-acceptance-matrix.test.ts 通过（1 项）。
- [ ] WO-03：ChatTurnReconciler 接入 HTTP/WS/stream/history/fallback；loading 和 alias 生命周期由同一 owner 管理；事件矩阵回归。依赖 WO-04 的角色语义决策，协议缺字段须保留兼容边界。
- [ ] WO-04：明确角色与请求作用域、旧请求归属、跨仓范围；定义 capability 上线及 shim 删除条件。未确认前不改契约或扩大仓库。
- [ ] WO-05：native geometry 唯一写入口；明确旧 updateBounds 的兼容/退役语义，再修改 Host API / IPC 并验证 Rust。
- [ ] WO-06：DesignRuntimeCoordinator 提取与清理顺序回归；依赖 WO-05，保持 portal、scene、snapshot 服务和 API 行为。
- [ ] WO-07：真实 Windows DPI/多屏/睡眠/热重载/主窗关闭验收；依赖 WO-05/06 与设备环境。未运行不勾选。
- [x] WO-08：根 ARCHITECTURE 仅保留当前结构、不变量及子系统链接，旧文档归档保留。
- [x] WO-09：UI preference 持久化边界与现存兼容例外文档；不删除用户偏好数据。

可独立施工：WO-01、WO-02、WO-08、WO-09。代码主线：WO-04 → WO-03；WO-05 → WO-06 → WO-07。
每个独立交付提交一次；测试/fixture/源码核对与真实运行证据分开登记。

## 必须保持的不变量

- canonical turn_id、transport msg_id、本地气泡 ID 分开；HTTP 前允许暂存本地请求身份，不伪造 canonical ID。
- 一个回复可以有多个分段，但同一回复不得因多条传输重复展示；不同 ID 的同文回复不得合并。
- 请求失败/重试不能覆盖新草稿；网络结果不明时，原协议无幂等键，不能承诺后端只执行一次。
- 角色/域变化不得把旧回包写到新会话；legacy 无 request_id 的并发归属不能靠 reducer 猜对。
- StateEngine、短命 tool overlay 与只读 presenter 保持现有职责，不塞回单一全局 store。
- 设置及观测由后端管理面负责；本次台账是开发验收文件，不增加产品设置或运行时持久状态。

## 三面检查与未完成范围

已只读核对后端三仓总账、历史解析器和对应测试源码；未运行后端测试、未更改后端总账。
WO-01/02/08/09 是文档与验收元数据变更，不改变管理面、桌面/手机设置、scope、队列、ack、TTL 或 fallback。
涉及 WO-03/04 的手机、relay、后台服务及请求入口还需定向核对；目前不声称跨端闭环。
跨仓总账同步待范围确认；只改本仓时以本单作为后端交接。实机结果以现有 JSON 台账为准。
