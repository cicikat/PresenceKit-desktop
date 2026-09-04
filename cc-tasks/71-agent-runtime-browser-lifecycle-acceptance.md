# Brief 71：Agent Runtime 浏览器客户端生命周期与真实桌面验收

> 状态：`open`
> 优先级：`high`
> 范围：`Emerald-client` 桌面端
> 前置：后端 Brief 239；客户端 Brief 70

## 背景

Browser Runtime 面板已经接入 capability、task receipt、创建、自动运行、确认、暂停和取消，但目前只能证明 TypeScript/Rust/组件逻辑可编译。真实桌面窗口、Tauri bridge、后端 task 生命周期和真实 Chromium worker 尚未形成可复现证据；此外，待确认任务的原始请求只保存在 React 内存中，刷新或重启后不能安全地继续执行。

本工单必须先以 Brief 239 的公开 schema 为准，不得根据后端私有 TaskRecord 字段猜测协议，不得在 WebView 中直接 `fetch`，不得把页面正文或凭据带入客户端状态。

## 目标

让客户端在以下两种情况下都行为明确且安全：

1. 任务请求仍在当前会话内：可以对同一个不可变任务完成确认/运行，并防重复点击。
2. 页面刷新、窗口重开或应用重启后：只能根据后端公开 receipt 做安全降级；若后端提供受保护的 resume/confirmation handle，则按该契约恢复，否则必须明确显示“当前任务无法在本会话外确认/恢复”，只能允许后端契约支持的取消或只读查看，绝不能猜测参数或重放副作用。

## 必须实现

### 1. 请求与确认安全

- 所有创建、运行、confirm、pause、cancel 调用继续集中在 `src/shared/api/`，通过现有 auth gate 与 Tauri bridge；React 组件不得直接访问 HTTP、token 或后端私有字段。
- 客户端不得自行改写 task 的 URL、operation、selector、value、path 或 params。运行请求必须携带后端 Brief 239 要求的不可变 fingerprint/handle，或只使用服务端按 task_id 恢复的请求。
- 若本地没有与 task_id 对应的原始请求/安全 handle，`waiting_confirm` 的确认按钮必须禁用并给出本地化、可理解的原因；不能只显示通用错误，也不能发送空参数、默认参数或另一条任务的参数。
- `confirm` 与 `run` 必须具有单任务 busy 锁；快速双击、并发 polling、重复刷新不得产生第二次 confirm/run 或第二个 task。
- `outcome_unknown`、`failed`、`canceled`、`expired` 绝不能显示为成功；未知状态必须保留为 `unknown` 并采取 fail-closed 控件策略。
- 暂停后的恢复/人工接管若后端没有正式路由，按钮必须不可点击并显示降级状态；不得伪造 resume 成功。

### 2. 可见状态和降级

- capability 必须区分 `enabled`、`disabled`、`unavailable`、`remote_disabled`，并显示后端 reason/effective state；`enabled` 不等于任务成功。
- task 列表只显示公开 metadata：task_id、状态、时间、attempt_count、error_code、truncated、受控 artifact label/id。不得显示 cookie、token、password、profile、完整 query URL、页面正文、原始参数或绝对路径。
- capability disabled、后端 401/403/404/409/422、网络断开、后端 schema 缺字段、空 task 列表都必须有稳定的本地化界面状态；轮询失败要退避并可手动重试，不能自动重新创建或运行任务。
- 当前角色切换时必须清理旧角色的本地请求引用、busy 状态和错误；不得把旧角色 task 操作发送到新角色。
- 所有新增/修改文案使用 `src/shared/i18n/` 的中英文 key；不得向 `legacy.ts` 添加新功能文案。

### 3. 真实桌面运行证据

建立一个不依赖公网的本地验收 fixture（可由后端 Brief 239 提供），并在真实 Tauri 窗口完成：

