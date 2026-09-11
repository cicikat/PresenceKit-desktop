# 视频通话、模型与聊天修复（2026-09-11）

状态：partial，逐项实现与验证记录如下；真实 Tauri 窗口和跨端联调仍为 open。

## 3. 群聊隔离

普通聊天和视频通话使用 shared/api/realityMessageScope 过滤 round_id、非 reality
source/domain 和非当前角色。WS 保留既有 source 字段；增量/结束只更新已接受的 msg_id。
群聊订阅不变，传输层 ack 不变，不删除历史或用户数据。
验证：纯函数回归覆盖 legacy、当前角色、群聊当前/其他角色、梦境、角色切换。

## 三面闭环

- 后端 channels/desktop_ws.py 的 stream_start 已包含 source 和可选 char_id/round_id/domain，
  delta/end 仅靠 msg_id 关联；本次修复客户端消费，不新增协议或后端配置。
- 管理面权限、默认值、effective state、队列、trace、审计、TTL 沿用既有链路。
  模型目录和外观都是桌面本地偏好，不映射成后端总开关。
- 手机已有独立群聊入口；本次不修改 Flutter、Android 或 relay。
  手机群聊与单聊并行、后台中继隔离的真机验收为 open。
- 后端总账同步为 open：遵循本任务不修改 Emerald-presence 的仓库边界，
  由后端后续将本节同步到 docs/three-repo-interface-catalog.md。
- 桌面需实测普通聊天/群聊/梦境/视频通话切换、慢首 token、HTTP fallback、模型渲染，
  静态测试不代表以上真实窗口验收完成。
