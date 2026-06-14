# 主题 Mod 系统实现规格（交付 Codex 一次性执行）

> 目标读者：执行此文档的编码 Agent（Codex）。
> 本文档是**完整自包含的实现规格**。所有文件路径、变量名、行号均来自真实代码（截至 2026-06-14）。
> 执行原则：严格按"任务分解"逐项落地，不要发明文档之外的接口；遇到与现状冲突处以"现状事实"为准。

---

## 0. 一句话目标

把现在"编译期写死在 `globals.css` 里的 `paper` / `dark` 两套主题"，重构成**运行期数据驱动、可从磁盘即插即用加载的主题 Mod 系统**：用户把一个主题文件夹丢进 `themes/` 目录，应用扫描到后即可在主题选择器里随时切换，无需重新编译。

完成后需满足：

1. 新增主题**不再需要修改 `globals.css`**，只需新增一份主题数据。
2. 主题可在运行期热切换，所有窗口（Chat / Activity / Dream / Pet）即时生效。
3. 存在一份**单一事实来源的 Token 契约**，明确列出"每个主题必须提供哪些变量"——这就是 Mod 作者要实现的接口。
4. 当前 21 处会"漏色"的硬编码颜色全部 token 化。
5. 向后兼容：旧的 `localStorage` 键 `emerald.ui.chat.theme` 仍能读出，`paper` / `dark` 仍作为内置主题存在，行为不退化。

---

## 1. 现状事实（实现前必须理解，不要改变这些既定行为）

### 1.1 技术栈
- Tauri 2 + React 19 + Vite 7 + TypeScript。桌面应用，多窗口（Chat 主窗、Activity 叠加窗、Dream、Pet 独立窗）。
- 入口 `src/main.tsx`，在顶部 `import "./shared/theme/globals.css";`。

### 1.2 现有主题机制（CSS 变量 + data-theme）
- 全局 token 定义在 `src/shared/theme/globals.css`：
  - `:root, :root[data-theme="paper"] { ... }` 定义 paper（亮色）。
  - `:root[data-theme="dark"] { ... }` 定义 dark（暗色）。
- 切换方式：`document.documentElement.setAttribute('data-theme', 'paper' | 'dark')`。
- **两处**写入 data-theme，必须都纳入新系统：
  - `src/windows/chat/ChatWindow.tsx` 第 699–705 行：`useEffect` 监听 `theme` state，写 `data-theme` 并 `setUIPref('chat.theme', theme)`。state 初值 `getUIPref('chat.theme', 'paper')`（第 683 行）。
  - `src/windows/activity/ActivityWindow.tsx` 第 29–40 行：本地 `theme` state（初值同样 `getUIPref('chat.theme', 'paper')`），`handleThemeToggle` 在 paper/dark 间切换并写盘。
- 注意：ChatWindow 第 257 行有一段帮助文案里出现字符串 `:root[data-theme="paper"]`，那是**展示用文本，不是逻辑**，不要动。

### 1.3 偏好存储机制（沿用，勿换方案）
`src/shared/uiPreferences.ts`：
```ts
const STORAGE_PREFIX = 'emerald.ui.';
getUIPref<T>(key, fallback): 读 localStorage[STORAGE_PREFIX+key]，JSON.parse，失败回退
setUIPref<T>(key, value): 写 localStorage[STORAGE_PREFIX+key] = JSON.stringify(value)
```
主题当前持久化在 key `chat.theme`（即 localStorage 实际键 `emerald.ui.chat.theme`）。

### 1.4 全局 Token 契约现状（24 个变量，来自 globals.css）
颜色/表面类（每个主题都必须定义）：
```
--paper  --paper-2  --paper-3  --paper-edge
--ink  --ink-2  --ink-3  --ink-4
--forest  --forest-1  --forest-2  --forest-3  --forest-line
--on-forest  --on-forest-2
--accent  --accent-2  --accent-3  --danger
--paper-grain-1  --paper-grain-2  --shadow-rgb-mix
```
字体类（当前全局共用，主题可选覆盖）：
```
--font-serif  --font-sans  --font-mono
```
> 现有取值用 `oklch(...)`，paper 与 dark 各一套。新系统要把这两套值抽成数据。

