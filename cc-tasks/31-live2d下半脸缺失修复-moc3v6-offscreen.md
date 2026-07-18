# 31 · Live2D 下半脸缺失（无鼻/嘴）修复：moc3 v6 offscreen 特性不被渲染器支持

## 诊断链（已查实，2026-07-17）

1. `public/live2d/models/ren/ren.moc3` 头部第 5 字节 = `06` → **moc3 v6 格式**
   （Cubism Editor 5.2+，引入「オフスクリーン描画/offscreen」渲染特性）。
2. 此前「整个人不显示」= Core 5 不认 moc3 v6，加载即失败；cc-tasks/11 换 Core 6 + shim
   后能加载——那一步是对的，但只修了加载。
3. 渲染器 `pixi-live2d-display-lipsyncpatch@0.5.0-ls-8` 是 Core 4/5 时代构建：只遍历
   drawables，**完全没有 Offscreens 概念**（Core 6 新增 `Live2DCubismCore.Offscreens`；
   `renderOrders` 数组长度也变成 drawableCount + offscreenCount 合并）。凡是编辑器里
   勾了「オフスクリーン描画」的部件组，其合成输出永远不会被画出来。
4. 症状吻合：口内/鼻影/妆面这类**面部下半分层**正是 offscreen 的典型用途；眼/发/衣是
   普通 drawable 所以正常。shim 的 renderOrders 别名还把 offscreen 槽位混进 drawable
   排序，属次生小坏（主症状不靠它）。

## 0. 🟢 运行时确认（5 分钟，先做）

模型加载后打一行日志：`coreModel` 的 `_model.offscreens?.count`（>0 即实锤）+
缺失部件的 drawable id 是否属于 offscreen 组（对照 `ren.cdi3.json` 部件名）。
确认后把数字记进本单验收。

## 1. 🟡 主修复：模型侧再导出（美术路径，不动代码）

`_editor-source/ren_t01.cmo3` 在手——Cubism Editor 打开，把用到「オフスクリーン描画」
的部件在部件设置里**取消该选项**，导出目标版本设为 **SDK 5.0（moc3 ≤ v5）** 重新导出
runtime 覆盖 `ren.4096/` + `ren.moc3`。
- 视觉差异预期：原依赖 offscreen 的乘算/剪贴妆面层效果可能略变；不可接受时保留选项走 §3。
- 导出后 Core 6 照常加载（新旧两版模型兼容性保持，不回退 Core 5）。

## 2. 🟡 防再犯：加载守卫 + 导出规范

- Rust `list_live2d_models` 顺带读各 moc3 第 5 字节，响应加 `mocVersion` 字段；前端加载
  moc3 v≥6 的模型时 console.warn + 设置页该模型行提示「模型使用 offscreen 特性，
  当前渲染栈可能缺件」（i18n key，非阻断）。
- 模型放置文档/设置页提示补一句导出规范：**渲染栈升级前，模型导出目标 ≤ SDK 5.0、
  不使用 offscreen**。

## 3. 🟢 Fallback 备案（本单不做）

多个模型确实依赖 offscreen 效果时，评估渲染栈迁移官方 CubismWebFramework（Cubism 5
SDK for Web，原生支持 offscreen）——大改造，lipsync/挂点适配全要重接，单独立项。

## 验收

- ren 模型鼻/嘴完整显示；眼/发/衣零回归；表情/口型/物理不回归。
- `mocVersion` 字段返回正确；v6 模型出提示、v5 不出。
- §0 的 offscreen count 数字记录在案（关掉后应为 0）。
