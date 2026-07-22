# 设置与功能开关审计（P0–P2）

> 2026-07-13 实装后的事实清单。本文只描述当前可操作入口，不把“后端存在配置字段”写成“客户端已经支持”。

## 桌面设置（persona token 可用）

| 功能 | 入口 | 当前能力 |
|---|---|---|
| 后端地址 / WS / token | 设置 → 系统 | 修改本机 `config/client.local.json`；token 不回显 |
| 对话 mode / style / 多消息 | 设置 → 对话 | 即时写后端配置 |
| 模型路由 | 设置 → 系统 → 模型路由 | 只能在管理员预建的 routing profile 之间切换；不下发 API key 或 base URL |
| 角色 · 模型绑定 | 设置 → 系统 → 角色 · 模型绑定 | 按角色单独绑定 routing profile（不是裸 preset）；行内展示解析后的 `resolved_chat_preset`；清除即回到全局默认；旧后端无 Brief 87 API 时区块整体隐藏 |
| TTS 桌面语音条 | 设置 → 系统 → 桌面语音 | 独立开关；开启后助手消息显示可播放语音条，点击时才合成；可展开/收起文字 |
| Tool loop | 设置 → 系统 | 总开关、步数、总超时、允许类别、排除工具 |
| Thinking | 设置 → 系统 | 总开关、模式、主动消息、独白 token 上限 |
| 生成后段落兜底 | 设置 → 系统 | 默认关闭；热切换长篇单段回复的发送前空行兜底，当前阈值只读展示 |
| Garden | Sidebar → 花园 | 状态展示 + 浇水；收获/花瓶仅显示计数，尚无详情管理 |

## 管理面板（admin token）

- 模型路由支持从 legacy `llm` 一键初始化 `model_presets`，之后可维护 preset、密钥、URL、模型与 routing profile。
- 代理、上下文轮数、legacy LLM 参数和视觉模型不再是假只读镜像，保存后热重载。
- TTS 管理配置含服务端总开关、桌面语音条开关、情绪分档、服务 URL、参考音频/文本与语速；provider 的选择、参数和试听只在后端管理面处理。桌面端继续只调用 `/settings/tts-desktop` 和 `/tts/synthesize`，不读取 provider 配置或密钥；兼容层仍返回 `{audio_b64, mime}`。
- 系统状态页的 Feature switches 使用后端白名单，仅开放已有运行时消费者的布尔开关：视觉感知、支出、练习、行为痕迹、意图反射、MCP、文件只读访问、防坍缩、陪玩部署、玩具自主生长、自主联网搜索、表演映射。

## 有意保留的边界（不要误导后续 Agent）

- 桌面端不创建/编辑模型 preset，也不接触 API key；一次录入密钥和 URL 后，通过 routing profile 切换模型，无需重复编辑本机 config。
- 角色 · 模型绑定不做 profile 的编辑/新建（那是 config 层），界面只做绑定；绑定对象是整套 routing profile（category→preset 映射），不是裸 preset。
- `embedding` 没有可靠的单一 `enabled` 消费字段，是否启用仍由完整 provider 配置决定，因此未伪造无效开关。
- MCP server 列表现由后端管理面专用 MCP 页管理：可先测试 Streamable HTTP URL，再导入、启停和勾选工具白名单；HTTP headers 支持环境变量占位符且不回显字面 token。桌面端不代理这类 admin 配置或密钥。`fs_access.allow_roots`、支出额度/白名单等其他复杂或高风险字段仍应走专用管理界面或配置文件；通用功能开关 API 不接受这些字段。
- sensor 的本机采集参数需要 Rust 进程生命周期协调；本轮未把它伪装成热更新开关，改动仍需编辑本机配置并重启客户端。
- scheduler 的管理页同时提供运行状态、手动触发和配置表单；可调总开关、主要触发器、owner、提醒间隔、主动消息间隔与签名。
- relay 已有专用管理卡片；token 只打码回显，留空保存时保留原值。

## 降级路径

1. TTS：关闭“桌面语音条”只回退为文字消息，不影响后端总 TTS 配置。
2. Tool loop：关闭总开关，回退到单次普通回复；当前 preset 不支持 function calling 时 UI 会锁定并解释原因。
3. Thinking：关闭总开关；`auto` 在原生 reasoning 不可用时回退到前置独白。
4. 模型：切回管理员预建的稳定 routing profile；legacy 首次迁移可由管理员一键初始化，不要求桌面重新填写密钥。
4b. 角色 · 模型绑定：清除某角色的绑定即回落全局 `active_routing`；后端不支持 Brief 87 API（旧版本）时前端整段隐藏，不报错。
5. 生成后段落兜底：关闭开关后不再插入空行，直接显示后端清理后的模型原文；不会改写短期记忆。
6. 高级功能：管理面板逐项关闭对应白名单开关；不会连带清除已有配置。