### 1.5 第二套 Token 命名空间：Dream（`--dt-*`，38 个）
`src/features/dream/DreamTokens.css` 定义了一整套独立 token，前缀 `--dt-`，**只定义在 `:root`，不随 data-theme 变化**（即 Dream 目前不跟随亮/暗主题）。完整清单：
```
背景:   --dt-bg-1 --dt-bg-2 --dt-bg-3
表面:   --dt-surface --dt-surface-2 --dt-surface-deep
墨色:   --dt-ink --dt-ink-2 --dt-ink-3 --dt-ink-4
花色:   --dt-flower-daisy --dt-flower-rose --dt-flower-dandelion --dt-flower-bluebell --dt-flower-sun
边框:   --dt-border --dt-border-soft
模糊:   --dt-blur-sm --dt-blur-md --dt-blur-lg
阴影:   --dt-shadow-rest --dt-shadow-glow --dt-shadow-bloom
发光:   --dt-glow-warm --dt-glow-cool --dt-glow-soft
玻璃:   --dt-glow-glass-bg --dt-glow-glass-border --dt-glow-glass-shadow --dt-glow-glass-sheen --dt-glow-glass-blur
气泡:   --dt-glow-bubble-bg --dt-glow-bubble-border --dt-glow-bubble-shadow
动画:   --dt-anim-breath --dt-anim-drift --dt-anim-bloom --dt-anim-slow
```
> `DreamTokens.css` 对每个变量做了 sRGB fallback + `@supports (color: oklch(...))` 升级。重构时保留这种渐进增强写法的思路（见任务 E）。

### 1.6 其它局部 token
- `src/shared/ui/TypingDots.css` 用 `var(--typing-dots-color)`（局部组件变量，非主题级，可不纳入契约，但加载器注入后不应破坏它）。

### 1.7 现有"扫描磁盘目录"先例 —— 主题加载要照抄这套
字体功能已经实现了"Rust 扫描 public 子目录 → 前端动态使用"的完整链路，**主题 Mod 直接复用同款架构**：
- Rust：`src-tauri/src/lib.rs`
  - `dream_fonts_dev_dir()`（第 113 行）：开发期返回 `<项目根>/public/fonts`。
  - `dream_fonts_dir(app)`（第 121 行）：运行期优先 `app.path().resource_dir().join("fonts")`，debug 下 fallback 到 dev 目录。
  - `list_dream_fonts_in_dir(dir)`（第 159 行）：`fs::read_dir` 遍历，过滤扩展名，返回 `Vec<{fileName,label,url}>` 的 `serde_json::Value`。
  - `#[tauri::command] list_dream_fonts(app)`（第 194 行），注册在 `.invoke_handler(generate_handler![... list_dream_fonts ...])`（第 1230/1240 行附近）。
- 前端：`src/shared/fontAppearance.ts` 用 `invoke('list_dream_fonts')` 拿清单；字体文件通过静态 URL `/fonts/<file>` 访问（Vite dev 直接服务 `public/fonts/`，prod 走打包资源）。
- 静态资源 URL（`/fonts/...`）没有自定义 uri scheme，就是普通 web 静态资源。**主题 CSS 同理放 `public/themes/` 即可用 `/themes/...` 访问。**

---

## 2. 设计决策（Codex 按此实现，不要另起方案）

**D1. 主题 = Manifest(JSON) + 一组 CSS 变量值。** 不再用 `:root[data-theme=x]{}` 选择器堆叠。

**D2. 运行期注入用 `element.style.setProperty`。** 加载器把主题的变量逐条写到 `document.documentElement` 上（行内样式，优先级最高，天然覆盖 CSS 文件里的默认值）。切换主题 = 先清掉上一套变量，再写新一套。**保留** `data-theme` 属性同步设置（值为主题 id），以兼容仍依赖该属性的 CSS（如 globals.css 里 dark 专属规则在过渡期内可保留）。

**D3. 主题来源分两层，合并成一个列表：**
- 内置（built-in）：随包发布，定义在 TS 数据里（`paper`、`dark` 至少这两个，值从现 globals.css 迁移而来）。
- 磁盘（disk mod）：`public/themes/<id>/theme.json`（开发期）或 resource 目录（运行期）。由新增 Rust 命令 `list_themes` 扫描返回。

**D4. Token 契约是单一事实来源。** 新建 `src/shared/theme/contract.ts`，用 TS 常量数组 + 类型导出"主题必须/可选提供的变量名全集"。加载器、校验器、内置主题都引用它。

