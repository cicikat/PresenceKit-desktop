# 布局 Mod 说明书

布局 mod 是一份描述 Chat 既有区域如何排布的 `layout.json`，可选附带受安检的
`layout.css`。它只换排布，不换组件或执行代码。

## 1. 系统地图

```text
builtinLayouts.ts ─┐
                   ├─ listLayouts() → 校验/缓存 → 当前 chat.layout 偏好
磁盘 layouts/<id> ─┘                              │
                                                    ▼
                         LayoutHost → ribbon / sidebar / main
                                                    │
                                                    ▼
                           ChatPanel → header / transcript / composer
```

开发时扫描 `public/layouts/<id>/layout.json`；安装版扫描
`<安装目录>/resources/layouts/<id>/layout.json`。同 id 的磁盘 mod 覆盖内置项。ChatWindow
仍然创建 Ribbon、Sidebar 和聊天主内容；LayoutHost 只读取 manifest 来摆放它们。V2 的
`mainLayout` 再在 ChatPanel 内部重排已登记的标题、消息流和输入框，三者始终由同一个
ChatPanel 实例持有，因此切换布局不会重建聊天会话状态。

## 2. 契约

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` / `name` / `author` / `version` | 是 | `id` 必须与目录名一致 |
| `direction` | 是 | `row` 或 `row-reverse` |
| `slots.ribbon/sidebar/main` | 是 | 三个 slot 都必须存在，均需数值 `order` |
| `slots.*.size` | 否 | Ribbon/Sidebar 的像素宽度；main 始终占满剩余空间 |
| `slots.sidebar.hidden` | 否 | 只决定首次打开时 Sidebar 是否收起；用户仍可手动展开 |
| `slots.ribbon.hidden` / `slots.main.hidden` | 禁止 | 整份 manifest 会被拒绝 |
| `mainLayout` | 否 | V2 主区模板：`stack`（原始纵向）、`workbench`（右侧输入工作台）、`hud`（左 HUD + 右消息流） |
| `css` | 否 | 同目录内的 `.css` 文件名 |

## 3. 包格式与可抄样例

```text
public/layouts/sidebar-right/
├── layout.json
└── layout.css
```

`public/layouts/sidebar-right/` 是可直接运行的开发样例，也是开发版唯一会扫描的位置。仓库根的
`Mods/` 不是运行时目录，不保留重复副本；给安装版分发时，直接复制 `layouts/<id>/` 到安装目录的
`resources/layouts/<id>/`。

```json
{
  "id": "sidebar-right",
  "name": "侧栏在右",
  "author": "你",
  "version": "1.0.0",
  "direction": "row",
  "mainLayout": "workbench",
  "slots": {
    "ribbon": { "order": 0, "size": 52 },
    "main": { "order": 1 },
    "sidebar": { "order": 2, "size": 280, "hidden": false }
  },
  "css": "layout.css"
}
```

## 4. 安装方式

开发环境把目录放到 `public/layouts/`；安装版放到 `resources/layouts/`，然后重新启动客户端。
在「偏好 → 外观 → 布局预览（实验）」可立即选择已发现的布局；选择会保存到 `chat.layout`，缺失或
非法 id 会回退 `obsidian-default`。这个入口是预览器，不是可视化编辑器。

## 5. CSS 安全

`layout.css` 复用 `src/shared/theme/cssGuard.ts`：最大 100KB，禁止 `@import`、远程
`url()`、`expression()`、`javascript:`、`-moz-binding` 和 `behavior`。推荐使用
`[data-layout-slot="ribbon|sidebar|main"]` 作为装饰锚点。不要靠 CSS 改写 ChatPanel 内部
Grid；布局由 `mainLayout` 的受控模板负责，CSS 只做装饰。

## 6. 与功能 mod 的边界

布局 mod 只能调整 Ribbon、Sidebar、Main 的顺序、方向、尺寸、Sidebar 默认可见性，以及
主区的三个固定区域（标题、消息流、输入框）的受控模板和装饰性 CSS。它不能替换或新增组件、
执行 JS、接入 IPC，也不能把 Ribbon 的竖排图标改成横排。`mainLayout` 不是任意 CSS Grid：
它只接受 `stack`、`workbench`、`hud`，未知值会被整个 manifest 校验拒绝。
真正的任意布局或功能扩展属于 [UI mod 文档](ui-mods.md) §8 的功能 mod 范畴，仍需要独立的
沙箱与权限设计。

## 7. 当前边界

当前有三个可运行样例：`sidebar-right`（右侧工具栏 + 工作台输入区）、`mirror-stage`（左侧语境栏、
右侧 Ribbon + HUD 主区）和 `focus-stage`（默认收起侧栏 + 原始纵向聊天）。它们分别展示 slot
顺序、方向、宽度、默认可见性和 V2 主区模板。窗口变窄到 760px 以下时，`workbench` / `hud`
自动回退为 `stack`，避免输入区或消息流被挤没。桌宠窗口，以及 Dream、偏好、帮助、Pane、Yandere
等 overlay 均不在布局 slot 范围内。
