# 第一轮 F2：安全 Markdown

- [x] 助手正文使用 React Markdown + GFM；不执行 raw HTML，不自动加载 Markdown 图片，仅放行显式 HTTP(S) 外链。
- [x] 保留 hl/big/sm、叙事标签、普通分气泡、消息身份、贴纸、复制与语音展示；代码中的标签保持字面量。
- [x] 结构化块在 HTTP/WS/history 分段中保持完整；流中沿用安全纯文本，完成后完整解析。
- [x] 90 项聊天/协议回归通过；tsc 与 Vite build 通过。
- [x] 真实 ChatPanel 浏览器验证历史/发送/流转 canonical、无重复、注入/图片/URL 拦截和大字；截图在 .tmp/round1-markdown-desktop*.png。
- [x] 既有 chat-recovery-browser 通过。
- [ ] 真实 Windows 安装包/WebView2、真实后端与语音听感：not verified。

旧 chat-send-retry-browser 在“重试”文字按钮定位超时；当前 HEAD 已使用失败图标，该选择器也不在本次修改范围。
保留失败证据，不改弱断言；较新的 chat-recovery-browser 覆盖失败图标与显式重发并通过。

三面检查：纯客户端显示，不增加后端设置、授权或持久状态；后端原文与 REST/WS 字段不变。
Dream/Activity 使用独立既有组件，本次未改动；主聊天与语音文字展开共用新组件。
