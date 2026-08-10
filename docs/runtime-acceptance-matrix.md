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
