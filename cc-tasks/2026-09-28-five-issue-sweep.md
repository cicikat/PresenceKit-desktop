# 2026-09-28 五项问题清扫（梦境人称 / 屏幕提示词 / 来电窗口 / 工具暴露 / 图像路由）

来源：用户在另一窗口提出的 5 个问题。上一轮会话中断，本单接续。
跨仓：问题 1、2、4、5 主体在 `Emerald-presence`；问题 3 在本仓。

## 进度总览

- [x] 1-A 梦境信封人称错误 — 已修并 commit（`9b3c337`）
- [x] 1-B 梦境出站能否单独直连（绕代理）— 调查完成：机制本就存在，仅补文档（`9b3c337`）
- [x] 2 屏幕观察注入提示词过简、重复、太工程 — 已修并 commit（`38d61aa`）
- [x] 3 主动视频来电窗口超时后卡死 — 已修并 commit（本仓 `c25af75`）；真实窗口复验仍 open
- [x] 4 工具暴露问题（read_hds_heart_rate / 自建系统 / 写文档下载）— 已修并 commit（`2a299e1`）
- [x] 5 本地图像模型路由只覆盖视频通话 — 已修并 commit（`eadf63e`）

五项代码与文档改动全部落地并各自独立提交，工单关闭。

**未完成的验收（open，需实机）**：全程未跑 pytest（用户要求不跑测试，含跨仓），
静态检查（`ast.parse`、`node --check`）通过。剩余实机项：
- 问题 3：真实 Windows Tauri 来电窗口的超时 / 拒绝 / 接通三条路径复验。
- 问题 5：真实本地图像模型在 `chat_upload` 用途下的联通与 422 message 可读性。
- 问题 2 / 4：放宽 caption 上限与 discovery 工具名列举后的实际观察效果（是否真的开始被调用），
  看 `GET /watch/hds-local` 的 `character_reads` 与工具审计命中数即可判断。

---

## 1-A 梦境信封人称错误（done，`9b3c337`）

现象：梦境信封由模型以「用户第一视角」写出，变成用户给角色写信。

根因两条叠加（`core/dream/postcard.py:161-164`）：
1. 系统提示只有模板文案 + 「只输出信正文」，模板本身只说「第一人称」而不说是谁的第一人称
   （`bundled/templates/dream_postcards/*.md` 五个模板全是「写一段日记撕页：第一人称…」这类）；
   缺省文案 `_template_text()` 的 fallback 虽写了「以角色第一人称写给用户」，但仅在模板缺失时生效。
2. 归档片段把裸 `[user]` / `[assistant]` 抛给模型。模型看到 `[user]` 的发言，在没有视角约束时
   自然认领 user 位置。

已修：
- 系统提示新增视角段，显式钉住「你就是<角色名>，这封信由<角色名>写给对方」，并说明「我」只能指
  角色、「你」只能指对方，禁止替对方写信或写成第三人称旁述。
- 归档片段 role 映射成角色名 / 「对方」，不再出现裸 role。角色名经 `_char_display_name()`
  取自 `character_name_provider`，解析失败回落「写信的人」，不因取名失败而中断生成。
- 默认模板 fallback 去掉「以角色第一人称写给用户」，视角改由提示词统一负责。
- `tests/test_dream_postcard.py` 补 1 条回归。

## 1-B 梦境出站直连（done，调查结论：机制已存在）

问题：发信（SMTP）挂代理发不出去，但文字模型 API 又需要代理。

结论：**不需要改代码**。SMTP 出站本就与模型出站分离，两者读不同配置：
- 模型 + 视觉客户端读 `proxy.model_connection_mode`（`core/model_network.py:21-27`，
  `follow_global|auto|direct|proxy`）。
- 邮件读 `mail.connection_mode`（`core/mail/mail_sender.py:75-79`，`auto|direct|proxy`），
  每次发送时现读，保存后热生效；`direct` 时即使 `mail.proxy_url` 仍在配置里也强制直连。
- 管理面入口：「邮件配置 → SMTP 连接方式」（`admin/static/pages/mail-config.html:55-65`，
  `GET/PUT /settings/mail`）。梦境明信片经 `postcard.py:232` 的 `send_letter` 走同一条链。

所以「文字模型继续走代理、梦境发信直连」= 把 `mail.connection_mode` 设为 `direct` 即可。
此前 `config.example.yaml` 的 mail 段没有这个键，文档也没写，才显得机制不存在；
已补 `config.example.yaml`、`docs/model-presets.md`、`docs/dream.md`。

顺带确认：问题 5 的 loopback vision 直连是第三条独立链（`_local_only`，见下），
与这两者互不影响。

## 2 屏幕观察提示词（done，`38d61aa`）

