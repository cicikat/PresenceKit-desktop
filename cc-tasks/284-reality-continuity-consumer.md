# Reality 连续性消费（后端284）

活动对话继续通过专用窗口与 Tauri HTTP，新增可选 request_id 贯穿 Rust，并返回 canonical turn/msg/source 引用。后端不将活动回复全局推送到主聊天。无情绪信号沿现有自然视觉基线，不回写。

- [x] 活动请求ID与响应类型、Rust透传。
- [x] 定向契约测试、TypeScript/Vite与Rust检查；独立提交。
- [ ] 真实3D/Pet/Live2D/视频及棋局恢复验收（not-run）。

验证：34项活动API契约测试通过；TypeScript/Vite build 与 cargo check 通过。真实Windows界面、视频与模型仍not-run。
