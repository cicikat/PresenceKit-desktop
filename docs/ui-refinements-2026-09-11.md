# 聊天交互与配色预览修整

状态：实现完成，浏览器 IPC 夹具通过；真实 Tauri / 后端 / release 验收为 partial。

## 交付与依赖

- 导航与滚动可独立验收：一起做事使用 ChatWindow 主区域，移除活动专用 Ribbon，首页保留阅读、五子棋、国际象棋、梦种四张卡；左上返回主聊天，具体活动可返回活动首页。活动与群聊图标高亮，再点返回主聊天。
- 用户复核后统一返回控件：群列表、群对话、活动首页/具体活动共用 WorkspaceBackButton 和 workspace-toolbar；相同 SVG 箭头、32px 高度、圆角边框、字号与 hover/focus 样式。按钮显示“返回”，无障碍标签说明具体目的地；不再使用原生默认按钮或单独的 ‹ 字符。
- 主 ChatPanel 在活动和群聊期间隐藏但不卸载，保留草稿、历史、WS 和思考缓存。Design Mod 下临时显示标准壳，通过局部 context 暂停 portal，返回恢复已有 Mod，不重建业务 owner。
- 气泡透明度与思考可独立于主题预览验收：原 chatOpacity key 只作用于双方气泡底色，不再淡化整块 header/transcript/composer。隐藏原生 Ribbon 滚动条但保留滚轮、触控和键盘滚动，不占图标宽度。
- 思考入口在本机发送对应的首个 WS 回复/流开始时占位；transport msg_id 只用于占位，绝不拿它查询。收到 HTTP canonical turn_id 后沿原位置展开，无需重新点击。仅展开时读取；未归档结果每 2 秒自动重查，最多 30 次，关闭/卸载清理 timer、忽略旧结果。缺 canonical ID 最多等待 60 秒。移除“重新读取”按钮，错误可收起再展开重试。
- 配色预览共用 AppearancePreview：ChatColorPage 使用所选预设草稿 token，DreamColorTab 使用所选日/夜默认值与覆盖值，直接 CSS 绘制小型对话示例。颜色变化实时更新，不依赖图片生成或网络。
- 偏好第 4 类文案改为“测试”。梦境色彩页新增共用 ThemePicker；主题注册中心共用，Dream 自定义颜色优先；Layout/Design Mod 只属于聊天，不在梦境伪造布局入口。

## 三面检查

- 后端只读核对 admin/routers/chat.py 的 turn 关联、admin/routers/observability.py 的 memory.read 查询，以及 admin/static/pages/conversation-settings.html 的生成设置。仍使用现有 load_turn_reasoning → /chat/turns/{turn_id}/reasoning，不新增协议、scope、服务端落盘或观测状态；管理面生成设置与模型归档不变。
- 桌面沿用 chatOpacity、chat.reasoningVisible、theme 日夜槽与 dreamAppearance 覆盖 key。手机 lib/widgets/settings_widgets.dart 使用独立 Flutter 主题设置，不消费桌面的布局或 uiPreferences；手机思考展开仍为 roadmap，本次无 Android service / relay 改动。
- 原路径覆盖 HTTP 兜底、WS、流式、HTTP 先到，以及活动/群聊返回、Design Mod portal、草稿保留、昼夜预览和权限失败。HTTP/WS ack、去重、canonical 关联和 TTS 继续使用原实现。
- 本仓范围禁止修改后端仓，因此未写 Emerald-presence/docs/three-repo-interface-catalog.md。后端总账同步为 open：请按本文登记桌面展示 current、原生/真实后端联调 observe、手机入口 roadmap。

## 验证

- npm test：57 个文件、240 项通过。
- TypeScript 与 npm run build 通过；构建仍有既有 Live2D 大 chunk 提示。
- scripts/ui-refinements-browser.mjs：真实 Chromium + 模拟 Tauri IPC，通过活动/群聊切换、输入保留、短窗口滚动、canonical 延迟、归档暂空后自动刷新、气泡范围、Chat/Dream 配色预览与 Design Mod 往返。
- scripts/turn-reasoning-browser.mjs 保留原回复关联、权限错误、历史恢复、角色切换和本地显示开关回归，移除对成功记录“重新读取”按钮的旧假设。
- observe/open：未连接真实后端 token、真实模型流或原生窗口；历史缺 turn_id 的后端问题仍见 brief-244-reasoning.md；未声明 release 验收完成。
