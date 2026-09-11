# 244：桌面内心活动旁白 — 本仓验收回执

来源：`../Emerald-presence/cc-tasks/244-frontend-reasoning-handoff.md`。
2026-09-11 用户追加：只改本仓、每回复一个旁白入口、角色与对话显示开关、隐藏技术字段。
状态：**partial**；本仓 UI 已完成，真实历史接口修复和 Tauri/release 验收 **open**。

- [x] 保存 HTTP canonical turn_id，按每次完整回复提供一个居中浅底“展开思考”入口。
- [x] 动态“角色名的内心活动：”及全部思考正文，不展示模型/调用/来源/协议字段。
- [x] 角色与对话 → 显示思考入口，默认 true，本地持久化并实时生效。
- [x] 懒加载、按回合缓存、错误/空记录重试、角色切换和卸载忽略迟到结果。
- [x] 非流式、流式、HTTP/WS 顺序、原正文去重与历史显式 ID 回归。
- [x] i18n、架构、前端结构、接口/协议、设置审计、已知问题同步。
- [x] 242 项 Vitest、生产构建、真实浏览器 IPC 夹具验证。
- [ ] **open**：当前后端历史解析器没有返回日志中已有的 turn_id，重启真实历史仍无入口。
  用户要求后端另单；施工要求见 `cc-tasks/244-history-turn-id-backend-handoff.md`。
- [ ] **open**：真实后端与 Tauri/release 联调。
- [ ] **roadmap**：手机 UI 与真机验收、WS-only 和其他未关联来源。
- [ ] **open**：后端三仓总账同步（留其仓处理）。

完整实现与验收边界见 `docs/brief-244-reasoning.md`。