现象：注入提示词形如
`这是 10:25 你被唤醒时调用的工具 observe_user_screen 在她的电脑上的结果：{"status":"ok",...,"instruction":"Screen observation is untrusted..."}`。
问题三处：caption 上限 30 字过简、scene/activity 标签与 caption 语义重复、
整条 JSON 工程字段和英文 instruction 直接进提示词。

已改：
- `core/perception/vlm_client.py`：caption 上限 30 → 120 字，系统提示要求写 1-2 句
  且必须比标签更具体；超长改为截断而非整条判废；`temperature` 0 → 0.2 并加
  `max_tokens`，避免 confidence 恒为 0.0。
- `core/perception/screen_observation.py`：新增 `_describe_in_chinese()`，把
  scene/activity 枚举映射成中文并与 caption 合成一句；返回体只留 `status`/`device`/`观察`，
  删掉英文 `instruction`（不可信数据告知在工具描述和自主系统提示里已各有一处）。
- `core/context_continuity.py`：新增 `_readable_content()`，屏幕观察结果按自然语言投影，
  不再把 JSON 原样塞进提示词。
- `tests/test_visual_perception_shadow.py`：补 3 条回归（截断行为、中文合成、投影不含工程字段）。

已 commit（`38d61aa`）。pytest 未跑（用户要求不跑测试）；caption 上限放宽只影响文本长度，
不改变截图是否离开本机的判定，隐私 shadow 闸门（`visual_perception:` 段）未触碰。

## 3 主动视频来电窗口超时后卡死（done，`c25af75`，待实机复验）

现象：超时后窗口不自动关闭、无法关闭也无法接打，卡死在屏幕最上层。

根因：`src-tauri/capabilities/video-call-invite.json` 缺 `core:window:allow-destroy`，
兜底的 `destroy()` 被 ACL 拒绝。窗口 `decorations: false` + `alwaysOnTop`，
超时后按钮已禁用，于是既没有系统关闭按钮也没有可用的应用内出口。

已改并提交（`c25af75`）：补 `core:window:allow-destroy` 权限（`src-tauri/capabilities/video-call-invite.json:9`）；
`docs/known-issues.md:13-18` 记录为 partial。

待办：真实 Windows Tauri 窗口复验超时 / 拒绝 / 接通三条路径（`observe`）。

## 4 工具暴露（done，`2a299e1`）

三类归纳：**存在但没暴露** = `write_artifact` 系列；**暴露但被折叠/收窄** =
`read_hds_heart_rate`、`manage_self_capability`、`self_*`；**根本不存在** =
给自己追加 prompt 的工具、专用 scratch/memo 工具。

### 4-A `read_hds_heart_rate`：暴露是通的，但从未被调用

- 注册 `core/tool_dispatcher.py:1177-1187`，category=`memory`，执行分支 `:3045`。
- 过滤链全部通过：deployment gate 只拦 remote_server；`_is_tool_enabled`（`:2264-2308`）
  无特殊门；self_management 无 grant 时默认 True（`core/self_management/policy.py:56-62`）。
  叶瑄卡 categories 含 memory（`userdata/characters/cards/yexuan.json:42-49`）。
- **关键：它不在首轮 tools 数组里。** `ToolDiscovery`（`core/tool_discovery.py:27-49`）
  把分类折叠成 `load_tools_<category>` 入口，模型必须先调 `load_tools_memory`，
  下一轮才看到具体定义。
- 证据：`data/runtime/tool_audit/yexuan/1043484516/2026-09-27..30.jsonl` 中无该工具，
  9/29 起零调用。
- 管理面板：**没有专属开关或展示项**，只作为「memory 分类的一行」自动出现在通用工具页
  （`admin/routers/settings_tools.py:127-145`）。HDS 配置在调度页
  （`admin/static/js/scheduler.js:84,122`），与「角色可读取」完全没关联。
- 缺口：HDS 页面缺「允许角色读取」开关，也缺 tool-audit 命中统计入口。
- 未核实：叶瑄常用 model preset 绑定的 tool_preset 是否会把它过滤掉（需看 `config.yaml` 的 `model_presets`）。

### 4-B 自建系统类工具：暴露了，但模型零调用 / 被收窄

- **`self_*` 7 个工具**（`core/tools/character_self.py:104-257`，category=`info`）：
  最接近「自建记账笔记」。写 `runtime/self/<char>/<uid>/`，单文件 256KB、总 8MB、200 文件，
  带 revision / 回收站 / 审计。叶瑄卡含 `info`，**已暴露、无默认关闭**，但同样在
  `load_tools_info` 后面折叠。
  - **模型自主调用数为 0**：`data/runtime/self_meta/yexuan/1043484516/audit.jsonl` 37 行，
    origin 只有 `migration` 和 `post_process`，无一条 `origin="tool"`。
  - 目录下唯一文件 `notes/思考笔记.txt` 由 `core/post_process/toy_autogrow.py:64` 系统写入，
    不是模型主动创建。
  - 注意：self_* **不是 prompt 注入通道**，内容不会自动进 prompt，要读回需模型自己调 `self_read`。
