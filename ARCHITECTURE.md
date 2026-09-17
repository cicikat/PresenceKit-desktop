# PresenceKit-desktop 当前架构

本仓是 Tauri + React + TypeScript 桌面客户端。后端负责业务状态、生成、权限与数据；
桌面负责呈现、本机授权及受控动作。施工入口为 `AGENTS.md`。

## 入口与窗口

`src/main.tsx` 按 window query 懒加载独立 WebView：chat（默认）、pet、presence-nag、
diary-detail、design-satellite。主窗口中 Room/Toy 覆盖 Chat；Activity/群聊由 ChatWindow
主区域承载，保持 ChatPanel 实例与草稿。Dream 是独立 pipeline 的 overlay，不复用现实聊天状态。

| 子系统 | 当前责任与入口 | 详细文档 |
| --- | --- | --- |
| ChatWindow / ChatPanel | LayoutHost、Ribbon、Sidebar、消息/附件/引用/重试、HTTP/WS 对账、历史与思考入口 | [前端结构](docs/frontend-structure.md)、[对账](docs/chat-correlation.md) |
| Dream | 单人/群梦、HUD、潜意识只读展示、回放；不写现实 StateEngine | [Dream HUD](docs/dream-hud.md)、[记忆](docs/memory.md) |
| Activity | 阅读、棋类、梦种等活动；API 集中在 shared/api/activity-api.ts | [前端结构](docs/frontend-structure.md) |
| Pet / Room | 粒子、3D、Live2D 与交互；Pet 消费主窗口转发，不自建 WS | [桌宠](docs/pet-window-reference.md) |
| Diary | Sidebar 只读角色日记与独立详情窗；Obsidian 用户日记同步是另一条链路 | [后端接入](docs/backend-integration.md) |
| Theme / Layout / Design Mod | 主题 token、布局槽位、可信 ESM 合成与 native satellite | [主题](docs/ui-mods.md)、[布局](docs/layout-mods.md)、[Mod 作者入口](docs/design-mod-authoring.md) |
| Tauri / sensor | HTTP/WS token、窗口、文件、动作及键鼠/视觉采集；截图本地授权默认关闭 | [后端接入](docs/backend-integration.md)、[设置边界](docs/settings-control-audit.md) |

## 状态所有权

- `src/shared/state/store.ts` 的 `STATE_FIELD_OWNERSHIP` 区分 backend-polled、backend-pushed、local-derived、sensor-derived；所有 engine 修改走其明确入口。
- ChatWindow 持有 StateEngine；Pet 经 Tauri 事件接收快照。ToolStatusOverlay 是短命显示覆盖，不回写业务状态。
- SidebarPresenters 共享轮询、订阅与 consumer 生命周期；官方 Sidebar 与 Design Mod 消费同一份只读投影。
- UI preferences 是外观、布局和本机交互偏好。文件为原生持久层，localStorage 为镜像/浏览器 fallback；[边界及兼容例外](docs/ui-preference-boundary.md)。
- 角色、会话、domain、工具权限和后端生命周期以服务端契约为准。当前 `character.active` 镜像仍参与过滤，是待迁移债务；用户要求的“本机固定会话角色”尚需端到端显式角色协议，不能视为已实现。

## 消息与身份

HTTP 经 `src/shared/api/` → Tauri command → Rust reqwest（显式 no_proxy）；WebView 不直接 fetch 后端。
WS 经 `ws_bridge.rs` 原生 Bearer 握手与 Tauri 事件，token 不进入 URL 或 WebView。
协议以 [protocol-v0](docs/protocol-v0.md) 为准，不因产品版本叫 v1 而推定已实现 v1 envelope。

ChatPanel 当前协调发送、流式临时消息、canonical channel、分段补充和按日历史。
本地请求槽由 ChatRequests 按气泡 ID 独立持有，loading 从 pending/stream wait 派生；
HTTP fallback 定时器由 ChatReplyFallbacks 按同一本地 ID 持有。呈现仍经 ChatPanel adapter；
完整 reconciler 尚未完成。无 request_id 的早期 WS 不猜归属。
`msg_id` 是传输关联，`turn_id` 是可信回合身份，本地气泡 ID 是呈现身份；一回合允许多个分段气泡。
思考读取仅接受明确 canonical turn_id。后端历史解析已有可选 turn_id，真实部署/重启恢复仍需验收。
提交立即清空 composer，失败重试保留原消息与快照，不覆盖新草稿；无服务端幂等契约时不承诺只执行一次。

Reality/Dream/Activity 的旧 pseudo-stream 缺 request_id，当前启发式过滤不提供并发归属保证。
不得把缺字段的 stream 猜成已确认会话。跨仓需求与本仓进度见 [9.17 工单](cc-tasks/2026-09-17-audit-work-orders.md)。

## Design Mod 边界

可信本地 Mod 通过官方 portal/presenter 使用能力，不建立第二份 HTTP/WS/history/TTS/StateEngine owner。
主窗口保留偏好与管理面入口；隐藏、Dream 或覆盖时暂停相应运行时工作。
scene、satellite、snapshot transport 保持独立服务。激活代次、lifecycle 与资源 ledger
由非 React 的 DesignRuntimeCoordinator 持有；Host 负责 mount/portal 与公开 API 构造。
Rust 根据 manifest 和主窗计算 native bounds；公开 updateBounds 兼容入口仍存在，尚未完成单一写入口迁移。
用户要求保留旧调用兼容，不能擅自移除。原生 DPI/多屏验收状态仅见统一台账。

## 安全与设置

本机密钥仅置于 gitignore 的 client.local.json 或既有环境配置；桌面 token 不等于 admin 权限。
后端管理面维护模型密钥、路由策略、生成与运维观测；桌面设置只暴露已有授权能力与本机偏好。
桌面已移除 Agent Runtime Browser 控制面，不重新引入任务 URL、凭据或第二份后台台账。
新增文案走语义 i18n key，新增功能须核对原链路、后端管理面和手机消费面。

## 实现与验收入口

运行验收唯一登记：[runtime-acceptance-matrix.json](docs/runtime-acceptance-matrix.json)，
规则见 [验收说明](docs/runtime-acceptance-matrix.md)。自动化、夹具与真实设备证据分别记录。
剩余问题见 [known-issues](docs/known-issues.md)；接口变更同步 [backend-integration](docs/backend-integration.md)。

旧原型迁移：旧 UI 原型与 Python 桌宠仅为参考；当前各窗口实现以上述源码为准，不修改参考仓。
花园仍为只读，后续协议设计与未落地能力不得描述为 current。
历史施工叙述归档于 [整理前快照](docs/history/architecture-before-2026-09-17.md)，不作为当前契约。
