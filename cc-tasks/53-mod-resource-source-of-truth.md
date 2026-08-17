# cc-tasks/53 - 主题与布局 Mod 的单一资源真值

## 0. 结论

主题与布局 mod 的资源根目录必须按构建模式硬切分，不能再使用“运行期资源目录优先、源码目录
fallback”的探测顺序：

| 运行模式 | 主题唯一读取根 | 布局唯一读取根 |
|---|---|---|
| debug / `npm run tauri dev` | `public/themes/` | `public/layouts/` |
| release / 安装包 | `resource_dir/themes/` | `resource_dir/layouts/` |

`src-tauri/target/**` 与 `dist/**` 都是可随时重建的产物，不是开发者维护入口。旧构建产物无论是否
仍留有合法 manifest，都不得影响 debug 主题列表、布局列表或 CSS 读取。

## 1. 问题与证据

当前 `src-tauri/src/lib.rs` 的 `themes_dir()` / `layouts_dir()` 都先检查 Tauri
`resource_dir`，只有对应目录不存在时才在 debug 构建中回退到仓库 `public/`。同时
`src-tauri/tauri.conf.json` 会把 `public/themes/` 和 `public/layouts/` 打包为资源目录。

这会把一次正常的构建复制变成第二份可被扫描的“真值”：

- `public/themes/`、`public/layouts/`：应维护的源码；
- `src-tauri/target/debug/**`：可能残留过期 manifest 的 debug 资源副本；
- `src-tauri/target/release/**`：release 资源副本；
- `dist/**`：Vite 构建副本。

结果是源码已经删除或改名的 mod 仍可能从旧 `target/debug` 资源中被发现。手工删除旧
`theme.json` / `layout.json` 只能暂时掩盖问题，不能作为修复方案。

## 2. 实现范围

### 2.1 资源根解析

修改 `src-tauri/src/lib.rs`：

1. debug 构建的 `themes_dir()` 必须直接解析并返回 `public/themes/`，不得访问或 fallback 到
   `resource_dir/themes/`；目录不存在时返回明确错误。
2. debug 构建的 `layouts_dir()` 必须直接解析并返回 `public/layouts/`，不得访问或 fallback 到
   `resource_dir/layouts/`；目录不存在时返回明确错误。
3. release 构建只允许解析 `resource_dir/themes/` 与 `resource_dir/layouts/`，不得尝试仓库
   `public/` 路径。
4. `list_themes` 与 `read_theme_css` 必须使用同一个主题根解析器；`list_layouts` 与
   `read_layout_css` 必须使用同一个布局根解析器，避免列表来自 A、CSS 却从 B 读取。
5. 保留现有路径穿越防护、manifest 解析、排序和 CSS UTF-8 读取行为，不改变 Tauri command 名称
   或前端返回结构。

建议把“debug/release 选择哪个候选目录”抽成可注入构建模式和路径的纯函数，再由 Tauri
`AppHandle` 适配层提供实际目录。不要依靠运行测试时碰巧存在的 `target/` 状态验证分支。

### 2.2 打包配置

保留 `src-tauri/tauri.conf.json` 中 themes/layouts 的 `bundle.resources` 映射。它们是 release
安装包资源的生成规则，不是开发态读取入口。

不新增构建后同步脚本，不在启动时清理 `target/` 或 `dist/`，也不要求开发者手工维护任何构建副本。

### 2.3 文档

同步修正：

- `ARCHITECTURE.md`
- `docs/backend-integration.md`
- `docs/ui-mods.md`
- `docs/layout-mods.md`
- `docs/frontend-structure.md` 中相关加载链说明

文档统一使用“debug 只读 `public/`；release 只读 `resource_dir`”的互斥语义，删除“packaged
优先 / debug fallback”这类会暗示双源优先级的表述。

## 3. 最小回归测试

在 `src-tauri/src/lib.rs` 的现有 Rust 测试附近补资源根选择测试，至少覆盖：

1. debug 模式下，即使模拟的 `resource_dir/themes` 与 `resource_dir/layouts` 存在且包含旧
   manifest，也只返回 `public/` 根。
2. release 模式下，即使模拟的 `public/themes` 与 `public/layouts` 存在，也只返回
   `resource_dir` 根。
3. 当前模式的唯一目录缺失时明确报错，不跨模式 fallback。
4. 主题和布局各覆盖一次“列表读取与 CSS 读取使用同一根”的回归场景。
5. 现有非法 id、非法 CSS 文件名和目录穿越测试继续通过。

## 4. 验收矩阵

| 场景 | 预期 |
|---|---|
| 在 `public/themes/` 新增合法主题并刷新 debug ThemePicker | 立即出现 |
| 从 `public/themes/` 删除主题，但 `target/debug` 留旧副本 | debug 刷新后消失 |
| 在 `public/layouts/` 新增/删除布局，`target/debug` 留旧副本 | debug 只反映 `public/layouts/` |
| debug 的 `public/themes/` 或 `public/layouts/` 缺失 | 明确报错，不读取旧构建产物 |
| release 包包含 themes/layouts 资源 | 从 `resource_dir` 正常列出并读取 CSS |
| release 运行目录旁存在仓库式 `public/` | 不读取 |
| 删除整个 `src-tauri/target/` 与 `dist/` 后重建 | 功能不依赖任何手工保留的副本 |

## 5. 三面闭环检查

- 后端管理面：本次只修改桌面本地静态 mod 资源定位，不新增设置、落盘状态、trace、队列或观测
  端点；`Emerald-presence` 无需改动。
- 桌面设置面与手机端：ThemePicker / 布局预览入口和偏好 key 不变；手机端不消费本地 Tauri mod
  目录，无对应改动。
- 原调用链：逐条回归 `ThemePicker/布局预览 -> registry -> Tauri list command -> manifest`，以及
  `选择 mod -> Tauri read CSS command -> 前端 CSS guard -> 注入`。不得只验证列表而遗漏 CSS
  读取根，也不得影响内置主题/布局在 registry 中的合并与 fallback。

本单不改 HTTP、WebSocket、IPC command 名称或数据契约，因此不需要修改跨仓接口总账。若实现过程
改变了 command 形状或新增持久化状态，必须停止扩项并另开工单处理对应文档与观测闭环。

## 6. 不在范围内

- 不清理或提交 `src-tauri/target/**`、`dist/**`。
- 不改字体、Room、Live2D 等非 mod 资源的目录策略。
- 不新增用户可写安装目录、第三方 mod 安装器或热更新协议。
- 不改 theme/layout manifest 契约、CSS 安检规则或现有偏好 key。
- 不实现自由画布 / 功能 mod；该能力由独立提案和后续工单承接。

## 7. 验证命令

执行构建与 Rust 检查前，先按仓库约定阅读相邻后端仓库的 `docs/dev-environment.md`，然后运行：

```bash
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run build
cd src-tauri
cargo test
cargo check
```

最后运行 `git diff --check`，并按第 4 节至少完成一次 debug 真实窗口的旧副本回归验证。release
资源分支若本机未完成真实打包验证，必须在交付说明中明确标记，不能用 debug 测试代替。
