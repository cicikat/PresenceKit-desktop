# Brief 72：浏览器任务客户端死代码清理与迁移契约收口

> 状态：`complete`
> 优先级：`high`
> 范围：`Emerald-client`
> 前置：Brief 70、71；浏览器任务配置和提交入口已迁至后端 admin 面板
> 推荐模型：GPT-5.6-terra；若发现 Rust bridge/API 契约冲突，升级为 GPT-5.5 复核

## 背景

桌面端偏好页已经移除浏览器任务表单，但仓内仍可能存在旧的 shared API、i18n 文案、验收记录或 bridge 代码。它们只有在有真实兼容调用者时才能保留；否则会让后续维护者误以为客户端仍拥有浏览器执行环境或需要 `botUserId`。

## 任务

1. 搜索 `src/`、`src-tauri/`、`tests/`、`docs/` 中的 `agent-runtime-browser`、`BrowserRuntime`、`botUserId`、旧 `/agent-runtime-browser/*` 路径引用，建立“引用者—用途—是否仍需”的清单。
2. 对 `src/shared/api/agent-runtime.ts` 及其测试逐项决策：
   - 无调用者：删除浏览器专用函数、类型、测试和仅服务它的 i18n 文案；
   - 仍被旧后端兼容路径使用：只保留最小只读/受保护 bridge，补注释、版本边界和调用测试；禁止恢复表单或让 WebView 直接 fetch。
3. 更新 `docs/frontend-structure.md`、`docs/brief-71-acceptance-record.md`、`docs/runtime-acceptance-matrix.json` 及相关已知问题：明确客户端不配置 allowlist、不提交新浏览器任务、不接触凭据/profile/本地文件；未有真实 Tauri 证据的场景继续保持 `partial/open`。
4. 检查角色切换、刷新、重启后的旧状态清理；客户端不得根据旧内存请求拼出新的 URL/operation/params，也不得把暂停中的发布任务自动恢复或确认。
5. 若修改直接加载的 JS/CSS 或页面 fragment，按仓规更新 `?v=` 和 fragment 版本；本工单不为了“清理”改动无关 UI。

## 硬验收

以下任一项不满足即不通过：

1. `rg` 清单中所有保留引用都有调用者和兼容理由；删除后 `rg` 不再发现未预期的旧表单、`botUserId` 输入或直接 HTTP 调用。
2. `npm.cmd test -- --run`、`npx.cmd tsc --noEmit`、`npm.cmd run build` 全部零失败；若改动 `src-tauri`，`cargo check` 也必须零失败。
3. 保留的客户端路径只能消费后端脱敏 metadata，并通过现有 auth gate/Tauri bridge；测试证明 401/403/404/409/422、网络断开、未知状态均 fail-closed，不自动创建或运行任务。
4. 用真实桌面窗口硬刷新/重启检查：设置页不出现浏览器任务创建表单；后端 admin 页面仍可独立显示 worker、allowlist 和任务 receipt；客户端不显示 token、cookie、profile 路径、完整 URL/query、页面正文或原始 params。
5. 不执行真实发布动作；`waiting_confirm` 仍需要人工确认，刷新/重启后没有合法 handle 时确认按钮必须禁用。
6. `git diff --check` 通过；`git status --short` 只包含本工单相关文件；提交一个独立 commit，message 必须包含 `Brief 72`。

## 交付物

- 引用/保留/删除矩阵；
- 清理后的代码、测试、文档和版本号变更；
- 自动化结果与真实桌面硬刷新证据（脱敏）；
- 独立 commit。

## 不做

- 不把浏览器控制重新放回客户端偏好页；
- 不新增凭据输入、浏览器 profile 选择或本地文件浏览器；
- 不修改用户记忆文件，不自动确认或执行发布任务。

## 2026-09-06 交付记录

### 引用 / 保留 / 删除矩阵

| 原引用 | 审计结果 | 决策与理由 |
|---|---|---|
| `src/shared/api/agent-runtime.ts` 与其测试 | 仅被自身测试引用，无 React 调用者 | 删除全部浏览器 API、类型和测试 |
| `settings.agentRuntime.*` 两语种文案 | 仅服务已删除的设置页面 | 删除 |
| Browser Runtime Tauri commands 与 `/agent-runtime-browser/*` 路径 | 无 `invoke` 调用者；后端三仓总账标为 OpenAPI-deprecated compatibility，待已发布客户端迁移后删除 | 删除 commands、注册和直接 HTTP bridge |
| `bot_user_id` 与 `load_history` | 只服务已删除 bridge；`loadHistory()` 本身没有调用者 | 删除配置字段、Rust command 和 shared API |
| Brief 71 验收记录 / runtime matrix / known issues | 历史证据仍需保留 | 更新为历史 `partial/open`，明确不构成恢复桌面表面的理由 |
| 后端 admin 的 worker、allowlist、receipt | 后端独立控制面，客户端无契约 | 保留在后端；本仓不修改后端仓 |

### 验证

- `npm.cmd test -- --run`：52 files / 216 tests passed。
- `npx.cmd tsc --noEmit`、`npm.cmd run build`、`cargo check`：均通过；build 仅有既有 chunk-size warning。
- `git diff --check` 通过；退役守卫 `tests/client-surface-retirement.test.ts` 扫描 `src/` 和 `src-tauri/src/`，阻止 browser bridge、task endpoint、`bot_user_id` 和旧 i18n 表面回流。
- `rg` 回查确认实际源代码没有 Browser Runtime 表单、`invoke` 调用、旧任务路径或 `bot_user_id`；保留命中仅为本工单、历史验收说明与退役守卫测试。
- 本机 `8080` admin static index 与 browser fragment 返回 200；fragment 包含 worker、allowlist 和 task receipt UI。无凭据读取 `/settings/agent-runtime-browser*` 返回 401，未发送任何任务请求。

### 真实窗口证据

以 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` 启动真实 Tauri
窗口后，CDP 连接其唯一 `http://localhost:1420/` WebView，点击 `偏好`，再执行一次
`page.reload()` 并重新点击 `偏好`。刷新前后均断言：偏好按钮计数为 1；`浏览器实验任务`、
`提交一次受控实验`、`提交任务` 和旧 HTTP(S) URL 输入的计数均为 0。该检查只读取固定旧表单
锚点，不读取聊天正文、凭据或后端数据；未执行发布、确认、暂停、取消或创建操作。
