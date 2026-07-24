# 47 · Layout Registry 基础设施（仿主题系统）

## 背景

`docs/ui-mods.md` §8 把"功能 mod"（自定义面板/可执行代码）标记为"方案未定，待专门讨论"。
本工单**不做**功能 mod，做的是范围更小、风险可控的一类：**布局排布 mod**——让 mod 决定
Ribbon / Sidebar / 主内容区这三个既有区域怎么排（顺序、方向、宽高比例、Sidebar 默认是否
展开）以及可选的装饰性 CSS chrome，**不允许 mod 替换区域里跑的组件本身、不引入可执行代码、
不新增 IPC 面**。信任模型与现有 `docs/ui-mods.md` 的 UI 主题 mod 完全一致（声明式 manifest +
受限 CSS + 磁盘目录白名单读取），只是契约内容从"颜色 token"换成"排布参数"。

**明确不做的事（留给未来的功能 mod 讨论）**：mod 不能新增/替换组件、不能执行 JS、不能改
Ribbon/Sidebar 内部结构（图标横排 vs 竖排等组件级重排不在 v1 范围）。v1 只管三个区域的
**排列顺序、主轴方向、尺寸、Sidebar 默认可见性**，外加一份可选 `layout.css` 做纯装饰
（复用现有 `cssGuard.ts` 安检规则）。这个边界务必写进 `docs/layout-mods.md`（49 号工单），
避免后续被误解为"任意布局=任意组件"。

参照系统（**逐文件对照抄，不要另起炉灶**）：

| 主题系统（已存在，抄这个） | 对应的布局系统（本工单要建） |
|---|---|
| `src/shared/theme/types.ts` | `src/shared/layout/types.ts` |
| `src/shared/theme/contract.ts`（token 契约） | `src/shared/layout/contract.ts`（slot 契约） |
| `src/shared/theme/loader.ts`（validateTheme/applyTheme/applyThemeCss） | `src/shared/layout/loader.ts`（validateLayout/applyLayoutCss） |
| `src/shared/theme/cssGuard.ts` | 直接复用，不重写 |
| `src/shared/theme/registry.ts`（listThemes/setTheme/subscribe，builtin+磁盘合并） | `src/shared/layout/registry.ts`（listLayouts/setLayout/subscribe） |
| `src/shared/theme/builtinThemes.ts` | `src/shared/layout/builtinLayouts.ts` |
| `src-tauri/src/lib.rs` 的 `themes_dir` / `list_themes_in_dir` / `is_safe_theme_path_part` / `read_theme_css_in_dir` / `list_themes` / `read_theme_css`（约 280–413 行） | 同文件新增 `layouts_dir` / `list_layouts_in_dir` / `read_layout_css_in_dir` / `list_layouts` / `read_layout_css`，**path 安全检查函数直接复用 `is_safe_theme_path_part`，不要重复实现** |
| `Mods/<id>/theme.json` + `theme.css` | `Mods/<id>/layout.json` + `layout.css` |
| `public/themes/<id>/` | `public/layouts/<id>/`（dev fallback，同 `themes_dir` 的探测顺序：cwd → resource_dir → dev `public/`） |

## 契约设计

`src/shared/layout/contract.ts`：

```ts
export const SLOT_IDS = ['ribbon', 'sidebar', 'main'] as const;
export type SlotId = typeof SLOT_IDS[number];
```

`src/shared/layout/types.ts`：

```ts
export interface SlotSpec {
  order: number;                 // flex order，决定排列顺序
  size?: number;                 // ribbon/sidebar 的宽度 px；main 恒 flex:1，忽略此字段
  hidden?: boolean;               // 仅 sidebar 允许 true（默认收起）；ribbon/main 恒显示
}

export interface LayoutManifest {
  id: string;                     // 必须等于磁盘目录名
  name: string;
  author: string;
  version: string;
  direction: 'row' | 'row-reverse';   // 整体 flex 主轴方向
  slots: Record<SlotId, SlotSpec>;    // 三个 slot 必须齐全
  css?: string;                        // 可选 layout.css 文件名
}

export interface LayoutRecord {
  manifest: LayoutManifest;
  source: 'builtin' | 'disk';
}
```

