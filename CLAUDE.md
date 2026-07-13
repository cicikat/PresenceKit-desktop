# PresenceKit-desktop — 开发说明

## 协作偏好

1. **用中文回复。**
2. **默认自主推进、替用户拍板**，不要逐项确认；只在不可逆决策（删数据、改契约、对外发布）时提问。
3. **不要全仓 grep**，先按 AGENTS.md / ARCHITECTURE.md 定位到具体文件再精准搜索
   （检索时排除 node_modules/、dist/、src-tauri/gen/、src-tauri/target/）。
4. **交付物一次性批量输出**，多个工单/提示词要标注哪些可并行、哪些有前置依赖，减少一来一回。
5. **小步 commit**：每完成一个独立修复即 commit（信息一行即可），验收通过的改动当场固化。
6. **工作模式**：Claude Desktop 负责审计与写工单（`cc-tasks/`），Claude Code 负责执行与 commit。

## 路径约定

- 不在代码、脚本、文档中写盘符绝对路径；一律相对仓库根。仓库可整体改名/移盘。
- `start-dev.bat` 用 `%~dp0`；`client.local.json` 按 cwd → (debug) CARGO_MANIFEST_DIR → exe 目录 →
  app_config_dir 顺序探测。
- 本机密钥只放 gitignore 的文件（`config/client.local.json`），
  入库的只有 `*.example.*` 占位版本。
