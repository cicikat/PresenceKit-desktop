# 27 — Live2D 驱动 adapter 隔离(P2,可并行)

## 审计确认

`src/shared/live2d/useLive2DStage.ts` L309 起 monkey-patch `motionManager.update` 叠加
眨眼/口型/注视/手势(`driveFrame`)。现状已有一半 fail-open:`driveFrame` 调用包 try/catch,
单参数缺失不会杀模型;`eyeBlink` 置 undefined 关掉内建眨眼。

缺口:

1. `mm` 或 `mm.update` 不存在时静默跳过,无告警,用户只看到"模型不动"。
2. patch 逻辑、expressionManager 探取、参数默认值缓存散在 586 行 hook 里,库升级
   (pixi-live2d-display 内部结构变化)时影响面不可控。
3. 无库版本守卫。

## 交付物

1. 新建 `src/shared/live2d/motionAdapter.ts`:封装
   - `attachDriver(model, driveFrame)`:探测 `internalModel.motionManager.update`,
     成功返回 detach 函数;失败返回 null 并 `console.warn('[live2d] motionManager 结构不符,
     驱动层禁用,模型以原生动作运行')` —— fail-open:模型仍正常播放原生 motion。
   - `getExpressionNames(model)`、`getParamDefault` 等结构探取统一收进 adapter。
2. `useLive2DStage.ts` 改为只调 adapter,不直接触碰 `internalModel` 内部结构。
3. 版本守卫:在 adapter 顶部记录当前锁定的 pixi-live2d-display 版本(读 package.json 常量
   注释即可),并在 attach 失败的 warn 里提示"可能因库升级导致"。不引入运行时版本检查依赖。
4. 行为不变:眨眼/口型/注视/手势效果与现状一致。

## 验收

- 现有 Live2D 模型加载、mood 表情切换、说话口型正常(人工 smoke)。
- 手工模拟 `motionManager` 缺失(临时改探测路径)→ 模型仍显示、console 有 warn、无崩溃。

## 依赖

无。P2,排最后。
