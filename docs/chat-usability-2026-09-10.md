# 桌面交互问题施工与验收

七项交付：长回复等待；聊天透明度；首次打开活动/视频；附件暂存与粘贴；双向引用；情绪装饰开关；桌宠启动。
透明度、情绪装饰与原生桌宠可独立施工；附件与引用共用 composer，顺序集成。

## 实现

- 聊天/上传使用 600 秒总超时、15 秒连接超时及 no_proxy；普通请求维持 15 秒，其他 LLM 请求维持 120 秒。上传原误用 15 秒预算。
- 活动/视频/玩耍独立 Suspense，避免懒加载影响主窗口和鉴权门禁。
- 桌宠 ensure/destroy 改 async，避免 WebView2 调用线程创建窗口死锁；保留单实例锁及重试。
- 界面偏好新增整体聊天不透明度（叠加 Mod）、情绪竖线和标签独立开关，默认保持原样。
- 图片/文件选择、拖放、粘贴先暂存，缩略图卡片支持删除；发送时与文字合并。多图最多 10 张，文档单个，禁止混发；图片 10MB、文档 5MB。
- 用户/角色消息均可引用；发送的消息上方保留引用卡片。

## 三面检查与边界

后端 admin/routers/chat.py 的 upload_ingest 已接受 files + message + channel，图片识别管理面与 api-calls 观测仍属后端。
手机 BackendClient 文本/上传为 120 秒；本单不修改手机设置、后台服务或 relay。
上传仅扩展本地 IPC 输入为文件路径或内存 base64，继续经 no_proxy + Bearer 到原端点；不新增服务端队列、trace 或配置。
后端上传不支持结构化 reply_to，附件引用作为明确附言传递；文本继续原 reply_to text/ts。
历史 ChatLogEntry 未提供引用字段，重新加载后的引用恢复为 open，需要后端日志契约支持，不能靠时间猜测。
跨仓总账同步 open：遵守不修改 Emerald-presence 的仓库边界，待后端仓维护者同步本单。

## 验收

partial：TypeScript 与 cargo check 通过（中间验证）。真实慢 OCR/工具、原生窗口与剪贴板、Mod 视觉和手机联调待验收。

引用验收：浏览器挂载实际 React，右键用户消息、点击回复、提交文字、检查发送后引用卡片通过。历史重载恢复仍 open。

## 最终验证记录

- npm test：54 个文件、222 项全部通过。
- npm run build（含 TypeScript）：通过；保留既有大 chunk 提示。
- cargo check：通过；Rust 附件内存来源/解码/类型/冲突输入回归测试 1 项通过。
- 浏览器真实挂载 React、模拟 Tauri IPC：首次进入活动与视频、返回聊天、右键自身引用、发送后引用卡片、粘贴/选择图片暂存、删除、多图与附言单次上传、失败保留附件与文字、情绪开关和不透明度通过，pageerror 为 0。
- 复验脚本 scripts/chat-usability-browser.mjs；先启动 npm run dev，需要已安装 Playwright（可通过 PLAYWRIGHT_PACKAGE_JSON 指定）。生成的本地截图位于 .tmp/。
- partial/open：未用真实后端验证慢 OCR/工具超时；未验证真实系统剪贴板、文件选择器、原生桌宠开关、多屏位置和所有自绘 Mod；浏览器 IPC 夹具不等于原生窗口验收。手机未修改、未设备联调。
