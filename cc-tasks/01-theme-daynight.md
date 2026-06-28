# Brief 01 · 日夜换色 + 配色自定义（诉求①）

## 先纠正一个事实（D1）
chat 和 dream 是**有意独立的两套主题机制**，保持独立，不要合并。
- chat 日夜"看起来像加了层遮罩"——**经核实不是遮罩**。chat 走的是真·token 全量替换（`builtinThemes.ts` 的 `paper`/`dark` 各是一整组 CSS 变量，`registry.ts` 写进 `:root`）。观感像遮罩是因为 **paper(日) 与 dark(夜) 两套色调差异不够、对比偏灰**。解决靠下面的"配色自定义"让用户自己拉开层次，不是去拆什么遮罩。
- dream 自己维护 `.dream-theme--day/--night`（`DreamTokens.css`）是对的，保留。

## 目标（茶茶定的形态）
1. **按模块拆分编辑**：日/夜各自可分别编辑——主页面背景色、面板色、文字色（正文/次要/弱化）、强调色、气泡色等，按模块分组列出。
2. **选色用 RGB 色环**（类 PS）；若实现成本高，退路为**色号(hex)输入框**。
3. **预设管理**：保存 / 命名 / 删除 / 导出（导出=落成主题清单格式，见总览 Q2）。
4. **单开一页"色彩自定义"**（偏好顶栏新增 tab），不塞进"外观"。chat、dream 各一页。

## 与现有主题系统/mod 系统的关系（地基已有，别另起炉灶）
- 契约 `src/shared/theme/contract.ts` 的 `REQUIRED_TOKENS` 就是"可编辑变量槽"的权威清单——配色编辑器**按它分组**渲染取色器。
- `registry.ts` 已有 day/night 槽位（`getDayNight`/`setSlotTheme`）、主题列表、应用逻辑；自定义预设应作为一种"用户主题"进 registry，day/night 槽能选它。
- mod 系统（`docs/theme-mod-system-spec-v2.md`）：自定义 CSS 注入、圆角 token 化都已规划。**配色编辑器产出的预设 = 只含 token 的最小主题**，导出时写成 `theme.json` 即与 mod 同构。布局类需求一律走 mod，不在配色页做。

## 实现方案

### A. 选色控件（已定：用 react-colorful）
- 引入 **`react-colorful`**（~2KB、零依赖）做 RGB/HSV 色环 + 滑杆，配 hex 输入框双向绑定。`npm i react-colorful`。
- 旧的 `<input type=color>`（dream system 页 ~807）可保留作快速取色入口，但主控件用 react-colorful。

### B. chat 配色页
- 数据：新建一个"用户自定义主题"结构（复用 `ThemeManifest` 的 tokens 形状），存进 `uiPreferences`（沿用现有前缀，别动签名）。一个预设 = `{ id, name, base:'light'|'dark', tokens:{...} }`。
- UI（新 tab "色彩自定义"，组件可放 `src/windows/chat/components/`）：
  - 顶部：当前编辑的是"日间预设"还是"夜间预设"切换（对应 day/night 槽）。
  - 按 `REQUIRED_TOKENS` 分组的取色器列表（每组给中文标签，如"主页面背景 `--paper`"、"正文文字 `--ink`"…）。
  - 预设条：下拉选预设 / 重命名 / 新建 / 删除 / 导出(下载 json) / 导入(读 json)。
  - 编辑实时 `setProperty` 预览（同 `loader.applyTheme` 思路）。
- 落地后，"外观"页的"日间主题/夜间主题"选择器（`ChatWindow.tsx` ~200-204）下拉里应能选到这些用户预设。

### C. dream 配色页（已定：做成 DreamPrefsPane 的一个新 tab）
- dream 不走 chat 主题系统，它有自己的 `--dt-*` token（`DreamTokens.css :root` + `.dream-theme--night`）。
- 在 `DreamPrefsPane.tsx` 的 `DREAM_PREF_TABS`（~171-176）**新增一个 tab「色彩」**（dream 设置本就是模态多 tab，放这最对称，不另起顶栏页），按 `--dt-*` 分组取色，日/夜分别编辑，存进 `dream.appearance` 体系或新键。
- 这块比 chat 多一步：**当前 dream 夜间是大段硬编码覆盖**，要让用户改色，得先把被编辑的那批 `--dt-*` 改成"可被用户变量覆盖"（在 `.dream-theme--day/--night` 上用 `var(--user-xx, 原值)` 兜底）。范围按模块挑关键变量先做，别一次全量。

## 决策（已全部拍板）
- 选色控件：`react-colorful`。
- chat 配色 = 顶栏新 tab「色彩自定义」；dream 配色 = `DreamPrefsPane` 内新 tab「色彩」。

## 验证步骤
- chat：新建一个日间预设把背景/文字大改，保存命名→在外观页日间槽选它→整窗换色；切夜间预设独立生效；导出 json 再导入还原；重启 app 预设还在。
- dream：改 dream 日/夜关键色实时预览生效，未编辑的元素不受影响，玻璃质感不破。
- 回归：paper/dark 内置主题与现有 mod 仍可正常切换（别破坏 registry 既有项）。
