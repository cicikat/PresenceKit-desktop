# 25 — 文档 truthfulness pass(P1,依赖 24 先行)

## 审计确认的矛盾/陈旧点

1. `ARCHITECTURE.md` L33 附近:sensor Rust 模块标"规划中,尚未实施";L343 又说"已嵌入
   Tauri Rust 进程"。**以代码为准:已实施**(`src-tauri/src/sensor/` 有完整 runner)。
2. 同一架构图写"future pet window"——pet 窗口已落地(`src/windows/pet/`)。
3. `ARCHITECTURE.md` L374:"`loadHistory()` 仍保留备用 user id 默认值,默认开发 token 仅作为
   无本地配置时的兼容 fallback"——**已过时**。现状(以代码为准):`bot_user_id` 默认空,
   `load_history` 空 id 直接返回空历史;token 默认是 `CHANGE_ME` 占位符,非可用 dev token,
   401/403/429 有区分文案。GPT 审计的第 7 点(发布配置兜底)即被此陈旧描述误导——改文档即可结案。
4. 项目命名混用:README/AGENTS 用 `PresenceKit-desktop`,ARCHITECTURE/CLAUDE 用 `Emerald-client`。
   **拍板:对外名统一 PresenceKit-desktop;文档内指代本仓一律写"本仓",不写死目录名**
   (与"可整体改名/移盘"的路径约定一致)。首次出现处可注一句"仓库目录名可能为 Emerald-client 等"。

## 交付物

1. 修正上述 4 点。
2. 顺带全文核对 `ARCHITECTURE.md` 的"当前实际状态"类句子,与代码逐条对照,过时的改或删。
   范围仅限事实性描述,不动设计原则段落。
3. `docs/known-issues.md`:"P2 admin token 已从前端源码迁出"条目更新为已完成态叙述;
   与工单 21/22/23 相关条目加指针。

## 验收

- 交叉 grep:`规划中`、`尚未实施`、`future pet`、`备用 user id`、`PresenceKit-desktop`/
  `Emerald-client` 混用处逐一确认。
- 文档所述与 `client_config.rs` / `lib.rs load_history` / `src-tauri/src/sensor/` 现状一致。

## 依赖

在 24 之后做(避免对将删除内容做修订)。可与 21/22/23 并行。
