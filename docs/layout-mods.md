# 布局 Mod 说明书

布局 mod 是一份描述 Chat 三个既有区域如何排布的 `layout.json`，可选附带受安检的
`layout.css`。它只换排布，不换组件。

## 1. 系统地图

```text
builtinLayouts.ts ─┐
                   ├─ listLayouts() → 校验/缓存 → 当前 chat.layout 偏好
磁盘 layouts/<id> ─┘                              │
                                                    ▼
                              LayoutHost → ribbon / sidebar / main
```

开发时扫描 `public/layouts/<id>/layout.json`；安装版扫描
`<安装目录>/resources/layouts/<id>/layout.json`。同 id 的磁盘 mod 覆盖内置项。ChatWindow
仍然创建 Ribbon、Sidebar 和聊天主内容；LayoutHost 只读取 manifest 来摆放它们。

## 2. 契约

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` / `name` / `author` / `version` | 是 | `id` 必须与目录名一致 |
| `direction` | 是 | `row` 或 `row-reverse` |
| `slots.ribbon/sidebar/main` | 是 | 三个 slot 都必须存在，均需数值 `order` |
| `slots.*.size` | 否 | Ribbon/Sidebar 的像素宽度；main 始终占满剩余空间 |
| `slots.sidebar.hidden` | 否 | 只决定首次打开时 Sidebar 是否收起；用户仍可手动展开 |
| `slots.ribbon.hidden` / `slots.main.hidden` | 禁止 | 整份 manifest 会被拒绝 |
| `css` | 否 | 同目录内的 `.css` 文件名 |

## 3. 包格式与可抄样例

```text
sidebar-right/
├── layout.json
└── layout.css
```

`public/layouts/sidebar-right/` 是可直接运行的开发样例；`Mods/sidebar-right/` 是同一内容的
分发副本，方便复制到安装版资源目录。

```json
{
  "id": "sidebar-right",
  "name": "侧栏在右",
  "author": "你",
  "version": "1.0.0",
  "direction": "row",
  "slots": {
    "ribbon": { "order": 0, "size": 52 },
    "main": { "order": 1 },
    "sidebar": { "order": 2, "size": 280, "hidden": false }
  },
  "css": "layout.css"
}
```

## 4. 安装方式

目前没有布局可视化编辑器。开发环境把目录放到 `public/layouts/`；安装版放到
`resources/layouts/`，然后重新启动客户端。布局选择入口尚未提供，因此当前可通过
`chat.layout` 偏好设置选中的 id；缺失或非法 id 会回退 `obsidian-default`。

## 5. CSS 安全

`layout.css` 复用 `src/shared/theme/cssGuard.ts`：最大 100KB，禁止 `@import`、远程
`url()`、`expression()`、`javascript:`、`-moz-binding` 和 `behavior`。推荐使用
`[data-layout-slot="ribbon|sidebar|main"]` 作为装饰锚点。

## 6. 与功能 mod 的边界

布局 mod 只能调整 Ribbon、Sidebar、Main 的顺序、方向、尺寸、Sidebar 默认可见性，以及
装饰性 CSS。它不能替换或新增组件、执行 JS、接入 IPC，也不能把 Ribbon 的竖排图标改成横排。
真正的任意布局或功能扩展属于 [UI mod 文档](ui-mods.md) §8 的功能 mod 范畴，仍需要独立的
沙箱与权限设计。

## 7. 当前边界

目前只有 `sidebar-right` 一个布局样例；没有可视化编辑器；桌宠窗口，以及 Dream、偏好、帮助、
Pane、Yandere 等 overlay 均不在布局 slot 范围内。
