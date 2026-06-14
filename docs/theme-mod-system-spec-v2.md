# 主题 Mod 系统 增量规格 v2（交付 Claude Code 一次性执行）

> 前置：v1（`docs/theme-mod-system-spec.md`）已落地——契约 `src/shared/theme/contract.ts`、加载器 `loader.ts`、注册中心 `registry.ts`、`builtinThemes.ts`、`ThemePicker.tsx`、Rust `list_themes` 均已存在并工作。
> 本 v2 在其上增量加三件事，**互相独立、可在同一分支一起做**：
> 1. 聊天背景图（把 Dream 现成逻辑搬到 Chat，外观面板里更换）
> 2. 主题自定义 CSS 注入（带安全检测，不过直接报错不启用）
> 3. 圆角 / 边框 token 化（让 mod 能调"圆润 vs 硬朗"）
>
> 三者能否一块做：**能**。见 §0 冲突分析。执行原则同 v1：严格按步骤，以"现状事实"为准，不发明文档外接口；出错一律 graceful fallback + `console.warn`，不得白屏。

---

## 0. 冲突分析（回答"3 个能不能一块做"）

| 特性 | 主要触碰文件 | 与其它特性是否共享文件 |
|---|---|---|
| ① 聊天背景图 | `avatarStore`、`lib.rs`(角色白名单)、`ChatWindow.tsx`、`chatAppearance.ts`、`globals.css`(新 class) | 仅 `globals.css` 末尾追加，与③不重叠区域 |
| ② 自定义 CSS 注入 | `types.ts`、`loader.ts`、`registry.ts`、新 `cssGuard.ts` | 仅 `contract/types` 这层，与③加常量不冲突 |
| ③ 圆角/边框 token | `contract.ts`、`builtinThemes.ts`、各组件 + `globals.css` | 与①都改 `globals.css`，但各加各的块，不冲突 |

结论：无真正冲突。推荐落地顺序 **③ → ② → ①**（③是契约层地基，先定 token；②加完 manifest 字段；①最独立放最后）。可一个 PR 三个 commit，也可拆三个 PR。

---

# 特性 ① 聊天背景图

## ①.1 现状事实（Dream 的现成实现，照搬即可）

**存储层**（`src/shared/avatars/store.ts`）：Dream 背景已有完整链路。
- 类型 `DreamBackgroundTone = 'day' | 'night'`，`dreamBackgrounds: Record<tone, {path, dataUrl}>`。
- `setDreamBackground(tone, blob)`：blob→base64→`invoke('save_avatar', {role:'dream_background_'+tone, imageB64})` 拿到 path，存 dataUrl，落 `write_avatars_json`。
- `clearDreamBackground(tone)`、`init()` 时 `load_avatar` 还原 dataUrl。
- `subscribe(fn)` 通知变化。

**Rust 白名单**（`src-tauri/src/lib.rs` 第 73 行 `is_known_avatar_role`）：
```rust
matches!(role, "her" | "you" | "dream_background_day" | "dream_background_night")
```
`save_avatar`（第 565 行）开头 `if !is_known_avatar_role(&role) { return Err(...) }`——**新角色必须加进白名单否则保存被拒**。

**裁剪器**（`src/windows/dream/components/DreamBackgroundCropper.tsx`）：用 `react-easy-crop`，16:9，输出 1920×1080 blob。可直接复用，无需新建。

**应用层**（`src/windows/dream/DreamWindow.tsx`）：
- 第 239 行在容器 style 注入 `'--dream-background-blur': `${appearance.backgroundBlur}px``。
- 第 290–296 行：`{backgroundDataUrl && <div className="dream-theme__chat-background" style={{backgroundImage:`url("${dataUrl}")`}} aria-hidden/>}`。
- CSS（`src/features/dream/DreamTokens.css` 第 358–376 行）：`.dream-theme__chat-background` 绝对定位、`inset: calc(-1 * blur)`、`filter: blur(var(--dream-background-blur))`，`::after` 加半透明遮罩压暗，`.dream-theme__chat > :not(.dream-theme__chat-background)` 抬到背景之上。

**外观偏好**（`src/shared/dreamAppearance.ts`）：`DreamAppearance.backgroundBlur:number`，默认 18，clamp 0–36；UI 在 `DreamPrefsPane.tsx` 第 857 行一个 range 滑块。

