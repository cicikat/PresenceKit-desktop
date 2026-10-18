# 远程后端连接红点修复（2026-10-18）

状态：实现与自动化验证完成，真实云端验收 partial。范围只限桌面连接；保留工作区已有陪玩改动。

## 证据与验收边界

- Ribbon 状态来自 wsClient 的 hello_ack，不是本机 HTTP 健康检查。
- 当前私有配置的 HTTP/WS 已为同源 HTTPS/WSS；不记录服务器地址或凭据。
- tokio-tungstenite 0.26 默认仅 connect/handshake，无 TLS feature，WSS 会失败。
- 首启表单只编辑 backendBase；旧加载/保存不联动 websocketBase，是相邻缺陷。

## 施工清单

- [x] 查 Ribbon → WSClient → native_ws_connect → 配置与服务端 hello/认证链。
- [x] 查三面：管理端沿用 ws.desktop/Bearer 与既有连接观测；手机使用 HTTP poll/relay，不连接桌面 WS；无新权限、业务状态、队列或协议字段。
- [x] 启用原生 WSS（系统证书校验），保留本机 WS；补真实 socket/TLS 发起回归。
- [x] 未配置/空值/遗留默认 WS 随 HTTP 推导；首启和设置页联动，保留自定义独立 WS 地址。
- [x] 保存连接配置后自动重连；状态点仍等 hello_ack 后才消失；更新语义中英文提示。
- [x] 同步连接说明、架构、已知问题与跨仓总账。
- [x] 运行定向回归、前端构建、Rust 检查；检查换行与 scoped diff，独立提交。
- [ ] observe：真实 Windows Tauri 连接云端、hello_ack/心跳、主动消息与反代升级；未执行不得标完整验收。

依赖：配置推导先于表单联动；WSS 与表单可独立实现，最后统一验证。

## 验证结果

- npm test：105 文件、582 项通过；包含地址映射、HTTPS/端口/IPv6/路径前缀、输入清空与自定义地址回归。
- npm run build（tsc + Vite）：通过；仅既有大 chunk 提示。
- cargo test --offline --lib ws_bridge::tests：7 项通过，含真实 TCP 上默认连接器发起 TLS ClientHello、明文 WS Bearer/hello_ack/ping/pong。
- cargo test --offline --lib client_config::save_config_tests：11 项通过，含派生地址、保留自定义地址与原 token/未知键保留回归。
- cargo check --offline：通过。
- 服务端只读 GET /observability/deployment-capabilities 返回 404，当前部署不能用该端点核验连接状态；未新建生产 WS 会话，不把 TLS 发起测试等同云端证书/Upgrade/持续推送验收。
- native-tls 属于 Rust 编译产物，需要运行重新编译的桌面程序；仅刷新网页不能更新已安装版本的原生 WS 库。
- 三面检查：管理端现有 settings/clients、deployment-capabilities 观测职责不变；手机 ConnectionController/BackendClient 使用 HTTP 与既有后台 poll/relay，无消费桌面 WS；无跨端行为影响。
