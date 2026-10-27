# Desktop runtime acceptance matrix

2026-10-27 叶瑄增量：115 原始配置审计、114 最终候选真实 Core/Pixi 实播；83 人物配置经单独目检安装，850 原生表情/2203 原生动作、口型与重载通过，本地425配饰预设分开计数。27 卡面/场景层、4 附属件分列，卡面合成和可选游戏换装仍 partial。600 前端测试、27 Python 测试通过。JSON 的 yexuan-incremental-20261027 仅为 automated；真实 Windows Tauri/TTS/GPU/发行包状态不继承。原25日冰峰阻塞已由新包 eye05 修复，历史证据保留。

2026-10-25 叶瑄续作：13 个原 MOC 槽/UV 检查，11 个主体变体的浏览器及逐图目检通过，110 表情/293 动作、口型和重载通过；冰峰缺正确眼图未安装，未恢复配饰仍 partial。该批次只登记 automated，详见 JSON 的 yexuan-reviewed-slot-variants，原 Windows/Tauri 验收状态不变。

2026-10-25 补充：HLR 真实 Core/Pixi/React 浏览器及 HTMLAudio/WebAudio 播放验证已通过，记录在 JSON 的 automated 项。八个新增模型已逐图检查，分类与来源核对见 docs/hlr-recovery-workflow.md。Tauri 传输仍为模拟；原 Windows Live2D/WebGL、双窗、真实用户 TTS/GPU 与发行包项继续 not-run，不继承浏览器证据或旧 environment。

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
