# Brief 02 · 梦境聊天框/旁白单独可调 + 自定义（②）& 日间背景灰（③）

## 一、日间背景为什么是灰的 / "有东西挡住"（③）—— 已定位强嫌疑

文件 `src/features/dream/DreamTokens.css`：

- `.dream-theme__canvas`（~166–181）：日间画布是**彩色**渐变（`--dt-bg-1/2/3` 奶油/淡紫/薄荷 + 四角花色 radial），本身不灰。
- `.dream-theme__chat`（~341–356）：聊天主区域自带一层**白色蒙版**叠加：
  ```
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.58), rgb(255 255 255 / 0.38)),
    radial-gradient(... rgb(172 203 233 / 0.24) ...),
    var(--dt-surface);            /* = rgb(255 255 255 / 0.50) */
  ```
- `.dream-theme__chat-background`（~358–367）：用户导入的背景图 opacity 0.68 且被 `::after`（~369–374）再盖一层白（0.20→0.36）。

**结论**：聊天区是整屏主体，画布只在边缘/侧栏后露出。聊天区被 `白0.58→0.38 + dt-surface(白0.50)` 多层半透明白蒙住 → 没有导入背景时就是一片"发灰的白"，导入背景也被压暗发灰。夜间因为 `--dt-surface` 是深蓝 `rgb(18 26 46 /0.72)`（见 `.dream-theme--night`），反而正常。所以"有东西挡住"= 这层日间白蒙版/`::after`。

### 修法（CC 二选一，先 A 验证）
- **A（推荐）**：日间下让 `.dream-theme__chat` 背景透明或大幅降低白蒙版（删掉那条 `linear-gradient(白0.58→0.38)`，或降到 ~0.12），让彩色画布/导入背景透上来；`.dream-theme__chat-background::after` 日间那层白也调淡。
- **B**：保留蒙版但把 `--dt-surface` 日间值从白改成带色/更透，并给"背景模糊+透明度"一个用户可调项。
- 临时验证手段：注释掉 `.dream-theme__chat` 的白渐变那一行，截图看画布是否透出。

> 注意只动**日间**，别改到 `.dream-theme--night` 的深蓝表面（夜间现状是好的）。

## 二、梦境聊天框/旁白单独可调 + 自定义（②）

### 现状
- 回复按 `NarrativeSegment` 分段渲染，类型见 `src/shared/api/types.ts`：`'say' | 'do' | 'env' | 'feel' | 'narration'`。
- 渲染在 `src/windows/dream/components/DreamChatPanel.tsx`：`say` 走对话气泡 `.dream-segment-say*`；其余（旁白/动作/环境/心理）走 `.dream-segment--{type}`。
- 样式在 `DreamTokens.css`：`.dream-segment--narration`(~1274)、`--do`(~1239)、`--feel`(~1250)、`--env`(~1260)、say 气泡(~1198–1225)。
- 当前可调外观只有 `src/shared/dreamAppearance.ts` 的 `DreamAppearance`：`chatFontSize / themeFontSize / fontFile / accentColor / savedColors / backgroundBlur`——**没有针对旁白的任何独立设置**。
- 设置 UI 在 `DreamPrefsPane.tsx` 的「3·系统设置」分支（tab==='system'，~754–889）。

### 方案
1. `DreamAppearance` 扩字段，例如 `narrationColor`、`narrationItalic`、`narrationFontScale`（旁白相对正文的字号比），按需再加 `asideOpacity` 等。在 `loadDreamAppearance/DEFAULT_APPEARANCE` 加默认值与 clamp/校验。
2. `DreamWindow.tsx`（~273 那个 style 对象，已经在注入 `--dream-chat-font-size` 等）追加 CSS 变量：`--dream-narration-color` 等。
3. `DreamTokens.css` 的 `.dream-segment--narration`(及 env/feel/do 视需求) 改用这些变量。
4. 「3·系统设置」页加一组"旁白样式"控件（取色器 + 斜体开关 + 字号滑杆），复用现有 `SettingRow`/取色器写法（同页 accentColor 那段 ~804–829 可抄）。

### 决策点
- 旁白自定义要做到多细？最小=颜色+斜体+字号；进阶=每种 segment（say/do/env/feel/narration）各自可调。建议先做"旁白(narration)+环境(env)"两类，其余沿用主题。

## 验证步骤
- ③：日间进入梦境（无背景图 & 有背景图各一次）截图，确认不再是灰白、画布/背景透出；夜间不受影响。
- ②：改旁白颜色/斜体/字号后，发一条含旁白的回复，截图确认只影响旁白、对话气泡不变；重启 app 持久化仍在。
