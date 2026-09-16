# UI preference 持久化边界

`src/shared/uiPreferences.ts` 管理偏好；Tauri `ui_prefs.rs` 文件为原生持久层，
localStorage 是跨 WebView 镜像和浏览器 fallback。镜像同步不赋予业务权威性。

| 分类 | 可保存内容 | 不得推导 |
| --- | --- | --- |
| 外观 | 字体、主题、透明度、显示开关 | 后端生成策略、角色情绪真值 |
| 布局 | 布局/Mod 选择、侧栏宽度及显隐 | 业务会话或 domain |
| 本机交互 | 桌宠互动、本机语音播放、用户选择的窗口偏好 | 服务端权限与 effective state |
| 显示镜像（兼容） | character.active 的名字、头像 revision 与既有 ID 镜像 | 授权、请求归属、角色切换完成 |

禁止新增 realm、char/session identity、tool authority、backend lifecycle 的权威值到偏好 store。
本机 consent 也只是后端能力与原生权限闸门之一，不能覆盖服务端禁用。

当前兼容例外：`activeCharacter.ts` 的 `character.active.id` 仍被 Chat/Room 等消息过滤使用。
这是待迁移事实，不能靠改名或删除 key 宣称解决。现有用户数据保留。
用户确认桌面本机会话固定角色，其他设备切换不影响它；其真正实现需要发送/历史/响应和
主动消息都有明确角色作用域。详见 9.17 工单及跨仓交接，未上线前不改变既有回包过滤语义。

新增 key 时在所属模块注明分类、默认值、读写者和跨窗口行为。当前没有统一强制 key registry，
本文件是审查边界，不声称运行时已经拦截任意字符串 key。
