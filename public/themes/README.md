# Emerald Theme Mods

主题 Mod 放在 `themes/<id>/theme.json`。开发期目录是 `public/themes/`；打包后对应应用资源目录中的 `themes/`。添加或修改 manifest 后重启应用，主题会出现在偏好面板的主题选择器中。

```text
themes/
  midnight-sakura/
    theme.json
```

Manifest 字段：

- `id`：唯一 id，建议与目录名一致。
- `name`：选择器展示名。
- `author` / `version`：可选。
- `base`：可选，值为 `light` 或 `dark`。
- `tokens`：CSS 变量名到 CSS 值的映射。未知变量会被忽略。

以下变量全部必填；缺少任意一项时主题不会进入选择器，控制台会列出缺失项：

```text
--paper --paper-2 --paper-3 --paper-edge
--ink --ink-2 --ink-3 --ink-4
--forest --forest-1 --forest-2 --forest-3 --forest-line
--on-forest --on-forest-2
--accent --accent-2 --accent-3 --danger
--paper-grain-1 --paper-grain-2 --shadow-rgb-mix
--board-light --board-dark --board-select --board-target-light --board-target-dark
--board-coord-light --board-coord-dark
--goban-bg --goban-line --stone-black-core --stone-black-edge
--stone-white-core --stone-white-edge --stone-black-border --stone-white-border
--status-connecting --status-error
--flower-calm --flower-bright --flower-low --flower-yandere --flower-adrift --flower-default
```

字体变量 `--font-serif`、`--font-sans`、`--font-mono` 和所有 `--dt-*` Dream 变量均为可选。不提供时使用应用默认值。完整且权威的变量清单位于 `src/shared/theme/contract.ts`。

## 圆角 / 边框 Token

以下 shape token 为必填，控制 Chat 与 Activity 窗口的圆角和边框宽度：

```text
--radius-xs   --radius-sm   --radius-md   --radius-lg   --radius-pill
--border-thin   --border-regular
```

默认值：`xs=3px / sm=5px / md=8px / lg=12px / pill=999px / thin=1px / regular=2px`。
`plum-mist` 演示了一套更圆润的取值（xs=6px / md=14px）。

## 自定义 CSS

Manifest 可选字段 `"css": "theme.css"` 指向同目录下的 CSS 文件（文件名可自定义）。

```json
{
  "id": "my-mod",
  "css": "theme.css",
  "tokens": { ... }
}
```

加载时会对 CSS 文本进行安全检测，以下写法**直接导致该主题被拒、不进入选择器**：

| 禁止 | 原因 |
|---|---|
| `@import` | 防加载远程样式 |
| `url(https://...)` / `url(http://...)` | 防外联资源/追踪 |
| `expression(` | 旧 IE 可执行表达式 |
| `javascript:` | 伪协议 |
| `-moz-binding` / `behavior:` | XBL/HTC 可执行绑定 |
| 文件超过 100KB | 防卡渲染 |

**资源引用**只能使用 `/themes/<id>/...` 相对路径或 `data:` URI。

可用的 CSS 类名钩子（稳定，后续只增不删）：

- `.chat-ui` — 整个 Chat 窗口根节点
- `.chat-ui__body` — 聊天区内容层（Sidebar + ChatPanel）
- `.chat-ui__background` — 聊天背景图层
- `.dream-theme` — Dream 窗口根节点
- `.dream-theme__chat-background` — Dream 背景图层

示例见 `plum-mist/theme.css`。新放入主题目录的 mod 可在 ThemePicker 点击「刷新主题」后立即识别。