**D5. Dream 的 `--dt-*` 暂作为"独立子契约层"纳入，不强行合并语义。** 即契约分两组：`core`（24 个全局变量）和 `dream`（38 个 `--dt-*`）。主题可只提供 core；若不提供 dream 组，则回退到 `DreamTokens.css` 内置默认值（因此 `DreamTokens.css` 仍保留作为 fallback 定义，但其值要可被加载器覆盖——见任务 E）。

**D6. 向后兼容键。** 沿用 `setUIPref('chat.theme', <themeId>)`。读取时若旧值是 `'paper'`/`'dark'` 直接当主题 id 用，天然兼容。

---

## 3. 目标文件结构

```
public/themes/                      # 磁盘 mod 根目录（开发期）
  paper/theme.json                  # 内置主题也各放一份样例（可选，主要给 mod 作者参考）
  dark/theme.json
  _example-mod/theme.json           # 一份范例 mod，演示最小可用主题

src/shared/theme/
  contract.ts        # 【新】Token 契约：CORE_TOKENS / DREAM_TOKENS / 类型
  types.ts           # 【新】ThemeManifest / ThemeRecord 等 TS 类型
  builtinThemes.ts   # 【新】paper / dark 的变量值数据（从 globals.css 迁移）
  loader.ts          # 【新】applyTheme / clearTheme：运行期 setProperty 注入 + 校验
  registry.ts        # 【新】内置 + 磁盘合并、加载、订阅、当前主题状态
  globals.css        # 【改】移除 paper/dark 的具体取值块，只留结构性默认与一份兜底
  DreamTokens.css → 保持位置，见任务 E

src-tauri/src/lib.rs # 【改】新增 list_themes / read_theme_manifest 命令 + 注册
```

---

## 4. 数据结构定义

### 4.1 `src/shared/theme/contract.ts`
```ts
// 单一事实来源：每个主题必须/可选提供的 CSS 变量名。
// 改这里 = 改契约。加载器、校验、内置主题全部引用此处。

/** 核心颜色/表面变量——主题必须全部提供。变量名不含前导 -- 由消费方拼接，也可直接含。统一用含 -- 形式。 */
export const CORE_TOKENS = [
  '--paper', '--paper-2', '--paper-3', '--paper-edge',
  '--ink', '--ink-2', '--ink-3', '--ink-4',
  '--forest', '--forest-1', '--forest-2', '--forest-3', '--forest-line',
  '--on-forest', '--on-forest-2',
  '--accent', '--accent-2', '--accent-3', '--danger',
  '--paper-grain-1', '--paper-grain-2', '--shadow-rgb-mix',
] as const;

/** 字体变量——可选；主题不提供时用 globals.css 默认。 */
export const FONT_TOKENS = ['--font-serif', '--font-sans', '--font-mono'] as const;

/** 新增的游戏/状态色变量（任务 F 引入），主题必须提供（内置主题给默认值）。 */
export const GAME_TOKENS = [
  '--board-light', '--board-dark', '--board-select', '--board-target-light', '--board-target-dark',
  '--board-coord-light', '--board-coord-dark',
  '--goban-bg', '--goban-line', '--stone-black-core', '--stone-black-edge',
  '--stone-white-core', '--stone-white-edge', '--stone-black-border', '--stone-white-border',
  '--status-connecting', '--status-error',
  '--flower-calm', '--flower-bright', '--flower-low', '--flower-yandere', '--flower-adrift', '--flower-default',
] as const;

/** Dream 子契约——可选；不提供时回退 DreamTokens.css 内置值。 */
export const DREAM_TOKENS = [
  '--dt-bg-1','--dt-bg-2','--dt-bg-3',
  '--dt-surface','--dt-surface-2','--dt-surface-deep',
  '--dt-ink','--dt-ink-2','--dt-ink-3','--dt-ink-4',
  '--dt-flower-daisy','--dt-flower-rose','--dt-flower-dandelion','--dt-flower-bluebell','--dt-flower-sun',
  '--dt-border','--dt-border-soft',
  '--dt-blur-sm','--dt-blur-md','--dt-blur-lg',
  '--dt-shadow-rest','--dt-shadow-glow','--dt-shadow-bloom',
  '--dt-glow-warm','--dt-glow-cool','--dt-glow-soft',
  '--dt-glow-glass-bg','--dt-glow-glass-border','--dt-glow-glass-shadow','--dt-glow-glass-sheen','--dt-glow-glass-blur',
  '--dt-glow-bubble-bg','--dt-glow-bubble-border','--dt-glow-bubble-shadow',
  '--dt-anim-breath','--dt-anim-drift','--dt-anim-bloom','--dt-anim-slow',
] as const;

export const REQUIRED_TOKENS = [...CORE_TOKENS, ...GAME_TOKENS] as const;
export const OPTIONAL_TOKENS = [...FONT_TOKENS, ...DREAM_TOKENS] as const;
export const ALL_TOKENS = [...REQUIRED_TOKENS, ...OPTIONAL_TOKENS] as const;

export type TokenName = (typeof ALL_TOKENS)[number];
```

