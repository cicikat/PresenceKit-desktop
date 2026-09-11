# 244：桌面按消息展开模型返回思考 — 本仓验收回执

来源：`../Emerald-presence/cc-tasks/244-frontend-reasoning-handoff.md`。
状态：**partial**（本仓实现完成；真实后端/Tauri/release 验收 **open**）。

- [x] 保存 HTTP canonical turn_id，默认收起的只读面板。
- [x] 懒加载、多次调用、模型/来源/文本、中断状态、失败和空记录可重读。
- [x] 401/403/404/503 降级，沿用 desktop Bearer 和 memory.read。
- [x] 按回合缓存，角色/会话卸载清理并忽略迟到响应。
- [x] 非流式、流式、HTTP/WS 顺序、旧消息与原正文去重回归。
- [x] i18n、架构、前端结构、接口/协议、设置审计、已知问题同步。
- [x] 238 项 Vitest、生产构建、cargo check、真实浏览器页面 IPC 夹具验收。
- [ ] 真实后端与 Tauri/release 联调（open）。
- [ ] 手机端实现与真机验收（roadmap，非本仓范围）。
- [ ] 后端三仓总账同步（open，本单限定本仓，待后端仓同步）。

WS-only 无 canonical ID 的消息不猜测关联；QQ/主动/Dream/Stage 保留 roadmap。
完整证据和重现步骤见 `docs/brief-244-reasoning.md`。