**Chat 外观面板现状**（`src/windows/chat/ChatWindow.tsx`）：组件 `PreferencesPanel`（第 46 行），`tab==='appearance'`（第 131 行）已含主题选择器、字号、字体包、头像分区，且**已 import 并使用 `AvatarCropper`**（第 28/89 行）。Chat 内容根是第 848 行 `<div ref={bodyRef} style={{flex:1,display:'flex',...,position:'relative'}}>`——已 `position:relative`，背景 div 挂这里。`chatAppearance` 状态见第 676 行，类型 `ChatAppearance`（`src/shared/chatAppearance.ts`），目前有 `chatFontSize/themeFontSize/fontFile`。

## ①.2 设计决策

- Chat 不再有 day/night 概念（已被任意主题取代），因此**聊天背景只存一张**（不分色调），角色名 `chat_background`。这是最贴近"搬过来就好"的最小实现。
  - （可选增强，本期不强制）若想让亮/暗主题各配一张，可按当前主题 `base`('light'/'dark') 存两张，角色 `chat_background_light/dark`——结构同 Dream 的 day/night。是否做留给后续。
- 模糊度复用 Dream 思路，存进 `ChatAppearance.backgroundBlur`。
- 裁剪复用现成 `DreamBackgroundCropper`（不要复制一份；直接 import 跨窗口用，它无 Dream 专属依赖）。

## ①.3 实现步骤

**步骤 A — Rust 白名单**（`src-tauri/src/lib.rs` 第 73 行）：
```rust
matches!(role,
  "her" | "you"
  | "dream_background_day" | "dream_background_night"
  | "chat_background")            // ← 新增
```

**步骤 B — avatarStore 扩展**（`src/shared/avatars/store.ts`）：
- `AvatarConfig` 加 `chatBackground: { path: string | null; dataUrl: string | null }`，初值全 null。
- `AvatarsJson` 加可选 `chat_background?: { path: string } | null`。
- `emit()` 快照、`init()`（仿 `loadDreamBackground` 加载 `data.chat_background?.path`）、`saveJson()`（写 `chat_background`）都补上 chatBackground。
- 新增 `setChatBackground(blob)` 与 `clearChatBackground()`，逻辑照 `setDreamBackground`/`clearDreamBackground`，role 用 `'chat_background'`。

**步骤 C — chatAppearance 加 blur**（`src/shared/chatAppearance.ts`）：
- `ChatAppearance` 加 `backgroundBlur: number`；`DEFAULT_APPEARANCE.backgroundBlur = 18`。
- `loadChatAppearance` 里 `backgroundBlur: clamp(saved.backgroundBlur, 18, 0, 36)`。

**步骤 D — Chat 渲染背景 div**（`src/windows/chat/ChatWindow.tsx`）：
- 顶层组件加 state：`const [chatBackground, setChatBackground] = useState(() => avatarStore.get().chatBackground)`，并 `useEffect(()=>avatarStore.subscribe(c=>setChatBackground(c.chatBackground)),[])`（参考 DreamWindow 第 64–67 行）。
- 在第 848 行那个 `bodyRef` 容器**内、作为第一个子元素**插入：
  ```tsx
  {chatBackground.dataUrl && (
    <div className="chat-ui__background"
         style={{ backgroundImage: `url("${chatBackground.dataUrl}")` } as CSSProperties}
         aria-hidden="true" />
  )}
  ```
- 该容器 style 注入模糊变量：在 `bodyRef` 容器 style 上加 `'--chat-background-blur': `${appearance.backgroundBlur}px``（容器已是 inline style 对象，追加即可；类型用 `as CSSProperties`）。

**步骤 E — CSS**（追加到 `src/shared/theme/globals.css` 末尾，照搬 Dream 的写法）：
```css
.chat-ui__background {
  position: absolute; inset: calc(-1 * var(--chat-background-blur, 18px));
  z-index: 0; background-size: cover; background-position: center;
  filter: blur(var(--chat-background-blur, 18px));
  pointer-events: none;
}
.chat-ui__background::after {
  content: ""; position: absolute; inset: 0;
  background: var(--paper); opacity: 0.62;       /* 遮罩压淡，保证文字可读；可按观感调 */
}
/* 让背景之上的内容浮起来 */
#root .chat-ui [ref] { } /* 占位说明：见下 */
```
> 关键：`bodyRef` 容器的**其它直接子节点**（侧栏、Divider、ChatPanel 包裹层）必须 `position: relative; z-index: 1`，否则被背景盖住。最稳妥做法：给那几个子节点各自 inline `style` 补 `position:'relative', zIndex:1`，或在容器加一条 `.chat-ui__body > *:not(.chat-ui__background){ position:relative; z-index:1; }` 并给容器加类名 `chat-ui__body`。**采用后者**：给第 848 行容器加 `className="chat-ui__body"`，CSS：
```css
.chat-ui__body > *:not(.chat-ui__background) { position: relative; z-index: 1; }
```

