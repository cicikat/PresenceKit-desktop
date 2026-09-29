# PresenceKit-desktop — Claude 入口

完整协作约定、开发环境（Windows）、强制规则与文档入口见 AGENTS.md（唯一来源）：

@AGENTS.md

## 仅 Claude 适用

- **工作模式**：Claude Desktop 负责审计与写工单（`cc-tasks/`），Claude Code 负责执行与 commit。
- `config/client.local.json` 按 cwd → (debug) CARGO_MANIFEST_DIR → exe 目录 → app_config_dir 顺序探测。
