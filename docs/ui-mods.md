# UI Mods 说明书（主题 mod 制作与系统地图）

> 双读者文档：人类作者照着做即可出 mod；agent 看完 §2 架构图与 §5 配方可直接动手。
> 本文档只覆盖**主题 UI mod**；布局排布 mod 见 `docs/layout-mods.md`，功能 mod（外接功能）仍在 §8 预留、方案待讨论。

---

## 1. 一句话原理

全应用只有一份 CSS 变量契约（`src/shared/theme/contract.ts`）。UI mod = 一个提供这些变量值的
`theme.json`（可选配一个受安检的 `theme.css`）。换皮不改代码。

---

## 2. 系统架构图（agent 从这里定位代码）

```text
                     ┌──────────── 三个主题来源 ────────────┐
                     │                                      │
  builtinThemes.ts   │  磁盘 mod 目录                        │  用户预设(★)
  (paper / dark)     │  debug:  public/themes/<id>/         │  localStorage
        │            │  release: resource_dir/themes/<id>/ │  (ChatColorPage 内置编辑器)
        │            │  经 Tauri IPC `list_themes` 读取      │        │
        └──────┬─────┴──────────────┬───────────────────────┴────────┘
               ▼                    ▼
        registry.ts::listThemes()  ← 合并（同 id 时磁盘覆盖内置、token 深合并）
               │  validateTheme() 校验必填 token（loader.ts）
               │  inspectThemeCss() CSS 安检（cssGuard.ts，见 §6）
               ▼
        setTheme() / 日夜双槽(day/night, manual/auto) / 跨窗 storage 同步
               │
               ▼
        loader.ts::applyTheme()  → documentElement 内联 style 写入全部 token
        loader.ts::applyThemeCss() → <style data-theme-css> 注入自定义 CSS
               │
              ▼        （运行时可能盖写 token 的两层，mod 作者必知）
        moodReactive.ts  → 情绪反应色：偏移 --accent/--forest 等（可开关）
        dreamAppearance.ts → Dream 偏好 RGB 配色/背景：盖写 --dt-*（仅 Dream 窗口）
```

**最终优先级（后者盖前者）**：内置默认 → theme.json tokens → theme.css →
moodReactive 覆盖层 → Dream 窗口内 dreamAppearance 覆盖。

所有窗口共用一个 bundle（`src/main.tsx` 里 `initTheme()`），主题经 localStorage
`storage` 事件跨窗同步——**chat / activity / toy / diary-detail / dream 全部吃同一套 token**。

---

## 3. Token 契约（写 theme.json 就是填这张表）

权威定义在 `src/shared/theme/contract.ts`，此处是语义速查：

| 组 | 前缀/示例 | 必填? | 管什么界面 |
|---|---|---|---|
| CORE | `--paper*` 纸底 / `--ink*` 文字 / `--forest*` 主色面 / `--accent*` 强调 / `--danger` | **必填** | 所有窗口的底色、文字、气泡、按钮 |
| GAME | `--board-*` 棋盘 / `--goban-*` 围棋 / `--stone-*` 棋子 / `--status-*` / `--flower-*` 花园花色 | **必填** | 一起做事（activity 窗口）棋类 + 花园 tab |
| SHAPE | `--radius-*` 圆角 / `--border-*` 线宽 | **必填** | 全局形状语言 |
| FONT | `--font-serif/sans/mono` | 可选 | 全局字体（不填则跟随字体包设置） |
| DREAM | `--dt-*`（背景/表面/墨色/花色/辉光/玻璃/动效时长） | 可选 | 梦境窗口。注意会被用户的 Dream RGB 自定义配色盖写 |
| MOTION | `--motion-*` 时长 / `--ease-*` 曲线 / `--motion-scale` | 可选 | 全局动效节奏 |

缺任何必填 token → 主题被整个拒绝（控制台 `[theme] 忽略主题...缺少必需变量`）。
颜色值推荐 `oklch()`（内置主题同款，方便按感知均匀调亮暗），十六进制也合法。

**各窗口覆盖现状**：

| 窗口 | token 化程度 | 备注 |
|---|---|---|
| chat 主窗口 | 全量 | ThemePicker / ChatColorPage 入口都在这 |
| activity（一起做事） | 全量（GAME 组专供） | 设置页也有主题入口 |
| toy | 全量 | Ribbon 有日夜切换 |
| diary-detail | 全量 | 自行 initTheme |
| dream | `--dt-*` 可选组 + 双轨盖写 | 见 §7 |
| pet（桌宠） | **基本不吃 token** | 画布渲染（粒子/3D/Live2D），UI mod v1 范围外 |

---

## 4. mod 包格式

```text
<主题目录>/<id>/          ← 文件夹名必须等于 manifest 的 "id"（否则 CSS 404）
├── theme.json            ← 必须
└── theme.css             ← 可选，manifest 里 "css": "theme.css" 声明
```

`theme.json` 骨架（完整可抄样例见 `public/themes/plum-mist/`；带 CSS 的完整样例见
`public/themes/presence-glass/`，token 全集见 §3）：