**步骤 F — 外观面板 UI**（`src/windows/chat/ChatWindow.tsx` 的 `PreferencesPanel`，appearance tab，建议放在"字体包"PrefRow 之后、头像分隔线之前）：
- 加一个 `PrefRow label="聊天背景"`：缩略图预览（有图时 `backgroundImage` 小方块，参考 `DreamPrefsPane.tsx` 第 422 行）、"更换"按钮（触发文件选择 → 读成 dataURL → 打开 `DreamBackgroundCropper`）、"清除"按钮（`avatarStore.clearChatBackground()`）。
  - 文件选择 + 读 dataURL + 调 `DreamBackgroundCropper` + `avatarStore.setChatBackground(blob)` 的交互，整段照 `DreamPrefsPane.tsx` 第 540–565 行搬。`DreamBackgroundCropper` 直接 `import` 复用。
- 加一个 `PrefRow label="背景模糊"`：`PrefRange min={0} max={36} value={appearance.backgroundBlur} onChange={v=>onAppearanceChange({backgroundBlur:v})}`。

## ①.4 验收
- [ ] 外观面板上传一张图并裁剪后，聊天区出现模糊背景，文字清晰可读。
- [ ] 拖背景模糊滑块实时生效；设 0 时为清晰原图。
- [ ] "清除"后恢复纯色背景。
- [ ] 重启应用背景仍在（落盘在 `app_data_dir/avatars` + `avatars.json` 的 `chat_background`）。
- [ ] 切换主题时背景遮罩色（`--paper`）随主题走，不突兀。

---

# 特性 ② 主题自定义 CSS 注入（带安全检测）

## ②.1 现状事实
- 主题来自磁盘 `public/themes/<id>/theme.json`，Rust `list_themes`（`lib.rs` 第 281 行）扫描子目录读 `theme.json` 原样返回；前端 `registry.ts` 校验后进选择器。
- 加载器 `loader.ts` 的 `applyTheme` 目前只 `setProperty` 变量 + 设 `data-theme`。`clearTheme` 移除变量。
- 静态资源：`public/themes/` 已配进 `tauri.conf.json` 的 `resources`（`"../public/themes/": "themes/"`），故 `/themes/<id>/<file>` 可直接作为 URL 访问。

## ②.2 设计决策
- Manifest 加可选字段 `css: string`（相对 theme 目录的文件名，约定 `"theme.css"`）。
- 注入方式：**fetch 文本 → 安全检测 → 通过则插 `<style data-theme-css="<id>">`**（用 `<style>` 而非 `<link>`，便于先拿文本做检测、也便于切换时移除）。
- 安全检测不过 = **该主题判为 invalid，不进选择器**（与缺必填变量同等对待），并在控制台 + 选择器 UI 标红原因。即"检测不过直接报错不启用"。
- 作用域：CSS 无法自动 scope，保持全局但靠检测兜底；在 `public/themes/README.md` 里约定 mod 作者只应针对文档化的类名钩子（`.chat-ui`、`.dream-theme`、`.chat-ui__background` 等）。

## ②.3 安全检测规则（新建 `src/shared/theme/cssGuard.ts`）
对 CSS 文本做以下检查，命中任一即不通过，返回拒绝原因列表：

| 规则 | 正则/判据 | 理由 |
|---|---|---|
| 禁远程 `@import` | `/@import/i` | 防加载远程样式/追踪 |
| 禁远程 url | `/url\(\s*['"]?\s*(https?:)?\/\//i` | 防 `url(http..)` 外联回传/指纹 |
| 禁 `expression(` | `/expression\s*\(/i` | 旧 IE 表达式执行（防御性） |
| 禁 `javascript:` | `/javascript\s*:/i` | 伪协议 |
| 禁 `-moz-binding` / `behavior:` | `/-moz-binding|behavior\s*:/i` | XBL/HTC 可执行脚本 |
| 体积上限 | `text.length > 100_000` | 防超大文件卡渲染 |
| 允许的 url 仅限本地 | `url()` 内容必须以 `/themes/`、`data:`、相对路径开头 | 资源只能来自主题自身 |

