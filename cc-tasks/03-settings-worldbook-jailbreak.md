# Brief 03 · 设置栏整理：世界书/破限重复、对话模式/风格重复、"其他"改占位（④之一）

文件主战场：`src/windows/chat/ChatWindow.tsx`。偏好顶栏 4 个 tab（~182–186）：`1·外观 / 2·世界 / 3·桌宠 / 4·其他`。

## 一、世界书 / 破限确实是"两套并存"——确认重复，需择优（D2）

「2·世界」→ `PromptAssetsSettings`（~542），内部 3 个子 tab（~707–728）：

| 子 tab | 组件 | 走的 Tauri 命令 | 后端路由 | 性质 |
|---|---|---|---|---|
| 素材选择 | `PromptAssetChecks`「Reality 世界书」(~807)、「Reality 破限」(~814) | `get_prompt_assets`/`patch_prompt_assets` | `/settings/prompt-assets` | **文件级开关**：勾选启用哪些预置世界书/破限**文件**（`enabled_lorebooks`/`enabled_jailbreaks`） |
| 世界书条目 | `EntryManager` LORE (~724) | `get/add/update/delete_lorebook_entry` | `/lorebook` | **条目级 CRUD**：按 id 增删改（keyword/content/regex/insertion_order） |
| 破限条目 | `EntryManager` JB (~727) | `get/add/update/delete_jailbreak_entry` | `/jailbreak-entries` | **条目级 CRUD**：按 id（title/content/enabled/layer） |

确认茶茶的判断：**世界书有两套（文件勾选 vs 条目 CRUD），破限也有两套**。两者后端是不同资源、不同 store，所以不是同一份数据，但**功能高度重叠**（都往 prompt 注世界/破限文本），UI 上让人困惑。`docs/backend-integration.md` ~80 也写明"Chat 世界页只管理 Reality Prompt Assets，不复用 Dream 设置接口"。

对照 dream 破限（`DreamPrefsPane.tsx` 的 `JailbreakMultiPicker`，多选 `dream_presets` 芯片）——它其实≈chat 的「Reality 破限」文件多选，只是芯片 UI 更好看。真正独一份的是 `EntryManager` 的 id CRUD。

### 择优 = A（茶茶已定）
以**条目 CRUD（世界书条目/破限条目）为主**，把「Reality 世界书 / Reality 破限」两个文件勾选框（`PromptAssetsSettings` 素材选择里的 `PromptAssetChecks`，~807-821）**移除**，UI 上把 dream 那种芯片多选样式搬过来统一观感。
- 角色卡单选（~750-805）**保留**（它不是重复项）。
- **CC 执行前置自查**：先用 `get_lorebook_entries`/`get_jailbreak_entries` 实测 `/lorebook`、`/jailbreak-entries` 返回真实数据且增删改真生效（后端路由确认存在：`lib.rs` 已接 `/lorebook`、`/jailbreak-entries`）。若某一端点其实是空壳，回报茶茶再决定那一类是否暂留文件级开关。
- 移除文件勾选后，`enabled_lorebooks/enabled_jailbreaks`（走 `/settings/prompt-assets`）若后端仍需要，可改为"默认全启用/由条目 enabled 决定"，别让前端丢字段导致 PATCH 报错——先确认后端是否还依赖这两个字段。

## 二、对话模式 vs 对话风格 —— 已查清：对话模式是死设置

「4·其他」最后的 `ChatSettingsSection`（~1006–1040）有三项：
- **对话模式** `mode` → `/chat-mode`
- **对话风格** `style` → `/chat-style`
- 多消息分条 `multi_message` → `/chat-multi-message`

**后端核实结论（Emerald-presence）：**
- **`对话模式`(chat.mode) 实际上没有任何代码消费**。`admin/routers/settings_misc.py` 的 `/chat-mode` 只把值写进 `config.chat.mode`；全后端再无读取处，`core/pipeline.py:450` 仅剩一句过时注释提到它。→ **这是个死开关，点了不改变任何行为。**
- **`对话风格`(chat.style) 是真生效那个**：`core/prompt_builder.py:1099-1116` 按 style 注入不同输出格式指令（`chat`=以对白为主、禁动作/环境描写行；`roleplay`=第一人称沉浸、动作心理环境进括号）。

### 改法
- **移除"对话模式"项**（连同前端 `setChatMode`/`get_chat_settings` 里 mode 的展示）。保留"对话风格"和"多消息分条"。
- 文案优化"对话风格"：`沉浸对话` / `沉浸扮演` 可改成更贴合后端语义的说明（对白为主 vs 第一人称带括号动作）。
- 后端侧（单独 TODO，可不动）：`/chat-mode` 路由与 `get_chat_settings` 合并里的 mode 字段可后续清理；前端先不发 mode、并确认 `get_chat_settings`（`lib.rs` 顺序 GET 三个端点）去掉 mode 后不报错。

## 三、"其他"只放"未完待续"，真功能挪去新分支（④结构）

「4·其他」当前内容（else 分支 ~439–446）：
1. 「沉浸式挽留模式（废弃版仅保留视觉效果）」启动按钮 → `YandereOverlay`
2. `ChatSettingsSection`（上面的对话模式/风格/分条）

茶茶要求：**"其他"里不要有真选项，只放"未完待续"占位；真功能搬到新分支**。chat 与 dream 都照此原则。

### chat 改法（已定）
- 顶栏 tab 数组（~182–186）重排为（含 brief 01 的色彩页）：
  `1·外观 / 2·色彩自定义 / 3·世界 / 4·桌宠 / 5·对话 / 6·其他`
- `5·对话`：渲染 `ChatSettingsSection` 的真运行时开关——**对话风格 + 多消息分条**（对话模式已删，见上）。
- `6·其他`：只渲染一个"未完待续"占位块，无任何可点真功能。
- 「沉浸式挽留模式」（废弃版视觉）：**挪到 `5·对话` 底部**（加一条 divider 放它），不删；让 `6·其他` 保持纯占位。
- 渲染分支（~372–447）按上面相应拆分。

### dream 同原则（已定）
- `DreamPrefsPane.tsx` `DREAM_PREF_TABS`（~171–176）当前是 `当前状态/梦境上下文/系统设置/世界`，**加两个 tab**：
  - 「色彩」（brief 01 C）；
  - 「其他」= 只放"未完待续"占位。
- 现有真功能保持在各自分支不动。

## 验证步骤
- 实测三端点的回填表附在本 brief。
- 改完顶栏：4·对话 能改 mode/style/分条并保存成功；5·其他 只显示"未完待续"无可点真功能。
- 世界书/破限按选定方案后，启用项/条目保存后重开偏好仍正确回显。