- capability disabled：面板只读、创建按钮不可用、原因可见。
- enabled + adapter available：创建 allowlisted `read_page/navigate`，看到 queued/running/succeeded 和 bounded/truncated 结果摘要。
- 高风险操作：创建后稳定停在 `waiting_confirm`；当前会话确认后只运行原 task；快速连续点击只产生一次执行。
- 刷新设置页、关闭再打开窗口、重启应用：receipt 能恢复显示；没有安全请求引用时确认按钮保持禁用且原因明确，不能发起重放；若 Brief 239 提供 resume handle，则验证合法恢复和过期 handle 拒绝。
- 运行中 pause/cancel：状态最终分别为 paused/canceled；取消后不能变成 succeeded，且没有重复 task。
- 模拟 timeout、browser disconnect、redirect domain forbidden：分别显示失败/`outcome_unknown`/降级提示，不显示“完成”。
- remote_server、无 bot_user_id、无权限和后端不可达：只显示安全降级，不暴露内部请求或凭据。

## 测试要求

### 自动化

- `npm.cmd test -- --run`：全部测试通过；补充 Browser Runtime 组件/API 测试，至少覆盖 capability 四态、所有 task 状态、刷新后 waiting_confirm、重复点击、角色切换、错误映射和 artifact 脱敏。
- `npx.cmd tsc --noEmit`：通过。
- `npm.cmd run build`：通过；不得以关闭类型检查或跳过 Vite 构建规避失败。
- `cargo check`（修改 `src-tauri` 时）：通过；Tauri command 名称、请求字段和 scope 与后端 `/openapi.json` 一致。
- 对直接加载的 JS/CSS 或 page fragment：同步更新 `index.html` 的 `?v=` 和 `ADMIN_UI_FRAGMENT_VERSION`（若适用），并在测试中检查没有旧缓存资源。

### 真实浏览器验收记录

必须保存一份不含敏感值的证据记录，至少包括：

- 客户端 commit、后端 commit、OS、Tauri runtime、构建命令和 UTC 时间。
- 本地 fixture 地址的脱敏标识、allowlist 配置摘要、capability 快照摘要。
- 每个场景的 task_id 哈希/脱敏值、状态时间线、调用次数、最终 error_code/result_metadata。
- 真实 Tauri 窗口截图或等价录屏/日志，能看见 Browser Runtime 面板、按钮禁用/可用状态、状态变化和错误降级；截图不得含 URL query、凭据、绝对路径或页面敏感正文。
- 刷新、窗口重开和应用重启后的结果；若未实现 resume，明确记录“只能只读/取消，确认不可用”，不能记录为通过。

## 硬验收条件

以下任一项不满足，Brief 71 保持 `open/partial`：

1. `npm.cmd test -- --run`、`npx.cmd tsc --noEmit`、`npm.cmd run build` 均零失败；涉及 Tauri 时 `cargo check` 也零失败。
2. 真实 Tauri 窗口中完成上述 disabled、safe success、waiting_confirm、refresh/reopen、pause/cancel、timeout/disconnect/redirect、remote/no-user/no-auth 场景；不能用 Vitest、截图缺失的进程启动、模拟 WebGL 或纯后端调用替代。
3. 对高风险任务，后端记录的执行 fingerprint 与创建 fingerprint 相同；客户端无法通过刷新、重复点击或修改表单触发另一 URL/operation/params 的执行。
4. 刷新/重启后的 waiting_confirm 行为与后端契约一致：有合法 handle 才可恢复，没有 handle 就明确禁用确认并允许的仅是已授权的只读/取消；不得把“按钮存在”当作恢复通过。
5. 观测、错误提示、截图和客户端内存状态均不含 token、cookie、password、profile 路径、完整 query、页面正文、原始参数或宿主绝对路径。
6. `git diff --check` 通过，工作区只含本工单相关改动；提交一个独立 commit，commit message 标明 Brief 71。
7. 更新 `docs/runtime-acceptance-matrix.json` 和客户端 `docs/known-issues.md`/`docs/backend-integration.md`：只有真实证据齐全的 case 才能从 `not-run/partial` 改为 `passed`，其余保持 `partial/open`，不得为了绿灯删除 case。

## 明确不做

- 不在 WebView 直接 `fetch` 后端，不复制 bearer token，不绕过 auth gate。
- 不把本地绝对路径、完整 URL、页面内容或浏览器凭据存入 localStorage、持久化日志、埋点或 receipt。
- 不因为组件测试、TypeScript、Vite build 或 `cargo check` 通过，就声称真实桌面/真实浏览器验收通过。
- 不新增未由 Brief 239 冻结的 REST 字段，不通过客户端猜测后端私有 TaskRecord 结构。