```ts
export interface CssGuardResult { ok: boolean; reasons: string[]; }
export function inspectThemeCss(css: string): CssGuardResult {
  const reasons: string[] = [];
  if (css.length > 100_000) reasons.push('CSS 超过 100KB 体积上限');
  if (/@import/i.test(css)) reasons.push('禁止 @import');
  if (/url\(\s*['"]?\s*(https?:)?\/\//i.test(css)) reasons.push('禁止远程 url()，资源只能来自主题目录');
  if (/expression\s*\(/i.test(css)) reasons.push('禁止 CSS expression()');
  if (/javascript\s*:/i.test(css)) reasons.push('禁止 javascript: 伪协议');
  if (/-moz-binding|behavior\s*:/i.test(css)) reasons.push('禁止 -moz-binding / behavior');
  return { ok: reasons.length === 0, reasons };
}
```

## ②.4 实现步骤
**步骤 A — 类型**（`src/shared/theme/types.ts`）：`ThemeManifest` 加可选 `css?: string`。`ThemeRecord` 加可选 `cssText?: string`（注册时预取的文本）与 `invalid?: { reasons: string[] }`。

**步骤 B — 加载器**（`loader.ts`）：
- 新增 `applyThemeCss(id: string, cssText: string|null)`：先移除任何 `style[data-theme-css]`；若 cssText 非空，`document.head.appendChild` 一个 `<style data-theme-css=id>`，`textContent = cssText`。
- 新增 `clearThemeCss()`：移除 `style[data-theme-css]`。
- `applyTheme` 末尾不直接管 css（由 registry 在 setTheme 时按 record.cssText 调 `applyThemeCss`），保持 loader 纯粹。

**步骤 C — 注册中心**（`registry.ts`）：
- `listThemes()` 对每个磁盘主题：若 manifest 有 `css` 字段，`fetch('/themes/'+id+'/'+manifest.css)` 取文本 → `inspectThemeCss`：
  - 通过：`record.cssText = text`。
  - 不通过：`record.invalid = { reasons }`，并 `console.warn('[theme] '+id+' 自定义CSS被拒:', reasons)`；**该 record 不计入可用列表**（或标记 invalid 由 UI 灰显，二选一，推荐直接过滤 + 在 console 报明）。
  - fetch 失败：同样标记 invalid（"CSS 文件读取失败"）。
- `setTheme(id)`：`applyTheme(manifest)` 后调 `applyThemeCss(id, record.cssText ?? null)`；切到无 css 的主题时 `applyThemeCss` 传 null 自动清除上一套。

**步骤 D — 范例**：在 `public/themes/_example-mod/` 加一个 `theme.json` 带 `"css":"theme.css"` 和一个 `theme.css`（示范圆润气泡/描边，仅用本地 url 与文档化类名）。再加一个**故意违规**的注释样例在 README，说明会被拒。

**步骤 E — README**（`public/themes/README.md`）：补"自定义 CSS"章节——字段、可用类名钩子清单、安全限制（远程 url/@import 等会被拒、不启用）。

## ②.5 验收
- [ ] 给某主题加合法 `theme.css`（改气泡圆角/描边），切到它生效；切走自动卸载。
- [ ] 在 `theme.css` 写 `@import url(https://...)` 或 `background:url(http://evil/x)`，该主题不出现在选择器，控制台明确报出拒绝原因。
- [ ] CSS 文件缺失/超 100KB 时主题被判 invalid，不影响其它主题。
- [ ] 纯变量主题（无 css 字段）行为不变。

---

# 特性 ③ 圆角 / 边框 token 化

## ③.1 现状事实
- 全仓 `borderRadius`/`border-radius` 共 **192 处**，主要散在内联 style。取值聚集：`2/3`(21+8)、`4/5`(18+19)、`6/8`(13+18)、`8px`(10)、`10/12/14`(少量)、`50%`(头像圆)、`999px`(胶囊)。
- `DreamTokens.css` 独占 50 处（Dream 自有观感，**本期不动 Dream 内部**，避免破坏玻璃质感）。
- 现无任何 radius/border 变量。

## ③.2 设计决策
- 新增一档 token 标度（加入契约 `REQUIRED_TOKENS`，内置主题给默认值 = 现状常见值，视觉零回归）：

| Token | 默认值 | 取代的硬编码 |
|---|---|---|
| `--radius-xs` | `3px` | 2,3 |
| `--radius-sm` | `5px` | 4,5 |
| `--radius-md` | `8px` | 6,7,8 |
| `--radius-lg` | `12px` | 9,10,11,12,14 |
| `--radius-pill` | `999px` | 999px |
| `--border-thin` | `1px` | `1px solid` 类 |
| `--border-regular` | `2px` | `2px solid` 类 |