```json
{
  "id": "my-theme",
  "name": "我的主题",
  "author": "你",
  "version": "1.0.0",
  "base": "dark",            // "light" | "dark"，决定日/夜槽归类
  "css": "theme.css",        // 可选；没有花活就删掉这行，token-only 最稳
  "tokens": { "--paper": "oklch(0.19 0.025 325)", "...": "全部必填 token" }
}
```

---

## 5. 三种打 mod 路径（按门槛排序）

**A. 零门槛：应用内编辑器（★ 用户预设）**
Chat 偏好浮层 → 外观 → 颜色编辑（`ChatColorPage`）。从 paper/dark 派生，逐 token 调色，
存 localStorage，可导出。适合调色不适合发布。

**B. 标准路径：token-only 磁盘 mod（推荐）**
1. 抄一份 `public/themes/sakura-pink/theme.json`（它就是 token-only mod 的活样板）；
2. 改 `id`（=文件夹名）、`name`、`base`、tokens；
3. 放进主题目录：开发跑 `npm run tauri dev` 放 `public/themes/`；release 安装包资源位于
   `resource_dir/themes/`；
4. 重开应用（或主题列表刷新入口），ThemePicker 里出现即成功。被拒看控制台 `[theme]` 日志。

**C. 进阶：带 theme.css 的 mod**
CSS 与 token 同目录，能写选择器级样式（如给气泡加纹理）。必须过 §6 安检。磁盘 mod 的
CSS 由 Tauri `read_theme_css` 从当前构建模式唯一资源根读取：debug 只读 `public/themes/`，
release 只读 `resource_dir/themes/`；新放入目录的 mod 点击 ThemePicker 的「刷新主题」即可
重新扫描，无需重启。

### 资源根边界

主题资源根按构建模式互斥选择：

| 运行模式 | 唯一读取根 |
|---|---|
| debug / `npm run tauri dev` | `public/themes/` |
| release / 安装包 | `resource_dir/themes/` |

`list_themes` 与 `read_theme_css` 使用同一根；当前根缺失时明确报错，不读取另一模式的目录。
`src-tauri/target/**` 与 `dist/**` 都是可重建产物，不是 mod 维护入口，也不会影响主题列表或 CSS。

**agent 施工提示**：改 token 契约（增删组/改必填面）只动 `contract.ts` 并同步本文档 §3
与全部内置主题/样例；改加载链路先读 `registry.ts`（合并/校验/日夜槽）再动。

---

## 6. CSS 安检规则（cssGuard.ts）

体积 ≤100KB；禁 `@import`、远程 `url()`（资源只能来自主题目录）、`expression()`、
`javascript:`、`-moz-binding`/`behavior`。违规整个主题被拒并在控制台给出理由。

---

## 7. mod 作者必知的两个"谁在改我的颜色"

1. **moodReactive（情绪反应色）**：开启后按角色心情对 `--accent`/`--forest` 等做
   色相/饱和度偏移。它以"干净主题值"为基准快照偏移，属预期行为；调色时在
   ChatColorPage 内会自动挂起。
2. **Dream 双轨**：梦境窗口 = theme 的 `--dt-*`（mod 提供默认）+ 用户 Dream 偏好里的
   RGB 自定义配色/背景导入（运行时盖写）。mod 的 `--dt-*` 是"出厂默认"，用户改过
   Dream 配色后以用户为准——不要试图用 CSS 强行反盖。

---

## 8. 功能 mod（预留）

布局排布 mod 已有独立的 [布局 Mod 说明书](layout-mods.md)：它只重排 Chat 的既有三区及主区内
标题 / 消息流 / 输入框的受控模板，不能执行或替换组件。外接功能（自定义面板/小组件/接外部服务）与 UI mod 是不同的信任级别：UI mod 是纯
声明式 token+受限 CSS。Chat 内可信自由合成的执行代码路线已经由
[可信设计 Mod 文档](design-mods.md) 定义；它是独立的 design-mod 包和 viewport host，不得把
可执行内容塞进主题包。第三方不可信沙箱、权限和市场分发仍不在当前范围内。

主题 Mod 不负责选择 Chat 的 `mainLayout`。特别是 `hud` 在宽窗口/全屏时会把聊天记录放在右列、发送栏放在左列；这不是主题 CSS 异常。若主题的推荐搭档需要常规上下聊天，应在布局 Mod 中选择 `stack`（`presence-glass-atlas` 即采用此配置）。

可信设计 Mod 的 Sidebar presenter、视觉区域 ownership 和语义 CSS hook 见
[可信设计 Mod 文档](design-mods.md)；主题 Mod 只负责 token/CSS，不应读取或重建 presenter 数据。

---

## 9. 已知缺口

2026-09-11：ChatColorPage 与 DreamColorTab 已内嵌实时对话缩略预览，使用所编辑的日/夜
token；梦境色彩页新增共用 ThemePicker。主题可共用，Layout/Design Mod 仍只作用于 Chat。
验证及真实窗口 open 项见 ui-refinements-2026-09-11.md。

cc-tasks/42 已补齐 UI mod 的磁盘 CSS 读取、样例目录名与主题列表手动刷新入口；当前没有
已确认的 UI mod 加载缺口。功能自由合成不属于 UI mod，见 §8 和 [design-mods.md](design-mods.md)。
