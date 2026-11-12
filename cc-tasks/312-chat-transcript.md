# 312 聊天刷新与主界面文案

- [x] 刷新后显示真实历史，后台恢复回复，聊天中不显示请求编号、状态或查询按钮。`scripts/chat-recovery-browser.mjs` 覆盖重载、无正文回执补读、WS 去重和确认未执行时的重试入口。
- [x] 桌面与移动端的 AGENTS.md 写入用户界面准则。两仓的 CLAUDE.md 已引用 AGENTS.md。
- [x] 前端构建、637 项 Vitest 和聊天恢复浏览器回归通过。`scripts/tool-activity-browser.mjs` 验证原有工具活动和开关。
- [ ] 原生 Windows 窗口刷新及真实断线重连验收。当前证据为模拟 Tauri/WS 的浏览器测试，原生验收仍 open。

无跨端运行影响。桌面复用既有聊天日志和回执合同，移动端本次更新 AGENTS.md。
