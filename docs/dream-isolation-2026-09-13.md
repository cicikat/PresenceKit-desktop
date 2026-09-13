# 手机梦境广播 UI 隔离（2026-09-13，partial）

## 原因与实现

手机 BackendClient.sendDreamChat 使用 POST /dream/chat；后端 dream router 在独立
dream_turn 后播放 pseudo_stream_push(profile=dream)，HTTP 返回 canonical reply。
旧动画 start 只有 char_id，desktop_ws 又默认 source=reality。原 ChatPanel scope
允许当前角色，导致 delta 创建现实临时气泡，且没有现实 canonical/历史记录与之对账。

新增 isSingleRealityStream，只对流式 start 收紧：角色动画必须有显式 reality domain。
普通 owner 无 char_id 流、明确 reality domain 流仍可接收；群聊/梦境/其他角色拒绝。
delta/end 原本就只查已注册 msg_id，因此拒绝 start 同时阻止正文、加载态和通知副作用。
canonical 现实消息与 HTTP fallback、历史、去重保持原路径，不按本机 Dream 开关推断归属。

## 三面检查

- 后端：只读核对 admin/routers/dream.py、channels/ui_push.py、desktop_ws.py 与 chat.py。
  属于显示隔离缺陷，不新增配置、落盘、trace、队列或观测端点；管理面的 Dream 设置不变。
- 桌面/手机：手机 controllers/dream_controller.dart 与 services/backend_client.dart
  消费独立 HTTP Dream 回复；桌面 useDreamChat 不变。本机 UI 隔离不需新权限开关。
- 相邻路径：现实 owner stream 不带 char_id；群聊有 round_id；活动旧动画也被现实拒绝。
  WS 仍由原唯一连接分发，scope/token、ack、TTL、锁、relay、canonical 去重及 fallback 不变。

## 验证

- realityMessageScope.test.ts：6 项通过，覆盖旧 Dream source=reality、owner、群聊、
  显式 domain、过期角色及 canonical 兼容。
- node scripts/dream-isolation-browser.mjs：实际 React + WS dispatcher，Tauri IPC 为夹具。
  旧手机 Dream、显式 Dream、群聊不创建现实正文/加载态；正常现实流与 canonical 只显示一次。
- npm run build（含 TypeScript）通过，保留既有大 chunk 提示。

## Open

真实手机与 Tauri 窗口联合验收尚未完成。旧后端对无角色 ID 的动画无法与 owner stream
区分；跨设备同时 Dream/活动请求也缺 request 归属，需要后端另单补显式域和请求关联。
本单限客户端，不改后端/手机仓；后端 docs/three-repo-interface-catalog.md 同步待后端仓处理。
