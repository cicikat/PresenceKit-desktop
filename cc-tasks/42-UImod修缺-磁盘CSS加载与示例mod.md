# 42 · UI mod 查漏修缺：磁盘 CSS 加载 / 示例 mod / 列表刷新

## 背景

主题 mod 系统（`src/shared/theme/`）审计结论见 `docs/ui-mods.md` §9。token-only mod
链路健康（sakura-pink 为证），三处缺口使"带 CSS 的用户自装 mod"从未真正可用：

## 改动点

1. **示例 mod 修复**：`public/themes/_example-mod/` 改名为 `public/themes/plum-mist/`
   （文件夹名必须等于 manifest id，`registry.ts` 按 `/themes/${id}/${css}` 取 CSS）。
   同步 `tauri.conf.json` resources 映射无需改（整目录映射）。验收：dev 下 ThemePicker
   能看到「梅雾」且其 theme.css 生效。
2. **磁盘 mod CSS 改走 IPC**：`fetch('/themes/...')` 只能命中打进 dist 的文件，
   安装版用户丢进 `resources/themes/` 的新 mod CSS 必 404 → 整主题被拒。
   - Rust 侧新增 `read_theme_css(id, file)` command：仅允许读 `themes_dir()/<id>/<file>`,
     **必须做路径穿越防护**（拒绝 `..`、绝对路径、symlink 逃逸；file 仅允许 `.css` 后缀）；
   - `registry.ts`：`source === 'disk'` 的主题 CSS 改经 IPC 读取，builtin/dev 保留
     fetch 兜底；`inspectThemeCss` 安检保持在前端调用点不变。
3. **列表刷新入口**：ThemePicker 加"刷新主题列表"小按钮 → `invalidateThemeCache()` +
   `listThemes(true)`，免重启识别新丢入的 mod。文案走 i18n 语义 key（强制规则 12）。
4. 文档：完成后更新 `docs/ui-mods.md` §5C 与 §9（缺口清单清空对应项）、
   `docs/backend-integration.md`（新增 IPC command 登记）。

## 验收

- `npx.cmd tsc --noEmit`、`npm test`、`cargo check` 通过；
- 手动：安装版（或 dev 模拟 resource 目录）丢一个带 theme.css 的新 mod 目录 →
  刷新按钮 → 主题出现且 CSS 生效；构造 `../` 穿越请求确认被拒；
- 样例「梅雾」在主题列表可见可用。

## 依赖 / 并行

- 独立可做，与现有 39/40/41 全部并行。
- 功能 mod（外接功能）明确不在本单：方案待讨论，见 `docs/ui-mods.md` §8。