`validateLayout(manifest)` 规则（仿 `theme/loader.ts` 的 `validateTheme`）：
- `id`/`name`/`direction` 必须是字符串且 `direction` ∈ `['row', 'row-reverse']`；
- `slots` 必须同时包含 `ribbon`/`sidebar`/`main` 三个 key，每个 `order` 是 number；
- `hidden: true` 只能出现在 `sidebar`，出现在 `ribbon`/`main` 视为非法，整份 manifest 拒绝
  （日志：`[layout] 忽略布局 "..."，ribbon/main 不允许 hidden`）；
- 校验失败 → 整份 manifest 被拒绝，不 fallback 到"部分应用"，行为对齐主题系统的
  "缺任何必填 token 整个主题被拒绝"。

`builtinLayouts.ts` 内置一份 `obsidian-default`，**其 `slots` 数值必须与当前
`ChatWindow.tsx` 硬编码的排布完全一致**（ribbon 固定左侧、sidebar 默认展开宽度取
`SIDEBAR_DEFAULT`=340、main 占满剩余空间），保证 48 号工单接入后默认视觉零回归。

## registry.ts 行为

- `listLayouts(refresh=false)`：builtin + 磁盘（Tauri `list_layouts` IPC）合并，同 id 磁盘覆盖
  内置；`validateLayout` 过滤非法项；结果缓存。
- `setLayout(id)` / `getLayout()`：当前选中布局 id，持久化走 `getUIPref`/`setUIPref`
  （key `chat.layout`，默认 `obsidian-default`），跨窗口同步机制与主题系统一致（不需要
  跨窗——布局目前只在 ChatWindow 主窗生效，但沿用同一 pref 存储管道，不要另起 localStorage
  裸 key）。
- `subscribe(fn)`：布局切换时通知订阅者（48 号工单的 `LayoutHost` 用它触发重渲染）。
- CSS 注入：`applyLayoutCss(record)` 仿 `loader.ts::applyThemeCss`，写入
  `<style data-layout-css>`，同样跑 `cssGuard.ts::inspectThemeCss` 安检（函数名可以不改，
  它检查的是通用 CSS 规则，与"主题"无关，直接复用）。

## Rust 侧改动（`src-tauri/src/lib.rs`）

在 `themes_dir`/`list_themes_in_dir`/`read_theme_css_in_dir` 附近新增对应函数，**逻辑原样
复制**（探测顺序、`is_safe_theme_path_part` 路径安全检查、`canonicalize` + `starts_with`
防目录穿越），把 `theme.json`/`theme.css`/`themes` 字样换成 `layout.json`/`layout.css`/
`layouts`。在 `generate_handler!` 列表（约 2633 行处）追加 `list_layouts, read_layout_css`。

不改 `src-tauri/capabilities/default.json`——现有 `list_themes`/`read_theme_css` 在该文件里
没有单独的权限声明（自定义 command 不需要），新命令同理不需要。

## 验收

- 新增单测（仿 `lib.rs` 约 2978/2993/3004 行附近已有的 `read_theme_css_in_dir` 单测）：
  合法布局 CSS 读取成功、非法 id（含 `../`）被拒、非法文件名被拒。
- `validateLayout` 单测：合法 manifest 通过；缺 slot、`direction` 非法、`sidebar` 之外
  出现 `hidden: true` 均被拒绝且不 panic。
- `npx.cmd tsc --noEmit` + `cargo check`（或项目里等价的 Rust 检查命令，见
  `Emerald-presence/docs/dev-environment.md` 关于本仓沙箱内跑 build 的前置说明）通过。
- 本工单**不接入 ChatWindow**，`listLayouts()`/`setLayout()` 此时应有能跑通的单测，但还没有
  UI 消费方——48 号工单负责接线。

## 依赖 / 并行

- 无依赖，可立即开始。与 46 号工单（纯搬运 ChatWindow 内嵌组件，不碰 `shared/`）完全独立，
  可并行。
- 48 号工单依赖本工单完成。