### 4.2 `src/shared/theme/types.ts`
```ts
import type { TokenName } from './contract';

export interface ThemeManifest {
  /** 唯一 id，需与文件夹名一致；内置为 'paper' | 'dark' */
  id: string;
  /** 展示名 */
  name: string;
  /** 作者，可选 */
  author?: string;
  /** 语义版本，可选 */
  version?: string;
  /** 'light' | 'dark'，用于 UI 分组与 data-theme 兼容映射，可选 */
  base?: 'light' | 'dark';
  /** 变量名 → 取值。键应为 TokenName；允许多余键（忽略）。 */
  tokens: Partial<Record<TokenName, string>> & Record<string, string>;
}

export type ThemeSource = 'builtin' | 'disk';

export interface ThemeRecord {
  manifest: ThemeManifest;
  source: ThemeSource;
}
```

### 4.3 `public/themes/<id>/theme.json` 文件格式（即 Mod 作者要写的东西）
```json
{
  "id": "midnight-sakura",
  "name": "午夜樱",
  "author": "chacha",
  "version": "1.0.0",
  "base": "dark",
  "tokens": {
    "--paper": "oklch(0.16 0.02 330)",
    "--ink": "oklch(0.92 0.01 330)",
    "--accent": "oklch(0.72 0.16 350)",
    "...": "其余 REQUIRED_TOKENS 全部给值"
  }
}
```
> 校验规则：缺少任一 `REQUIRED_TOKENS` 则该主题标记为 invalid，不进选择器，控制台 warn 列出缺失项。`OPTIONAL_TOKENS` 缺失则该变量回退到 CSS 文件默认值。

---

## 5. 任务分解（按顺序执行）

### 任务 A — 建立契约与内置主题数据
1. 新建 `contract.ts`、`types.ts`（内容见 §4.1/§4.2）。
2. 新建 `builtinThemes.ts`：把 `globals.css` 中 `paper` 段与 `dark` 段的**每个变量取值**原样搬成两个 `ThemeManifest` 对象（`id:'paper'`/`'dark'`，`base` 相应填 `light`/`dark`，`tokens` 填全 CORE + 新 GAME tokens 默认值）。GAME tokens 的默认值见任务 F 的"建议取值"。导出 `BUILTIN_THEMES: ThemeManifest[]`。
3. 不要在此步删 globals.css 的取值（任务 G 收尾再清，避免中途白屏）。

### 任务 B — 运行期加载器 `loader.ts`
实现并导出：
```ts
import { ALL_TOKENS, REQUIRED_TOKENS } from './contract';
import type { ThemeManifest } from './types';

/** 把上一次注入的变量记下来，便于切换时清理 */
let appliedKeys: string[] = [];

/** 返回缺失的必需变量列表（空数组=合法） */
export function validateTheme(m: ThemeManifest): string[] {
  return REQUIRED_TOKENS.filter(k => !(k in m.tokens) || !m.tokens[k]);
}

export function applyTheme(m: ThemeManifest): void {
  const root = document.documentElement;
  // 清掉上一套
  for (const k of appliedKeys) root.style.removeProperty(k);
  appliedKeys = [];
  // 写入新一套（只写契约内的键，避免注入垃圾）
  for (const k of ALL_TOKENS) {
    const v = m.tokens[k];
    if (v != null && v !== '') { root.style.setProperty(k, v); appliedKeys.push(k); }
  }
  // 兼容：同步 data-theme（值用 base 或 id）
  root.setAttribute('data-theme', m.base ?? m.id);
}
```
要点：只注入契约内变量；切换前清理旧键，杜绝残留。

