# 19 · 测试补齐：前端契约测试、Rust 缺口、sensor-service 清理

背景：前端 TS 零测试（无框架、无 test script），activity API 契约目前由 Emerald-presence 跨仓测试代管（方向反了）；Rust 侧 focus_window/input_hook 各只有 1 个测试；sensor-service（Python）零测试但根目录残留 `.pytest_cache`。

**并行关系**：A、B、C 三个工单相互独立，可并行。每个工单独立 commit。

---

## 工单 A · 引入 vitest + 前端契约测试（P1）

1. devDependencies 加 `vitest`，package.json 加 `"test": "vitest run"`；不引入 jsdom/组件测试栈，本工单只测纯逻辑。
2. 首批测试对象（按现有代码实际形状写，先读实现再写断言）：
   - `src/shared/api/activity-api.ts`：请求/响应消息形状、字段名常量——即 Emerald-presence `tests/test_activity_contract.py` 跨仓断言的那份契约，在本仓建立己方的权威测试。
   - ws 消息解析层（`src` 下与 ws_bridge 对接的解析/序列化纯函数）：合法消息解析、缺字段/未知类型的容错路径。
3. 测试文件放 `src/**/__tests__/` 或同级 `*.test.ts`，选一种并在 AGENTS.md 记一行约定。
4. 不追求覆盖率，目标是把"跨仓契约"在客户端侧锁住：EP 侧改字段名时，本仓 `npm test` 能红。

验收：`npm test` 全绿；故意改一个 activity-api 字段名能让测试红。

## 工单 B · Rust 测试缺口（P2）

现状统计：title_sanitizer 18、aggregator 6、lib.rs 8、ws_bridge 5、client_config 5，但 `sensor/focus_window.rs` 和 `sensor/input_hook.rs` 各只有 1 个。

1. 读这两个文件，把**可纯逻辑测试的部分**（去抖/聚合/状态机判定等，不依赖 OS hook 的）补到各 3–5 个用例，覆盖边界（空窗口标题、快速切换、重复事件）。
2. 依赖真实 OS hook 的部分不硬测，注明 `// 需真实环境，见手工测试` 即可。

验收：`cargo test`（src-tauri 下）全绿。

## 工单 C · sensor-service 测试决策 + 缓存清理（P2）

1. 删除仓库根残留的 `.pytest_cache/`，并确认 `.gitignore` 覆盖 `.pytest_cache`。
2. 盘点 `sensor-service/` 各模块（agent / behavior / bot_client / garden / sense），挑 **纯逻辑最重的 2–3 个模块**建 `sensor-service/tests/`，写最小单测（解析、判定、状态转换），加 conftest 隔离数据目录（参照 Emerald-presence conftest 的 sandbox 思路，如有类似 data 路径机制）。
3. 若盘点后发现全是 I/O 胶水、无纯逻辑可测，则不建测试，在 `sensor-service/` 下留 README 一段说明该决策，避免下次再来人疑惑 pytest_cache 从哪来。

验收：有测试则 `pytest sensor-service/tests -n auto` 全绿；无测试则决策已成文。