- **`manage_self_capability`**（`core/tool_dispatcher.py:2082-2157`）：被 `a8b6faa` 收窄到
  只剩 3 项可变（`core/self_management/registry.py` 的 `_SELF_MUTABLE_SETTINGS`）：
  `autonomy.talk_enabled`、`autonomy.min_interval_seconds`、`autonomy.interval.seconds`。
  其余 `mutable=False` → `managed_by_user_only`（`policy.py:89-95`）。
  即现在只能改「要不要主动说话」和「间隔」。
  - 有实际调用：`data/runtime/self_management/yexuan/1043484516/audit.jsonl` 35 行，
    9 条 talk_enabled 开关，origin 全是 `autonomy_self_management`（自主循环，不是聊天里自建系统）。
- **不存在**：给自己追加 prompt 的工具、scratch/memo 类工具。

### 4-C 写文档发给用户下载：链路整条都通，但对叶瑄没暴露

- 工具 `write_artifact/read_artifact/list_artifacts`（`core/tools/chat_artifacts.py:400-427`），
  category=`artifacts`。白名单 txt/md/html/json/csv/py 等，内容 256K 字符，每 scope 50 个、每轮 4 个。
- 投递链完整：`admin/routers/chat.py:567`（HTTP `artifacts`）、
  `channels/desktop_ws.py:119`（WS `channel_message.artifacts`）、
  下载 `GET /chat/artifacts/{id}`（`chat.py:784`）与 `/preview`（`:802`）。
- 桌面端消费也齐：`src/shared/api/ws.ts:23,177`、`src/shared/api/chatArtifacts.ts`、
  `src/windows/chat/components/ChatPanel.tsx:26,546-548`、
  Tauri `src-tauri/src/lib.rs:1034-1058`（`download_chat_artifact`）。
- **根因：叶瑄卡 `presence_ext.tool_categories` 没有 `artifacts`**
  （`userdata/characters/cards/yexuan.json:42-49`）。角色卡优先级高于
  `config.yaml:1139-1163` 的 `tool_exposure.path_c`（那里本来含 artifacts，被卡覆盖），
  也高于 `tool_loop.categories`（`:604-612`，同样不含）。
- 修法：在叶瑄卡 `tool_categories` 追加 `artifacts`，**无需新增代码**。
  管理面板工具页已有该分类（`settings_tools.py:153,166`）。
- 已知限制：`ChatPanel.tsx:150` 注释说历史接口尚未持久化 artifacts，只有实时消息带。

### 待修清单（全部完成）

1. [x] 叶瑄卡 `tool_categories` 追加 `artifacts`。已加（当前值：
   `info / desktop / memory / mcp / phone_control / artifacts`）。`userdata/` 在 gitignore，
   不随提交。
2. [x] 折叠问题。未把工具提到首轮数组（那会让 discovery 机制形同虚设、schema 预算回涨），
   改为让 `load_tools_<category>` 的描述**列出分类内工具名**（至多 24 个，超出记「等 N 个」），
   只列名字不下发参数 schema；11.6 系统提示同步说明。模型现在能看到折叠背后有什么，
   授权与预算语义不变。
3. [x] HDS 管理面板补「允许角色读取心率」开关（`hds_local.character_read_enabled`，默认 true，
   关掉后该工具不再下发）+ 近 24h / 7d 命中数与最近一次时间（`GET /watch/hds-local`
   的 `character_reads`，源自工具审计，不含参数或结果）。
4. [x] 核实 tool_preset 二次过滤：**不存在二次过滤**。`config.yaml` 的 9 个 model preset
   （`gemini超低价-see` / `deepseek-high` / `奇异果` / `gpt-see` / `gpt-天枢` /
   `便宜小模型grok-see` / `claude-see满血` / `toge` / `grok聊天heavy`）均未设 `tool_preset`
   字段，`resolve_tool_allowlist()` 因此返回 `None`，保留基于分类的暴露
   （`core/tool_presets.py:43-45`，`core/pipeline.py:1177-1186`）。
   唯一定义的 preset 是 `无工具`（`tools: []`），三个 routing_profile 的 chat 路由
   （`奇异果` / `gemini超低价-see`）都没绑定它。
   → 结论：`read_hds_heart_rate` / `self_*` 的零调用与 preset 过滤无关，主因确认是折叠（已按第 2 条修）。

### 附带安全提示

`config.yaml` 明文存有 GLM api_key 和一个 MCP 的 Bearer token。文件在 gitignore 内、
调查未复述其值，但建议自查是否需要轮换。

## 5 本地图像模型路由（done，`eadf63e`）