### 任务 C — 注册中心 `registry.ts`
职责：合并内置 + 磁盘主题、加载、当前主题状态、订阅通知、持久化。导出大致：
```ts
listThemes(): Promise<ThemeRecord[]>      // 内置 + invoke('list_themes')；按 id 去重，磁盘可覆盖同 id 内置
getCurrentThemeId(): string               // getUIPref('chat.theme', 'paper')
setTheme(id: string): Promise<void>       // 找到 record → applyTheme → setUIPref('chat.theme', id) → 通知订阅者
subscribe(fn: () => void): () => void     // 供多窗口/选择器刷新
initTheme(): Promise<void>                // 启动时调用：取当前 id，找不到回退 'paper'，applyTheme
```
- 磁盘主题通过 `invoke<ThemeManifest[]>('list_themes')` 获取（见任务 D）。对每个跑 `validateTheme`，非法者过滤并 `console.warn`。
- `setTheme` 找不到 id 时回退到 `paper` 并 warn，不抛异常。

### 任务 D — Tauri Rust 命令（照抄字体实现）
在 `src-tauri/src/lib.rs` 仿照 `dream_fonts_*` 增加：
1. `themes_dev_dir()` → `<项目根>/public/themes`（仿 `dream_fonts_dev_dir`，把 `"fonts"` 换 `"themes"`）。
2. `themes_dir(app)` → 运行期 `resource_dir().join("themes")`，debug fallback 到 dev 目录（仿 `dream_fonts_dir`）。
3. `#[tauri::command] list_themes(app) -> Result<serde_json::Value, String>`：
   - `fs::read_dir(themes_dir)`，对每个**子目录**读取其中的 `theme.json`；
   - `serde_json::from_str` 解析为 object，原样塞进结果数组（前端再校验）；解析失败的目录跳过并 `eprintln!` warn；
   - 返回 `serde_json::Value::Array`。
4. 在 `.invoke_handler(tauri::generate_handler![ ... ])`（约第 1230–1240 行）的列表里追加 `list_themes`。
5. 让 `public/themes/` 打包进 resource：`src-tauri/tauri.conf.json` 第 41–42 行现为
   ```json
   "resources": {
     "../public/fonts/": "fonts/"
   }
   ```
   在其中**追加一行** `"../public/themes/": "themes/"`，与字体完全同机制。
> 不需要新增 fs 插件权限——这是自定义命令，走 `invoke`，与现有字体命令同权限模型。

### 任务 E — 统一 / 兼容 Dream `--dt-*` 层
目标：让主题能覆盖 `--dt-*`，同时 `DreamTokens.css` 继续作为默认兜底。
1. 保留 `DreamTokens.css` 现有 `:root { --dt-*: ... }` 作为默认值（加载器用 `setProperty` 注入的行内值优先级更高，可覆盖之，无需改 CSS 选择器结构）。
2. 在 `builtinThemes.ts` 里，为 `paper` 与 `dark` 选填 `--dt-*`：paper 用 DreamTokens.css 现有值；dark 给一套压暗版本（可由现值降明度近似，不必精确）。这样切到 dark 时 Dream 也跟随变暗（修复"Dream 不跟随主题"的现状）。
3. `--dt-*` 列入 `OPTIONAL_TOKENS`：主题不提供则保留 CSS 默认，提供则覆盖。
4. DreamTokens.css 里的 `@supports oklch` 渐进增强块保持不动（那是 sRGB→oklch 兜底，与本系统正交）。

### 任务 F — 消灭硬编码颜色（21 处，全部 token 化）
为每处新增/复用 GAME_TOKENS（见 §4.1），在 `builtinThemes.ts` 给 paper/dark 默认值（建议取值即各处原硬编码值，dark 可微调）。逐条改动：

**`src/windows/activity/components/ChessPage.tsx`**（棋盘）
- L128 `isLight ? '#f0d9b5' : '#b58863'` → `var(--board-light)` / `var(--board-dark)`
- L129 `'#f6f669'`（选中） → `var(--board-select)`
- L130 `isLight ? '#cdd16f' : '#aaa23a'`（落点提示） → `var(--board-target-light)` / `var(--board-target-dark)`
- L150 & L157 `isLight ? '#b58863' : '#f0d9b5'`（坐标字） → `var(--board-coord-light)` / `var(--board-coord-dark)`
- L167/L177/L186 的 `rgba(0,0,0,*)`（投影/遮罩）：可保留（中性黑半透明，主题无关），或引入 `--shadow-rgb-mix`，**优先保留**以降风险。

