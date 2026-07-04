# Brief 13 · 鉴权分层 — Scoped Tokens（客户端侧）

> 配对文档：`Emerald-presence/cc-tasks/21-鉴权分层-scoped-tokens.md`（后端侧，**scope/profile 定义
> 以其 §2 为准**）。后端 P1/P2 落地后 legacy token 仍全通，本文档改动可延后；但后端 P4（发 token、
> 轮换 legacy secret）之前必须完成本文。

## 0. 背景

当前三个持有后端 god token 的本仓组件：

1. Tauri 桌面客户端：`src-tauri/src/client_config.rs` → `admin_token`（env `EMERALD_ADMIN_TOKEN`
   或 client 配置文件），HTTP 经 `lib.rs` 各 command 的 `bearer_auth`，WS 经 `ws_bridge.rs`。
2. 手机 sensor-service：`sensor-service/config.yaml` → `backend.token`（明文注释还写着
   「与 admin_token 一致」）。
3. （仓外但相关）ESP32 固件、Watch、手机轮询端。

后端改造后每类持有者应换成各自的最小 scope token（profile：`desktop` / `sensor` / `watch` /
`device` / `mobile`），由后端 `POST /auth/tokens` 签发。

## 1. 改动点

### 1.1 桌面客户端 token（几乎零改动）

- `client_config.rs` 的 `admin_token` 字段名**不改**（避免动配置兼容层），但注释与
  `DEFAULT_ADMIN_TOKEN_PLACEHOLDER` 周边说明更新为：「填 desktop profile token（`emt_…`），
  legacy admin secret 仍兼容」。
- env var `EMERALD_ADMIN_TOKEN` 语义同上，不改名。

### 1.2 401 / 403 区分（本文核心改动）

后端新语义：401 = token 无效；**403 = token 有效但 scope 不足**。现有错误文案
（`lib.rs` ~L53「认证失败，请检查本地 token 配置」）会把 403 误报成 token 配错。

- `lib.rs` 统一请求错误处理处：403 时改报
  「token 权限不足（缺少 scope，检查该 token 的 profile 是否为 desktop）：{detail}」，
  透传后端 detail（其中含所需 scope，可展示）。
- `ws_bridge.rs`：WS 升级被拒（1008）时区分不了 401/403，文案改为中性的
  「WebSocket 认证被拒：token 无效或缺少 ws.desktop scope」。
- 保持既有约束：错误信息**不得包含 token 值**（现有测试 `assert!(!message.contains("Bearer"))`
  的模式，为 403 分支补同款断言）。
- 429（后端失败限速）：报「认证失败次数过多，来源 IP 已被临时限制，稍后重试」。

### 1.3 sensor-service

- `sensor-service/config.yaml` 注释改为：「填 sensor profile token（仅 sensor.write 权限），
  不要复用桌面/admin token」。
- `sensor-service/main.py` 对 403 的处理同 §1.2 语义（如现在只认非 200 统一报错，至少把 401/403
  区分打进日志，便于排查 token 发错 profile）。

### 1.4 文档

- `ARCHITECTURE.md` 系统边界图下补一段：三类 token（desktop / sensor / 设备侧），指向后端
  `docs/security.md`。
- 若有 README 部署步骤提到「复制 admin secret」，改为「用管理面板 token API 签发对应 profile token」。

## 2. 验收

1. 用后端签发的 `desktop` profile token 替换本机配置，完整冒烟：聊天、历史加载、花园面板、
   日记、chat-log、mood/activity、dream overlay 全流程、活动（reading/gomoku/chess/dream_seed）、
   群聊、ToyWindow（hardware devices + meta-mode 切换）、偏好「世界」页 prompt-assets 读写、
   头像、上传、转写、桌面 sensor 实时快照推送（`POST /sensor/realtime|activity`）、
   WS 推送（channel_message / action / dream_invite）。任何 403 = 后端 §5
   映射表或 desktop profile 缺 scope，回报后端仓修表，**不得**在客户端换 admin token 绕过。
2. sensor-service 用 `sensor` profile token 正常推送；故意用它 GET `/sensor/realtime` 得 403
   且日志文案正确。
3. `cargo test`（lib.rs / ws_bridge.rs 既有 auth 测试 + 新增 403 分支断言）全绿。
