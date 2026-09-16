# Desktop runtime acceptance matrix

This v1 matrix separates automated evidence from real desktop and macOS
acceptance. The checked-in state is `partial`: the timer and canonical
protocol consumer tests pass, while no real Tauri window, Live2D/WebGL scene,
packaged Windows artifact, or macOS run has been executed in this task.

The JSON is the record to update after a real run. Before marking a runtime
case `passed`, record the exact desktop commit, operating system/runtime,
artifact identity, UTC timestamp, and a reproducible evidence artifact. A
TypeScript test rejects a `passed` runtime case with missing evidence.

The following are not substitutes for real acceptance:

- `vitest` timer and protocol tests;
- TypeScript compilation or Vite build;
- an emulator, screenshot-less process launch, or a synthetic WebGL context;
- a backend-only protocol workflow.

The macOS cases require a macOS runner or physical Mac. Until those cases are
executed, release status remains partial and no cross-platform runtime claim is
made.

## 2026-09-17 统一登记

近期 native satellite（各 DPI、多屏、睡眠、generation 与主窗关闭）、Dream 并发归属、
真实附件重试、canonical 历史恢复和本机会话角色验收统一登记在同名 JSON。
这些新增项均为 `not-run`，不是失败，也不继承旧 environment 的测试证据。
各施工文档保留实现细节和历史证据；当前运行验收状态以 JSON 为准。
`requirements` 指向验收要求，不是通过证据。新执行批次须记录自己的环境，不复用旧批次时间。