**`src/windows/activity/components/GomokuPage.tsx`**（五子棋）
- L107 `background:'#dcb967'` → `var(--goban-bg)`
- L108/L122/L127/L134 `'#8b6914'`（木纹线/星位） → `var(--goban-line)`
- L169 `radial-gradient(... #555, #111)`（黑子） → `radial-gradient(circle at 35% 35%, var(--stone-black-core), var(--stone-black-edge))`
- L170 `radial-gradient(... #fff, #ccc)`（白子） → `var(--stone-white-core)` / `var(--stone-white-edge)`
- L171 黑子 `1px solid #000` / 白子 `1px solid #999` → `var(--stone-black-border)` / `var(--stone-white-border)`
- L172 `rgba(0,0,0,0.45)` 投影：保留。

**`src/windows/chat/components/Ribbon.tsx`**（连接状态灯）
- L99 `connState==='connecting' ? '#f0b429' : '#e53e3e'` → `var(--status-connecting)` / `var(--status-error)`

**`src/windows/chat/components/SubGarden.tsx`**（情绪花色映射表 `FLOWER_COLOR`）
- L10–14 `calm/bright/low/yandere/adrift` 五个 hex → `var(--flower-calm)` 等五个变量
- L89 兜底 `'#8a8a8a'` → `var(--flower-default)`

