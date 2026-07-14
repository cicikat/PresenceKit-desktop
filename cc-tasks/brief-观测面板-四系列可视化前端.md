# Brief（client）· 观测面板：四系列可视化前端

> 依赖：Emerald-presence 侧 Brief 64（观测端点补全）先行——本单只消费其只读 API。
> 风格与结构对齐现有 SubHiddenStatePanel.tsx；全部只读展示，唯一的写交互是
> 支出面板的意向单确认/拒绝（走既有 Bearer 鉴权请求层）。

## 1. 面板五块

| 面板 | 数据源（presence API） | 核心展示 |
|---|---|---|
| **成长** | `/growth/interests` `/growth/works/*` `/growth/notes/*` `/growth/practice-log` | 兴趣卡片（level 星级 + progress 斜率箭头 + stalled 标记）；作品时间轴（分数折线 + 点开看全文/评语）；技巧笔记列表（hits 徽标） |
| **视觉感知** | `/perception/visual-trace` | 按日 scene/activity 时段热力格；dropped 原因占比环图（幻觉率抽查入口：随机抽 N 条 caption 列表） |
| **支出** | `/spend/ledger` `/spend/budget` `/spend/mandates` | 台账流水表（status 着色）；日/月额度用量条；**意向单待确认卡片（confirm/reject 按钮，二次确认弹窗）** |
| **群聊仲裁** | `/group/{id}/arbiter-trace` `/group/{id}/relations` | 每轮候选分数条形（parts 分项悬浮）；echo_cut/silent_round 标记；角色关系对卡片（双向印象） |
| **记忆摘要** | `/memory/digest/{uid}` `/debug/recall` | digest 归档只读视图；召回 trace 表（命中层/分数/时间过滤范围） |

## 2. 约定

- 按 char_id 分桶展示（吸取 ACT-1 教训：前端时间轴不做全局 localStorage 混桶）。
- 空数据态友好（对应后端工单未跑时面板显示"未启用"而非报错）。
- 轮询刷新（面板打开时 30s），无 websocket。
- 不写盘符绝对路径；请求层复用现有 backend client 与 401/403/429 分支处理。

## 3. 验收

1. 五块面板空数据/有数据两态均正常渲染。
2. 意向单 confirm/reject 全流程（含 403 场景提示）。
3. char 切换后各面板数据随 char_id 变化（无串桶）。
4. `cargo test --lib` / 既有前端测试无回归。
