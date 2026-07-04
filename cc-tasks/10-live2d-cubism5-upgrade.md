# Brief 10 · Live2D 渲染栈升级：支持 Cubism 5 模型（pixi 7 + lipsyncpatch 分支）

> 背景：Brief 09 落地后实测，`pixi-live2d-display@0.4.0` 只支持 Cubism 4 时代 moc3（版本字节 ≤4）。
> 茶茶的模型「ren（怜）」是官方新版示例，moc3 **v6**（Cubism 5.2）——加载成功但每帧
> `CubismRenderer_WebGL.doDrawModel` 抛 `Cannot read properties of undefined (reading '0')`，画面空白。
> 本单：整体迁移到社区维护分支 `pixi-live2d-display-lipsyncpatch`（支持 Cubism 3–5），连带 pixi.js 6→7。
> 改动范围：**只有 `package.json` 和 `src/shared/live2d/useLive2DStage.ts`**。设置 / UI / Rust / 文档结构不动。

## 0 · 版本锁定（定死）

| 包 | 从 | 到 |
|---|---|---|
| `pixi.js` | `6.5.10` | `7.4.3`（exact，不带 `^`；若 7.4.3 不存在则取 7.4.x 最新 patch） |
| `pixi-live2d-display` | `0.4.0` | **删除** |
| `pixi-live2d-display-lipsyncpatch` | — | `0.5.0-ls-8`（exact；peerDep 要求 pixi ^7） |

导入路径全局替换：`pixi-live2d-display/cubism4` → `pixi-live2d-display-lipsyncpatch/cubism4`（subpath exports 结构与原包一致，`./cubism4` 入口存在，已核对 npm registry）。

## 1 · 两条铁律（Brief 09 的血泪，不许回退）

1. **cubism4 入口禁止静态 import**——模块体在求值时检查 `window.Live2DCubismCore`，缺失直接 throw，会经 main.tsx → RoomWindow 链炸掉整个 bundle（米黄白屏事故）。现有 `loadCubism4()` 动态 import + `ensureCubismCore()` 前置的结构**必须保留**，只改包名和 `import type` 来源。
2. 版本全部 exact 锁定，`package.json` 里不要出现 `^`。

## 2 · useLive2DStage.ts 的 pixi 6→7 适配点

逐条核对，不止这些也以 tsc 报错为准：

1. `PIXI.Texture.fromURL(url)`（背景图加载）→ v7 已移除，改 `await PIXI.Assets.load(url)`（返回 Texture，同样 async；失败 catch 逻辑保留）。
2. `app.renderer.backgroundColor = <number>` → v7 为 `app.renderer.background.color`；`app.renderer.backgroundAlpha` → `app.renderer.background.alpha`。现文件三处（applyBackground 的 transparent / color 分支、zoom effect 末尾）。
3. `app.view` 类型从 `HTMLCanvasElement` 变 `ICanvas`——现有 `as HTMLCanvasElement` 断言可保留。
4. `Live2DModel.registerTicker(PIXI.Ticker …)`：查 lipsyncpatch 0.5 的 README/types——0.5 系列改为在 `Live2DModel.from` options 传 `ticker: PIXI.Ticker.shared`，`registerTicker` 可能已不存在。按分支实际 API 二选一，注册逻辑仍放在 `loadCubism4()` 内只跑一次。
5. `Live2DModel.from(url, { idleMotionGroup, autoInteract })`：0.5 分支移除了 `autoInteract`（v7 没有 InteractionManager）。若 TS 报错就删掉该项——我们本来就不用它的交互。
6. monkey-patch 的 `internalModel.motionManager.update`、`expressionManager.definitions[].Name`、`internalModel.coreModel.getParameterIndex / setParameterValueByIndex`、`internalModel.eyeBlink = undefined`：0.5 分支内部结构与 0.4 基本一致，但逐个跑通验证，签名有出入以分支 types 为准调整。
7. lipsyncpatch 自带「音频驱动口型」API（`model.speak()` 等）——**本期不用**，继续走我们的参数级口型（volume/talking 正弦），不要引入它的音频通路。

## 3 · 验证清单

- [ ] `npm run build` 通过；启动无白屏（core 缺失时也只是画布区文案，回归 Brief 09 铁律 1）。
- [ ] **ren（moc3 v6）**：视频通话 Live2D 模式正常显示、Idle 动作循环、mood 七态参数 fallback 生效（ren 的表情叫 exp_01~05，不会匹配表情层，走参数层是预期）。
- [ ] 桌宠 live2d 风格：透明背景渲染 ren、缩放滑条生效、shy/nuzzle 脉冲正常。
- [ ] 背景三态（跟随窗口/纯色/图片）都正常——重点回归 §2.1/§2.2 改过的代码路径。
- [ ] 设置热切换模型 / 反复开关通话窗 10 次无 WebGL 泄漏警告。
- [ ] 若手头有 Cubism 4 老模型（Hiyori 等）顺带验一只，确认没把旧版本支持搞坏。

## 4 · 文档收尾

- `docs/live2d-model-import-guide.md` §0.5 版本兼容表：升级完成后把「当前栈」列更新为 lipsyncpatch 0.5（Cubism 3–5 全绿），保留 moc3 版本检查方法。
- `cc-tasks/09-live2d-mode.md` §0 表格加一行注记「渲染库已由 Brief 10 升级为 pixi.js@7 + pixi-live2d-display-lipsyncpatch@0.5.0-ls-8」。