- `50%`（头像/圆点）**保持不变**，那是几何圆非主题观感。
- 范围限定：**只 tokenize Chat 与 Activity 窗口的内联 radius**（高频可见、风险低）。Dream 的 50 处不动。这样既给 mod 暴露"圆润 vs 硬朗"的调节面，又把改动量控制在可一次过 review 的范围。
- 替换映射：按上表把 `borderRadius: N` → `borderRadius: 'var(--radius-xx)'`，`border:'1px solid X'` 的宽度部分可保留（颜色已在特性中处理），仅在明显需要的面板/按钮/输入框上换 radius。

## ③.3 实现步骤
**步骤 A — 契约**（`src/shared/theme/contract.ts`）：新增
```ts
export const SHAPE_TOKENS = [
  '--radius-xs','--radius-sm','--radius-md','--radius-lg','--radius-pill',
  '--border-thin','--border-regular',
] as const;
```
并入 `REQUIRED_TOKENS = [...CORE_TOKENS, ...GAME_TOKENS, ...SHAPE_TOKENS]`。

**步骤 B — globals.css 兜底**：在 `:root{}` 默认块加上 §3.2 表中的默认值（保证 JS 未注入时也有值，防 FOUC）。

**步骤 C — 内置主题 + 范例 json**（`builtinThemes.ts` 的 paper/dark，以及 `public/themes/*/theme.json`）：每个主题的 `tokens` 补齐 SHAPE_TOKENS 默认值。可写脚本批量补，或手动。`_example-mod` 给一套更圆（如 xs=6 / md=14）演示差异。

**步骤 D — 组件替换**（Chat + Activity，按 §3.2 映射）：逐文件把内联 `borderRadius: 数字` 换成对应 `var(--radius-*)`。高频文件：`ChatWindow.tsx`(15)、`ChatPanel.tsx`(9)、`SubStatus.tsx`(8)、`Ribbon.tsx`(5)、`UIKit.tsx`(5)、`GroupChatPanel.tsx`(6)、`GroupListPanel.tsx`(4)、Activity 下 `GomokuPage`(9,棋盘格除外)、`ReadingPage`(7)、`ChessPage`(7)、`ActivityCompanionPanel`(5)、`DreamSeedPanel`(5)、`ActivitySettingsPage`(4)。**跳过** `archive/*.legacy.tsx`（废弃）与所有 Dream 窗口组件、`DreamTokens.css`。

## ③.4 验收
- [ ] 替换前后 Chat/Activity 视觉零差异（默认值等于原硬编码）。
- [ ] 在某 mod 的 json 里把 `--radius-*` 调大，Chat/Activity 圆角整体变圆，验证 token 生效。
- [ ] `npm run build` 通过；契约新增项被 paper/dark/范例主题全部提供（无 validateTheme 缺失告警）。
- [ ] Dream 窗口观感未变（未被波及）。

---

## 附：统一验收（三特性合并后）
- [ ] `npm run build`（`tsc && vite build`）通过，无类型错误。
- [ ] `cd src-tauri && cargo check` 通过；`chat_background` 已入白名单。
- [ ] 选择器里 paper / dark / 范例 mod / 用户自建 mod 均可切换。
- [ ] 一个完整 mod（自定义色 + 圆角 + 背景说明 + 合法 theme.css）能完整呈现：换色 + 改圆角 + 自定义 CSS 同时生效。
- [ ] 违规 CSS 的 mod 被拒、报因、不影响他者。
- [ ] 旧 `emerald.ui.chat.theme` 兼容；字体功能、Pet、Dream 玻璃质感无回归。

## 红线（勿做）
- 不改 `uiPreferences` 存储前缀/签名；不动 v1 已稳定的契约语义（只**追加** token）。
- 不动 Dream 窗口内部圆角与 `DreamTokens.css`（保其玻璃观感）。
- 自定义 CSS 一律先过 `inspectThemeCss` 再注入，**永不**注入未检测文本；远程资源一律拒。
- 背景 div 必须在内容之下（z-index 分层），不得遮挡交互。
- 三特性任一出错都要 fallback（背景缺失→纯色；CSS 不过→不启用该 mod；token 缺失→走 globals.css 默认），不得白屏或抛未捕获异常。

## 建议执行顺序
③（定 token，改 globals.css 默认 + 内置主题）→ ②（manifest 加 css + guard + 注入）→ ①（背景图搬运）。三者可同分支三 commit。
