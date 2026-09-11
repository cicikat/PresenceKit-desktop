# 视频通话、模型与聊天修复（2026-09-11）

状态：partial，逐项实现与验证记录如下；真实 Tauri 窗口和跨端联调仍为 open。

## 3. 群聊隔离

普通聊天和视频通话使用 shared/api/realityMessageScope 过滤 round_id、非 reality
source/domain 和非当前角色。WS 保留既有 source 字段；增量/结束只更新已接受的 msg_id。
群聊订阅不变，传输层 ack 不变，不删除历史或用户数据。
验证：纯函数回归覆盖 legacy、当前角色、群聊当前/其他角色、梦境、角色切换。

## 5. 思考正文宽度

移除正文 640px 上限，保留换行与容器内边距，正文随聊天内容区伸缩。
验证：CSS 检查；最大化窗口视觉验收 open。

## 4. 加载占位

stream_start 不再提前撤下加载气泡；首个可见段落到达时才交接给正文。
空临时流不渲染空壳；HTTP 错误/最终回复/fallback 沿用原有收尾。
验证：TypeScript；慢首 token、空流失败和断流 fallback 的真实窗口验收 open。

## 6. 窄栏输入

使用 ChatPanel 实际容器宽度切换紧凑输入布局：文本占整行，工具按钮横排到下一行；
按钮不挤压文本，输入框保留水平书写、隐藏滚动条（仍可键盘/滚轮滚动长内容）。
验证：TypeScript，宽窄容器浏览器检查待记录；真实 Tauri DPI 验收 open。

## 三面闭环检查记录

## 7. 一起做事偏好

偏好滚动区 grid 改为 align-content:start，避免少量设置撑满窗口形成巨大行距；
陪玩与活动外观统一 18px 间距，活动下拉采用紧凑宽度。设置值、权限和 API 未改动。
验证：CSS 检查；浏览器/真实窗口验收待记录。

## 三面闭环检查记录

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
