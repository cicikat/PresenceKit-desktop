# PresenceKit-desktop v0.1 发布范围

本页冻结 0.1.0 的功能边界。协议以 [protocol-v0.md](protocol-v0.md) 为准；未列入 IN 的增强默认进入 post-v0.1。

## IN：v0.1 已具备

- 主聊天窗口：HTTP 发送、WS 主动回复、流式/分段消息、群聊与历史按日只读加载。
- 独立桌宠窗口：粒子、3D、Live2D、鼠标互动与主窗口状态/说话转发。
- 花园只读状态、日记与聊天日志只读浏览。
- Dream、Toy、Activity 当前已实现形态，以及潜意识只读状态面板。
- Rust 嵌入式 sensor 采集与状态界面降级逻辑。
- 本地连接设置页和 Rust 原生 Bearer WebSocket bridge。
- v0.1 协议冻结的 9 类 desktop action。

## OUT：post-v0.1

- **TTS 语音播放**：当前文字对话和语音输入可用，但客户端没有合成音频播放端。
- **v1 WS 协议**：当前正式使用 v0.1 legacy 消息；`assistant_message`、`state_update`、`user_message`、`client_event`、envelope 与 capabilities 均不在本版。
- **用户输入 WS 化**：当前 `POST /desktop/chat` 就是正式发送路径，并有 HTTP/WS 双路径对账。
- **花园交互**：当前可查看槽位、阶段和计数；浇水、harvest、vase 操作不在本版。
- **日记 emotion 增强**：当前日记列表和正文可读；后端未产出 emotion 时显示为空。
- **flow/status 完整化**：当前已有状态轮询和现有面板；更完整的后端状态流不在本版。
- **完整具象 Pet 行为体系**：当前粒子/3D/Live2D 与鼠标行为集即 v0.1 形态。