**`src/windows/dream/components/DreamSidebar.tsx`** 与 **`DreamStatusSidebar.tsx`**（HudMetric 渐变里混入的裸 hex）
- DreamSidebar L138/L143/L148、DreamStatusSidebar L135/L136/L137/L145/L152 中的 `#e96c6c` `#b97fe8` `#7fbfe8` 等：这些是 Dream 配色，应改用 `--dt-*` 变量。新增三个 dream 子色：`--dt-accent-rose`(#e96c6c)、`--dt-accent-violet`(#b97fe8)、`--dt-accent-azure`(#7fbfe8)，加入 DREAM_TOKENS 与 DreamTokens.css 默认值，再把这些 `linear-gradient(...)` 里的裸 hex 替换成对应 `var(--dt-accent-*)`。

**Pet 窗口**（`PetWindow.tsx` / `ParticleCanvas.tsx`）的 `rgba(...)`：Pet 是透明悬浮窗，配色独立且与主题弱相关。**本期不纳入契约**，保持现状（如需可在文末"后续可选"提到）。

> 验证：改完后全仓库 `grep -rEn "#[0-9a-fA-F]{3,8}" src --include=*.tsx` 应只剩 §1.6 类无害项或被明确豁免的（Pet、中性 rgba 投影）。把豁免清单写进 PR 描述。

### 任务 G — 主题选择器 UI + 收尾切换
1. **接管两个 toggle**：
   - `ChatWindow.tsx`：现有 `theme` state 与第 699–705 行 effect 改为走 `registry`。即 `theme` state 改存 themeId 字符串；effect 改为 `registry.setTheme(themeId)`（内部已处理 applyTheme + 持久化）。保留 state 以驱动 UI 高亮。
   - `ActivityWindow.tsx`:`handleThemeToggle` 改为在可用主题列表中循环切换，或直接复用下方选择器组件。
2. **新增主题选择器组件**（建议 `src/shared/theme/ThemePicker.tsx`）：`useEffect` 里 `registry.listThemes()` 拿全部主题，渲染成列表/下拉，按 `base`（light/dark）分组，当前项高亮；点击调 `registry.setTheme(id)`。订阅 `registry.subscribe` 以跨窗口刷新。放进 Chat 偏好面板（prefsOpen）和 Activity 设置页中合适位置（参考现有 paper/dark 开关所在处）。
3. **启动初始化**：在 `main.tsx`（或各窗口顶层）调用一次 `registry.initTheme()`，确保刷新后恢复上次主题。注意 Pet 窗口（`isPetWindow`）也应 `initTheme()` 以继承变量（即便 Pet 配色独立，全局变量仍可能被其子组件引用）。
4. **清理 globals.css**：确认加载器在所有入口都会先 `initTheme()` 后，再把 `globals.css` 里 `paper`/`dark` 的**具体取值块**精简——保留一份 `:root{}` 默认（等同 paper 的值，作为 JS 未执行时的 FOUC 兜底），删除 `:root[data-theme="dark"]{...}` 的取值堆叠（其职责已转移给加载器）。`globals.css` 中结构性规则（`* {box-sizing}`、滚动条、`body::before` 纹理、`.serif/.mono/.smcaps/.hairline` 等）**全部保留**。

### 任务 H — 范例 Mod + 文档
1. 在 `public/themes/` 放 `paper/theme.json`、`dark/theme.json`（与内置数据同值，给作者参考）和一份 `_example-mod/theme.json`（一套明显不同的配色，验证磁盘加载链路）。
2. 新增 `public/themes/README.md`：说明 Mod 作者怎么写主题——目录结构、`theme.json` 字段、必填变量清单（从 contract 复制）、放置位置、热加载方式。

---

## 6. 验收标准（Codex 自检清单）

功能：
- [ ] 启动应用，默认主题与重构前视觉一致（paper）。
- [ ] 切到 dark，全窗口（Chat/Activity/Dream）即时变暗，含原先漏色的棋盘/五子棋/状态灯/花色。
- [ ] 在 `public/themes/` 新建一个文件夹放 `theme.json`，**重启 dev** 后主题选择器出现该主题，可切换生效。
- [ ] 删除某主题 `theme.json` 里一个必需变量，该主题不出现在选择器，控制台 warn 指出缺失项。
- [ ] 刷新页面后保持上次所选主题（localStorage `emerald.ui.chat.theme`）。
- [ ] 旧值兼容：手动把 localStorage 该键设为 `"paper"`/`"dark"` 仍正确加载。

代码质量：
- [ ] `npm run build`（`tsc && vite build`）通过，无类型错误。
- [ ] `src-tauri` `cargo check` 通过，`list_themes` 已注册进 `generate_handler!`。
- [ ] 全仓 `grep -rEn "#[0-9a-fA-F]{3,8}" src --include=*.tsx` 仅剩豁免项（Pet、中性投影 rgba），并在 PR 描述列出豁免清单。
- [ ] `contract.ts` 是唯一定义变量名清单处；加载器/校验/内置主题均 import 之，无重复硬编码清单。

回归：
- [ ] 字体功能（`list_dream_fonts` / 动态字体）不受影响。
- [ ] Dream 玻璃发光、气泡、动画视觉不破。
- [ ] Pet 窗口正常显示。

---

## 7. 约束与红线（不要做这些）

- 不引入新的样式方案（不上 Tailwind / CSS-in-JS / styled-components）；继续用 CSS 变量 + 现有内联 `style={{}}` 引用 `var(--x)` 的模式。
- 不改 `uiPreferences.ts` 的存储前缀或 API 签名；主题键继续用 `chat.theme`。
- 不删 `globals.css` 的结构性/排版规则，只动 paper/dark 的颜色取值块。
- 不动 ChatWindow 第 257 行那段展示用文本字符串。
- 不为主题加载新增 Tauri fs 插件；用自定义 `invoke` 命令（与字体一致）。
- 不把 Pet 窗口配色强行纳入契约（本期范围外）。
- 主题切换出错一律 graceful fallback 到 `paper` + `console.warn`，不得抛未捕获异常导致白屏。

---

## 8. 后续可选（本期不做，留作 backlog）
- 主题导入/导出按钮（用已依赖的 `@tauri-apps/plugin-dialog` 选 `theme.json` 拷进 themes 目录）。
- 主题实时预览（hover 即试色，离开还原）。
- 把 Pet 窗口配色也纳入一套 `--pet-*` 子契约。
- 主题级字体包（与现有 `fontAppearance` 联动，让主题可指定 `--font-*` 指向某字体文件）。
- 主题缩略图（manifest 加 `preview` 字段指向一张图）。

---

### 附：执行顺序建议
A → B → C → D → E → F → G → H。其中 D（Rust）可与 A/B/C 并行；G 的"清理 globals.css"务必放最后、确认 init 链路无误后再做，避免中途 FOUC/白屏。