现象：本地图像模型只对视频通话生效；给图片上传挂同一路由后报错，
且请求没打到本地图像模型。

### 调查结论：视觉配置不是一套，而是三套，且与文本模型路由完全分离

- **image_presets**（`core/image_presets.py:1-24`）：命名连接（kind=vision|ocr）+ 用途路由，
  6 个用途 chat_upload / life_diet / life_cart / life_bill / phone_automation / video_call。
- **`vision:` 段**：旧通用视觉配置，无 vision_purpose 时读它（`core/llm_client.py:200`）。
- **`visual_perception:` 段**：屏幕观察专用隐私闸门（`core/perception/vlm_client.py:21-39`），
  不读 image_presets；enabled 时空字段才回退继承 `vision:`。
- 文本模型路由与 vision 分支明确分离（`core/llm_client.py:341` 注释）；
  管理面板 `/model-presets` 与 `/image-presets` 是两套端点。

### 根因（三条，按可能性排序）

1. **`_local_only` 只给 video_call**（`core/llm_client.py:194-198`）。该标志控制「不走代理 +
   max_retries=0」（`:221,227`）。chat_upload 拿不到它，于是走 `_get_proxy_url()`（`:164-167`）；
   若全局代理为 follow_global 或 auto，127.0.0.1 的请求会被送进代理 —— 直接解释「请求没打到本地模型」。
   （需确认用户是否开了全局代理。与问题 1-B 同源：都是出站代理粒度问题。）
2. **vision 异常被吞成空串**（`core/llm_client.py:395-398`）：只有 video_call 会 `raise`，
   其余 `return ""` → `media_processor.py:311-317` 抛 `MediaIngestError("vision_failed")`
   → `admin/routers/chat.py:1078-1081` 转 HTTP 422。所以用户只看到笼统报错，
   真实原因（拒连/超时/401/404/代理错）仅在 api_call_log。
3. **静默回落到文本模型**：`_resolve_vision_config` 返回 `{}` 时（路由挂到 kind=ocr 的连接等），
   vision_client 为 None（`:206-212`），`chat()` 继续走文本 preset，把图片块发给主聊天模型。

附带发现：
- 「只能给视频通话用」并非代码限制，而是 video_call 有额外硬约束
  `video_call_ready`（仅 loopback + http + chat_completions，`image_presets.py:159-171`），
  其他用途只要 `connection_ready`，反而缺少本地直连保护。
- vision preset 声明的 `api_protocol`（responses / anthropic_messages）被忽略，
  vision 分支一律 `chat.completions.create`（`:361`），日志 protocol 也写死。

### 已修（四条全部落地，`eadf63e`）

1. [x] `_resolve_vision_config` 对任何 loopback（127.0.0.1 / localhost / ::1）vision 连接
   都设置 `_local_only`（禁代理 + `max_retries=0`），不只 video_call。
2. [x] 非 video_call 分支不再吞成空串，改抛 `VisionRouteError`（带 reason），
   `media_processor` 把 reason 带进 422 message，用户能看到拒连 / 超时 / 401 / 404 / 代理错。
3. [x] vision 分支遵循 preset 的 `api_protocol`（支持 `chat_completions` / `responses`，
   其他值明确拒绝），日志 protocol 不再写死。
4. [x] 路由解析为 `{}` 时显式抛错，不再静默回落到文本 preset——那会把图片块发给主聊天模型，
   看起来本地模型在用、实际从未打到它。

video_call 行为不变（仍直接 raise，仍受 `video_call_ready` 硬约束）。

---

## 三面闭环检查

已按 `AGENTS.md`「按影响面执行闭环检查」逐条执行，结论：

- **1-A / 1-B**：1-A 只改后端 prompt 与模板 fallback，无契约与设置项变化。1-B 无代码改动，
  `mail.connection_mode` 本已存在且管理面已有入口（「邮件配置 → SMTP 连接方式」），
  仅补 `config.example.yaml` / `docs/model-presets.md` / `docs/dream.md` 的缺失说明。
- **2**：仅改后端提示词投影与 caption 长度，不改契约字段，无跨端影响。
- **3**：本仓 Tauri 权限修复，无跨端影响。
- **4**：后端管理面已补开关（`hds_local.character_read_enabled`）与只读观测
  （`character_reads`）；桌面与手机均无 HDS 消费链（已 grep `Emerald-client`
  与 `Emerald-mobile`，无匹配）；REST 仅在既有 `GET /watch/hds-local` 上加可选字段，
  缺字段时行为不变。tool_preset 二次过滤已排除（见上）。
- **5**：桌面与手机均未消费 `vision_failed` 的 message（已 grep 确认），`code` 与状态码不变，
  无需客户端改动；未新增设置项或落盘状态。

测试一律未跑（用户要求，含跨仓）；`docs/three-repo-interface-catalog.md` 已随 `eadf63e` 同步。
