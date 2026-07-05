# Brief 14 · 连接设置可视化 — 桌面端 Token 配置页

> 背景：安卓端有系统设置内的 Token 弹窗，桌面端却只能手改 `config/client.local.json`，
> 新用户/换钥匙体验差。后端 Brief 21/22 已落地（scoped tokens + `GET /auth/whoami`）。

## 1. 交付物

偏好面板新增「连接」页（与现有偏好页同级），三个字段 + 两个按钮：

- 字段：后端地址（backendBase）、WebSocket 地址（websocketBase）、Token（adminToken，
  密码型输入框，显示为掩码，可切换明视）。初始值来自 `load_public_client_config` —— 注意该
  command 目前**不返回 token**（`FrontendClientConfig` 刻意不含），保持这一点：编辑页初始
  显示「已配置（emt_…前8位）/ 未配置」状态而非明文回填；新增 Tauri command
  `get_token_status` 只返回 `{configured: bool, prefix: string}`。
- 按钮「测试连接」：新增 Tauri command `test_backend_auth` → GET `/auth/whoami`（带当前
  输入框里的值，而非已保存值）。成功显示「✓ 已认证：{label}（scopes: …}）」；401 →
  「token 无效」；403 不会出现（whoami 任意有效 token 可调）；连接失败 → 现有 SocketException
  同款文案。**输入框中的 token 不得进入日志**。
- 按钮「保存」：新增 Tauri command `save_client_config`，写回 JSON。写入目标 =
  `client_config.rs::local_config_candidates()` 顺序中**第一个已存在**的文件；都不存在则写
  app_config_dir 候选（建目录）。只覆盖 backendBase/websocketBase/adminToken 三键，
  保留文件中其他键（读→merge→原子写：先写 .tmp 再 rename）。
- 保存成功后提示：「已保存。HTTP 请求即时生效（每次调用重读配置）；WebSocket 需重连——
  [立即重连] 按钮」→ 调 ws_bridge 现有重连入口。

## 2. 约束

- token 明文不进前端持久状态（React state 短暂持有可以，不写 localStorage）。
- `client.example.json` 与 README 的手改说明保留，注明「也可在偏好 → 连接 页内配置」。
- Rust 侧新 command 补测试：merge 保留未知键；错误消息不含 token 值（沿用
  `assert!(!message.contains("Bearer"))` 模式）。

## 3. 验收

1. 空配置首启 → 连接页显示未配置 → 粘贴 token → 测试连接显示 label → 保存 → 聊天/历史即时可用，WS 重连后推送可用。
2. 故意填错 token → 测试连接报「token 无效」；改回正确值不留残留错误。
3. `client.local.json` 中手工加的自定义键在保存后仍在；`cargo test` / `flutter` 无关，前端 build 通过。
