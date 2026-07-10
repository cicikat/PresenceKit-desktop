# 工单：Emerald-client 去硬编码路径 + 新建 CLAUDE.md

> 由 Claude Desktop 审计产出，Claude Code 执行。与 Emerald-presence / yexuan_memery 的工单**无依赖，可并行**。
> 目标：仓库整体改名/挪盘后一切正常；顺带处理一个 token 入库的安全问题。
> 本仓库其余功能一切正常，**只做下列改动，不要顺手重构**。

## 审计结论（证据）

全仓真实的盘符硬编码只有 4 处来源，其余（`src-tauri/gen/` 生成物、`title_sanitizer.rs:281` 的
`C:\Users\alice\...` 测试样例、`dist/`）不需要动：

1. `start-dev.bat:2` — `cd /d D:\ai\Emerald-client`
2. `src-tauri/src/client_config.rs:191-196` — `env!("CARGO_MANIFEST_DIR")` 编译期烧死绝对路径
   （文件内 P0-1 注释自己也点名了这个问题）
3. `sensor-service/config.yaml` — **被 git 追踪且含真实 token**（`emt_B1NDte...`，安全问题）
4. 文档：`AGENTS.md`（第 3、29-31、38、54、56、123、127、135、146 行）、`ARCHITECTURE.md`
   （第 3、193、321、322 行）里的 `D:\ai\...` 引用

`sensor-service/main.py` 用 `Path(__file__).parent` 定位 config，本身与路径无关，不用改。
`config/client.local.json` 已 gitignore，正常。

## 任务 1：start-dev.bat（1 分钟）

`cd /d D:\ai\Emerald-client` → `cd /d %~dp0`。保持 CRLF 与其余行为不变。

## 任务 2：client_config.rs 候选路径收敛

`local_config_candidates()` 现状顺序：cwd → cwd/.. → **CARGO_MANIFEST_DIR（编译期烧死）** → app_config_dir。
问题：仓库挪盘后，旧位置若残留 config 目录，旧编译产物仍会命中旧盘符路径（"clone 后接上原数据"）。

改法（保持 dev 便利，堵住 release 的旧路径命中）：

```rust
// 1) CARGO_MANIFEST_DIR 候选仅 debug 构建保留：
if cfg!(debug_assertions) {
    paths.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..").join("config").join("client.local.json"),
    );
}
// 2) 在 app_config_dir 候选之前，补 exe 同目录候选（发行版从 exe 旁读取）：
if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
        paths.push(dir.join("config").join("client.local.json"));
        paths.push(dir.join("client.local.json"));
    }
}
```

验收：`cargo check` 过；`npm run tauri dev` 启动日志 `[client_config] 命中配置文件:` 仍指向仓库
`config/client.local.json`。

## 任务 3：sensor-service token 出库（安全）

1. `git rm --cached sensor-service/config.yaml`，根 `.gitignore` 追加 `sensor-service/config.yaml`。
2. 新建 `sensor-service/config.example.yaml`：复制现文件，`token` 改为
   `"emt_REPLACE-with-sensor-profile-token"`，`glm_api_key` 改为占位。
3. 本地 `config.yaml` 原样保留（main.py 读取路径不变，运行不受影响）。
4. **提醒用户**（写进 commit message 或回复里）：该 token 已进 git 历史，建议到后端吊销重签一个
   sensor profile token；若这个仓库将来要公开，需要清理历史。

## 任务 4：文档去盘符

AGENTS.md / ARCHITECTURE.md 中所有 `D:\ai\Xxx\` 改为相对表述，参照 yexuan_memery 已完成的同类改法：

- `D:\ai\Emerald-client\` → "本仓库根目录（本文件所在目录，可整体改名/移盘）"
- `D:\ai\Emerald-presence\` → "`Emerald-presence` 仓库（通常与本仓库同级）"，其余同理
  （Emerald-desktop / Emerald-desktopUI 同样改为"同级仓库"表述）
- AGENTS.md:127 的 `git -c safe.directory=D:/ai/Emerald-client` → `git -c safe.directory=<仓库根>`
- 代码根目录小节改为："本文件所在目录即仓库根。所有路径一律相对仓库根书写，不依赖盘符或上级目录名。"

## 任务 5：新建 CLAUDE.md（内容原样写入）

```markdown
# Emerald-client — 开发说明

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
- 本机密钥只放 gitignore 的文件（`config/client.local.json`、`sensor-service/config.yaml`），
  入库的只有 `*.example.*` 占位版本。
```

## 任务 6：终验 + commit

1. 自查：`rg -n "[A-Za-z]:[\\\\/]" --glob '!node_modules' --glob '!dist' --glob '!src-tauri/gen' --glob '!src-tauri/target' -g '!*.lock'`
   结果应只剩 URL、测试样例（title_sanitizer.rs）和本工单文档自身。
2. `npm run tauri dev` 能正常启动（改名/挪盘验证可选：挪完重跑一次即可，无需专门演练）。
3. 小步 commit 共 5 个，顺序无依赖：
   - `fix: start-dev.bat use %~dp0 instead of hardcoded path`
   - `fix(config): gate CARGO_MANIFEST_DIR candidate to debug, add exe-dir candidates`
   - `chore(security): untrack sensor-service/config.yaml, add example (token needs rotation)`
   - `docs: remove drive-letter absolute paths from AGENTS/ARCHITECTURE`
   - `docs: add CLAUDE.md with collaboration and path conventions`
