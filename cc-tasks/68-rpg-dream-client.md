# 68 RPG Dream 桌面客户端双栏模式

> 状态：`proposal`
> 优先级：`high`
> 范围：`Emerald-client` 桌面端；后端 Briefs 219-222 已完成，移动端暂不纳入本单
> 依据：`Emerald-presence/docs/rpg-dream-client-guide.md`、`Emerald-presence/docs/rpg-dream-api.md`、运行时 `/openapi.json`
> 创建：2026-09-02

## 背景与目标

RPG Dream 是 Dream 体系中的独立模式，与 `sandbox`、`scenario`、`mirror` 并列。桌面端已有用户侧 Dream 偏好界面 `DreamPrefsPane`；本单在该界面和现有 Dream 入口承载 RPG 的选择与生命周期。后端管理面板仅用于 Scenario 创作、Dream 配置观测和 RPG 运行观测，不是桌面端设置依赖。桌面端目前没有消费该契约的 UI；本单交付一个可发现、可进入、可恢复、可退出的双栏 RPG Dream 界面：左栏角色行动/可见回复，右栏 KP 私密玩家操作与规则结果，共享区显示 shared 条目。

客户端只负责展示、提交行动和恢复状态，不实现骰子、DC、seed、KP prompt、hidden facts、脚本编辑器或第二套剧本格式。RPG 复用现有 Scenario 的 `script_id`；`rpg_kp` 是后端模型路由类别，不新增客户端设置开关。

## 契约边界

- 启动/重连先调用 `GET /dream/capabilities`，仅在 `rpg.available=true` 且 `supported_modes` 含 `rpg` 时显示入口；未知未来模式降级为不可用，不影响其他 Dream 模式。
- 进入使用 `POST /dream/enter`，只发送 `dream_mode: "rpg"`、已有 `script_id` 和可选 `entry_reason`；防御性校验返回的 `dream_id`、`script_id`、`dream_mode`。
- 活跃态读取 `GET /dream/state`，当 `dream_mode=rpg` 时再读 `GET /dream/rpg/state`；恢复用 `GET /dream/rpg/transcript`，分页保留 `lane`、`kind`、`correlation_id`。
- 回合使用 `POST /dream/rpg/turn`；每次提交生成新的 opaque `request_id`，网络重试必须复用完全相同的 body。`lane` 仅允许 `character` / `kp`。
- 修正使用 `POST /dream/rpg/corrections`，沿用 request-ID 与 scene-revision CAS 规则；回放使用既有 `/dream/archive` 路由，不重新挂载会话。
- 退出使用 `POST /dream/exit`，按现有幂等行为处理；RPG 不调用 `/dream/chat`、`/desktop/chat`、普通工具、Reality pipeline、scheduler、广播或 RPG WebSocket。
- 所有请求携带 activity-capable Bearer token，经现有 Tauri HTTP bridge；不得在 WebView 中直接 `fetch`，不得读取 `data/runtime` 或从 WS 推断 RPG 字段。

## 实施分期

### M1：能力发现与客户端 Dream 偏好/入口

- 扩展现有 Dream capabilities/API 包装和类型，保留未知字段兼容。
- 在 `DreamPrefsPane` 与桌面现有 Dream 入口中增加 RPG 第四模式；选择后端已有 Scenario `script_id`，展示 `rpg/v1` 能力与只读可用状态，不实现剧本编辑。
- 接入 enter/exit 与只读 session status，明确 `uncertain`、非 `ok` health 为只读恢复态。
- 新增文案全部使用 `src/shared/i18n/` 语义 key，不向 `legacy.ts` 增加新文案。

### M2：双栏会话与安全恢复

- 新建或扩展 DreamWindow 的 RPG route/state machine，不拆第二个 Dream 窗口族。
- 恢复活动 branch transcript；character、KP、shared 分栏渲染，未知 `kind` 使用通用文本 renderer。
- 展示 `partial` 回合的 entries 与 error；`partial_read` 保留可读项并显示部分恢复状态。
- `RPG_DREAM_ID_MISMATCH` 丢弃旧页面状态并重载；`RPG_REVISION_CONFLICT` 刷新 state/transcript 后要求用户重新确认；`RPG_SESSION_UNCERTAIN`、`RPG_KP_OUTPUT_INVALID` 进入只读失败态。

### M3：行动提交、重试与修正

- character/KP 输入分别提交到 `/dream/rpg/turn`，禁止 fallback 到 `/dream/chat`。
- `RPG_ROUND_BUSY` 短退避后用原 body 重试；相同 request ID/相同 body 显示幂等成功，不同 body 的冲突停止重试并提示本地 request ID 冲突。
- 接入 clarify、retcon、branch 修正 UI，显示目标 round、理由和 CAS 冲突处理；旧 branch 与 dice ID 只作为 opaque metadata 保留。
- 归档列表/详情接入只读回放，禁止将回放误当作可继续会话。

### M4：回归、观测与交付验收

- 补纯逻辑测试：capability gating、lane 分栏、request body 重试一致性、错误码映射、transcript 分页、revision conflict 状态机和 archive 不可继续约束。
- 更新 `docs/backend-integration.md`、`ARCHITECTURE.md`、`docs/frontend-structure.md` 与 `docs/known-issues.md`；在后端三仓总账保留 Desktop `open`/`partial` 状态，不能把静态检查写成完整验收。
- 观测只消费后端已提供的 `GET /observability/dream-rpg`（`state.read`，管理/诊断用途），不把 observability 混入玩家 UI，也不新增客户端持久化真值。

## 验收标准

- 能从 capabilities 正确隐藏/显示 RPG；既有三种 Dream 模式行为不回归。
- 使用已有 Scenario script 进入后，刷新/重连可恢复 active branch；character/KP/shared 条目不会串栏。
- 回合、修正、分页、退出均使用文档路径和字段；不会调用 `/dream/chat` 或普通聊天入口。
- 所有稳定错误按 `detail.code` 分支；busy 可安全重试，冲突/不确定态不会静默重放或猜测结果。
- 不显示 prompt、hidden facts、DC、seed、骰面、绝对路径等后端禁止暴露内容；`<C>...</C>` 不在客户端执行。
- `npm test`、`npx.cmd tsc --noEmit`、`npm.cmd run build` 通过；涉及 Tauri bridge 时补 `cargo check`。真实窗口、后端运行态和多分辨率验收完成前，工单保持 `partial/open`。

## 明确不在本单范围

- `Emerald-presence/admin` 的 RPG 运行观测和 Scenario 创作属于后端管理面；本单不修改后端管理前端，也不把它当作客户端功能依赖。
- RPG-specific model routing、KP prompt、骰子/DC/seed/hidden facts 编辑或客户端设置开关。

## 关联文件（预期）

- `src/shared/api/dream.ts`、`src/shared/api/dream-types.ts` 及 RPG API 独立包装
- `src/windows/dream/components/DreamPrefsPane.tsx`、`src/windows/dream/`、`src/windows/chat/components/preferences/`、`src/shared/i18n/`
- `docs/backend-integration.md`、`ARCHITECTURE.md`、`docs/frontend-structure.md`、`docs/known-issues.md`
