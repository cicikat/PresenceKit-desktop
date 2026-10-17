# PresenceKit-desktop 当前架构

2026-10-11 增量：现有 MotionLibrary 接入本机 UAL 派生共享 Clip；Room EditorPanel 的
MotionPreview 提供播放/暂停/继续/恢复 idle，预览临时暂停自动选择，关闭恢复。无新架构或 WS
字段。ChatWindow 在连接恢复时刷新角色头像。详见 docs/motion-assets/tv-ual-import.md。

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

Room 的 GLB 透视相机预设由 ThreeCallStage 的场景加载过程提取，经 RoomWindow 右下角菜单选择；
主动视频来电由主窗口 WS 邀请创建独立窗口；来电窗口按邀请角色 ID 读取头像，拒绝立即关闭并异步回执，超时关闭有本地销毁兜底。接通仍回到主窗口 Room。
所选机位与人物站位写入本机 RoomSettings，原有场景×人物组合记忆继续生效。
摆放模式允许轨道视角调整，退出时保存相机；视频通话摄像头采集和后端视觉路由独立。
大场景中人物离开视野时，Room 底栏可按当前实时镜头一键找回人物；相机预设菜单是右下角
独立的低干扰浮动入口。

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
空流等待在本地请求全部结算后立即收起，无主空流另有 8 秒上限；
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

## Room screen expression driver (2026-10-10)

`src/windows/room/screenConfig.ts` validates the opt-in data contract; `screenDriver.ts` owns only its unique target material clone and bounded textures. `useRoomScene.ts` loads/releases it on model lifecycle. Shared CharacterPerformer, Pet, StateEngine and backend mood storage remain unchanged. Room-only `callActivity.ts` provides transient activity. Contract: docs/tv-screen-contract.md.

## Room sentence/audio ownership (2026-10-10)

Room uses isolated callDirectiveLayers; legacy Pet directive storage is unchanged. Baseline and sentence expiration are independent. CallSpeechPlan merges canonical msg_id with segments, waits at most 150ms for metadata and preserves turn order; metadata alone never creates speech. Audio start/end owns TTS performance; text mode owns VN performance. Late cues only attach to unique exact normalized text; unavailable metadata falls back to whole-message speech. Queues and metadata are bounded. Character change/unmount cancels old generation. Live2D receives a caller-injected directive getter; its default remains legacy behavior. No new backend WS fields, persisted mood or mobile actions. Actual Tauri/audio acceptance remains pending.

## Character motion frame lifecycle (2026-10-10)

Room/Pet call `CharacterPerformer.prepareFrame()` before their mixers to remove
last frame's procedural overlay, including properties with constant clip tracks.
Room then runs Idle Mixer -> external motion Mixer -> performer -> matrices -> springs.
Head axes are calibrated from the loaded pose; speech amplitude is smoothed;
breath/shoulder offsets remain bounded. Idle models retain the authored pose.
P1/P2 now adds a Pet Idle Mixer and independent PNG driver; see the update below. GLB remains unchanged.
See `cc-tasks/2026-10-10-tv-idle-motion-audit.md` (relative to repository root).

### GLB 行为层（2026-10-10）

src/shared/character/behaviorState.ts 是桌面临时呈现仲裁器，不复制 StateEngine mood 真值。behaviorParameters.ts 集中微动作和反馈时限；microMotion.ts 只生成偏移目标。桌宠新增复用 Room 的 Idle clip 选择/轨道过滤与 screenDriver；保持原 Mixer 基准恢复顺序。身体与 PNG 生命周期独立，真实音频播放通知优先，接口见 docs/backend-integration.md。

## Avatar shared motion library (2026-10-11, partial)

Skin/Rig/Motion/Avatar boundaries and validation: docs/avatar-shared-motion-library.md.
CharacterPerformer captures the bind-based RigProfile before posing. MotionLibrary reads one
shared catalog, caches successful data-only adaptations, and feeds the existing MotionPlayer.
Room initial load/reload and Pet use the same loading contract; AvatarMotionDriver selects
existing semantic IDs from trusted performance, without another event bus or emotion store.
Raw GLB/material/screen resources remain unchanged. Real Tauri/visual acceptance is open.

## Room 电视机 toon 验证（2026-10-11，partial）

Room 通过临时 URL roomToon=1 和 TV v02/v03 白名单进入独立 RoomToonValidation；
不改变动作链，渲染时替换/恢复材质与灯光，采用三档 toon/rim、OutlinePass、
选择性 UnrealBloomPass、unlit 渐变背景及假接触阴影。默认仍用 GradeRenderer。
无跨端影响，不新增落盘设置或通信合同。真实 v03 浏览器对比已保存；
真实 Tauri、v02、动态动作、复杂地面和 GPU 性能验收 open。
详见 docs/room-toon-validation.md（docs 内对应 room-toon-validation.md）。
## Room TV 赛璐璐与预设（2026-10-12，partial）

编辑模式 MaterialSection 提供原版/旧浅色/赛璐璐切换、五类材质配色和本机预设。celConfig 校验 room.settings；celShader 生成硬阴影与光照交界藏色；CelOutline 使用全角色 normal/depth mask 描边。真实 WebGL 与本机预设刷新已验证，Tauri、动态穿插和 GPU 性能仍 open。无跨端影响，详见 docs/room-cel-materials.md。


## 主窗口标题栏图钉（2026-10-13，partial）

MainWindowFrame 位于主窗口 RoleRoot 外层；关闭 main 原生 decorations，自绘标题栏按图钉、最小化、最大化/还原、关闭排列。
原聊天页偏好左侧图钉已移除；WindowPinButton 迁至 shared/window，采用经典斜图钉，读取原生置顶状态、不落盘。
main capability 仅新增标题栏需要的 start-dragging、minimize、toggle-maximize、close；沿用 set-always-on-top。
标题栏支持拖动与双击最大化，resize 同步还原图标；内容容器约束 fixed overlay，Room/Toy/Dream/引导和错误页面在标题栏下方。
独立 Pet/日记/来电/satellite 保留原窗口装饰；无 REST/WS、后端或手机设置变更，无跨端影响。
真实 Windows 置顶遮挡、拖动/双击、边缘缩放、Win+方向键贴靠与发行包验收仍 open；自绘最大化按钮未实现原生悬停 Snap Layout 菜单。
工单见 [window-pin-2026-10-13.md](docs/window-pin-2026-10-13.md)。

## Live2D 原生资源档案（2026-10-17）

`shared/live2d/modelProfile.ts` 解析模型自带可选 EmeraldProfile；`nativeMotionPlayer.ts` 执行单通道原生动作与退出生命周期。`stageControls.ts` 只注册当前窗口的人工预览端口，Room 编辑面板消费它。已有 directive 词汇不变；无后端/手机新接口或状态。普通无档案模型保持原驱动，3D 不变。边界与验收见 [资源导入说明](docs/live2d-resource-import.md)。
