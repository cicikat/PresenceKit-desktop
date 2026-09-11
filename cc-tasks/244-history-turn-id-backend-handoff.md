# 244 后端交接：历史回复返回 canonical turn_id

状态：**open**。2026-09-11 用户明确要求“只改本仓，历史接口修复留给后端工单”。
本文件只在桌面仓记录施工要求，未修改后端代码或数据。

## 问题与证据

桌面重启会重新读取 `GET /chat-log/{date}`。后端
`admin/routers/chat_log.py::_parse_day` 遇到 `> ` 元数据行时只改变解析状态并跳过，
最终仅返回 `time/user/assistant`，因此日志里即使已经有 canonical `turn_id`，前端也收不到。
`core/memory/event_log.py::append` 已在 assistant 元数据写入 `turn_id`。
这不是前端忘记读取缓存；当前内存里的 HTTP 回合关联在重启后没有可靠的历史来源。

## 最小后端施工范围

- 保留历史日期、角色桶、owner 与 `memory.read` 现有语义；不新增端点或管理员权限。
- 解析每条 assistant 回复对应的可信元数据 `turn_id`，在其历史条目中返回可选 `turn_id`。
  不从正文伪造的字段、时间、内容相似度、最近归档或 WS 传输 ID 推断。
  user 元数据不能覆盖 assistant 的 canonical ID；不同回合不得混淆。
- 未带 ID 的老条目继续缺字段或返回 null；不能迁移时编造 ID，也不回写历史文件。
- 保留 `time/user/assistant` 正文与顺序，兼容多段回复、不同角色名、中英文冒号和已有格式。
- 确认 assistant 元数据 ID 确实与 owner HTTP 成功响应、思考归档关联 ID 一致；若写入链不一致，
  在后端修复真实关联，不能靠前端近似匹配补洞。

目标响应片段：

```json
{
  "date": "2026-09-11",
  "entries": [{
    "time": "16:00",
    "user": "示例问题",
    "assistant": "第一段\n第二段",
    "turn_id": "canonical-example"
  }],
  "raw_fallback": false
}
```

## 验收

- [ ] 后端解析回归：多个同分钟回合、多段正文、缺 ID、不同 user/assistant ID、正文中伪造字段。
- [ ] 原历史正文、日期加载、角色隔离和 scope 回归不变。
- [ ] 真实对话成功后重启桌面，历史回复前出现一个“展开思考”，点击读取该回合归档。
- [ ] 旧无关联日志不出现推测入口；无思考归档时显示空态并可重试。
- [ ] 同步后端三仓接口总账的历史字段与当前桌面 UI 状态。

桌面侧已具备 `ChatLogEntry.turn_id` → assistant `turnId` → 每回合一个旁白入口，
浏览器夹具覆盖带显式 ID 的历史加载/重启和设置持久化。前端不本地复刻日志解析器，不按
时间/文本持久化映射，不增加思考正文副本。真实历史恢复需待本单后端交付与联调。
