# Brief 11 · Cubism Core 6 兼容垫片（shim）

> 处境：模型侧想吃 moc3 v5/v6（Cubism 5 模型多、6 时代 core 解析能力最全），但
> ① 官网可下的 **Core 5 过旧**（pre-5.2）：ren（moc3 v6）直接 `Failed to CubismMoc.create()`（csmReviveMocInPlace 返回 null）；
> ② **Core 6 够新能解析**，但 JS API 有破坏性改名（官方记录：`getDrawableRenderOrders` → `getRenderOrders` 等），
>    渲染库（lipsyncpatch 0.5 内置的 CubismWebFramework 4/5 代）读 `drawables.renderOrders` 得 undefined，
>    每帧 `doDrawModel` 崩溃 `Cannot read properties of undefined (reading '0')`。
> 方案：**加载 Core 6 → 用运行时垫片把新 API 形状映射回老 framework 期望的形状**。core 是纯数据接口
> （moc 解析/参数更新/顶点数据），WebGL2 等破坏性变化在 framework 层不在 core 层，所以垫片薄且可行。

## 0 · 已侦察到的事实（省得重查）

**framework 实际读取的 core API 面**（grep `node_modules/pixi-live2d-display-lipsyncpatch/dist/cubism4.es.js` 所得，这就是垫片要保证存在的全部东西）：

- 命名空间：`Live2DCubismCore.Logging.csmSetLogFunction/csmGetLogFunction`、`Version.csmGetVersion/csmGetMocVersion/csmGetLatestMocVersion`、`Memory.initializeAmountOfMemory`、`Moc.fromArrayBuffer`、`Moc.prototype`（`._release`）、`Model.fromMoc`、`Utils.has{IsDoubleSided,VertexPositionsDidChange,BlendAdditive,BlendMultiplicative,IsInvertedMask,IsVisible,VisibilityDidChange,OpacityDidChange,RenderOrderDidChange,BlendColorDidChange}Bit`；`_isStarted` 是 framework 自己往命名空间上写的 expando，不用管。
- `model.canvasinfo`（小写 i）、`model.parameters.*`、`model.parts.*`、`model.update()`、`model.release()`。
- `model.drawables.{count, ids, constantFlags, dynamicFlags, textureIndices, drawOrders, renderOrders, opacities, maskCounts, masks, vertexCounts, vertexPositions, vertexUvs, indexCounts, indices, multiplyColors, screenColors, parentPartIndices, resetDynamicFlags()}`。

**Core 6 实测行为**：`Moc.fromArrayBuffer` / `Model.fromMoc` / `drawables.count` / `getDrawableCount` 均正常（崩溃点在 renderOrders，说明容器和 count 都在）——差异是**个别字段改名/挪位**，不是整体重构。具体差集需要按 §2 的探测步骤现场拿。

## 1 · 前置（茶茶）

把 **Core 6** 的 `live2dcubismcore.min.js` 放回 `public/live2d/core/`（就是最早那份，控制台日志特征 `[CSM][I]Live2D Cubism Core version: 06.00.0001`）。Core 5 那份可以留在旁边改名备份（如 `live2dcubismcore.5.min.js.bak`，加载器只认准确文件名，不会误读）。

## 2 · 探测（写垫片前必须做，禁止盲写映射表）

1. 临时在 `ensureCubismCore()` resolve 后（或 devtools 控制台里手动）跑一段诊断：

```js
const C = window.Live2DCubismCore;
console.log('ns keys:', Object.keys(C));
const buf = await (await fetch('/live2d/models/ren/ren.moc3')).arrayBuffer();
const moc = C.Moc.fromArrayBuffer(buf);
const model = C.Model.fromMoc(moc);
for (const k of ['drawables','parameters','parts','canvasinfo']) {
  const o = model[k];
  console.log(k, o ? [...Object.keys(o), ...Object.getOwnPropertyNames(Object.getPrototypeOf(o))] : o);
}
```

2. 拿输出与 §0 的期望清单做差集：期望有而实际没有的字段 = 垫片要补的别名；实际多出来的新名字里找语义对应（改名规律参考官方 `getDrawableRenderOrders → getRenderOrders`，大概率是把 `drawable` 前缀去掉或挪进新子对象）。
3. 把探测结果（两份 key 列表 + 映射表）**写进本文件末尾附录**，留档。

## 3 · 垫片实现 `src/shared/live2d/cubismCoreShim.ts`

1. `export function shimCubismCore(): void`——幂等；读 `Version.csmGetVersion() >>> 24`，**major ≤5 直接 return（零污染）**，≥6 才动手。
2. 映射手法（按差集逐个处理，优先级从上到下）：
   - 命名空间级缺失（如 `Utils.hasXxxBit` 改名）：直接在命名空间对象上补别名函数/常量。
   - 实例级缺失（drawables/parameters/parts/canvasinfo 的字段）：**包一层 `Model.fromMoc`**——保存原函数，返回实例后给对应子对象补别名属性再返回。TypedArray 视图直接引用赋值即可（同一块 HEAP，不复制）；方法用 bind。视图可能在 `model.update()` 后重建的（Core 5 不会，Core 6 未知）——若探测发现 update 后别名失效，改用 getter 转发而不是一次性赋值。
   - `Moc.fromArrayBuffer` 签名若多了一致性校验参数：包装成老签名调用。
3. 接线：`cubismCore.ts` 的 `assertCoreCompatible()` 改为——major ≥6 时先调 `shimCubismCore()`，垫片自检（补完后按 §0 清单逐项 verify）通过则放行；仍有缺口→抛现有的 `CORE_TOO_NEW_MESSAGE`（提示语句尾加"（垫片未能覆盖此 Core 版本）"）。**Core 5 路径行为完全不变**。
4. 垫片自检结果 `console.info('[live2d] core6 shim: patched N fields')` 一行，方便日后 Core 6.x 小版本再变时定位。

## 4 · 验证

- [ ] Core 6 + ren（moc3 v6）：视频通话/桌宠正常渲染、Idle 循环、mood 参数层、口型、眨眼全链路。**未做**（无 chromium-cli/playwright，需人工浏览器验证；Node 端已验证 renderOrders 崩溃点本身修复，见附录）。
- [ ] Core 6 + 一只 Cubism 4 老模型（Hiyori/Haru 任一，v3/v4）：正常——证明垫片没伤老模型路径。**未做**，需人工验证。
- [ ] 换回 Core 5 文件：老模型正常（垫片 no-op），ren 报 `CubismMoc.create` 类错误但**不崩 app**、画布区有可读错误文案。**未做**，需人工验证；`shimCubismCore()` 的 `major <= 5` 提前 return 逻辑已 code review 确认无副作用。
- [ ] 长跑 5 分钟 + 反复开关通话窗：无泄漏、无每帧报错刷屏。**未做**，需人工验证。
- [x] `npm run build` 通过。

## 5 · 文档收尾

- `docs/live2d-model-import-guide.md` §1.1 反转推荐：**推荐直接下最新 Core（6），垫片已兼容**；Core 5 作为备选。§0.5 对照表补一列「Core 6 + 垫片」。
- 附录留探测差集与映射表（见 §2.3）。

## 6 · 风险与回退

- 若探测发现 Core 6 不止改名、还改了**语义**（dynamicFlags 位布局、update 生命周期、顶点数据排布），垫片单点补不动的：停手，回本单评论区记录发现，回退到「Core 5 + 模型侧降级」通路（ren 目录里自带 `_editor-source/ren_t01.cmo3`，Cubism Editor 里按 SDK 4.2 目标重导出 moc3 即可在 Core 5 上用）。
- 垫片是**过渡态**：等 pixi-live2d-display 生态正式支持 Core 6 后（关注上游 issue #118），升级并删除本垫片。

## 附录：探测结果与映射表（施工时补的）

**Core 6 build**：`public/live2d/core/live2dcubismcore.min2.js`（用户提供），`csmGetVersion()` = `0x06000001` → **6.0.1**。探测用 `Node.js` 直接 `require()` 该文件（改名 `.cjs` 绕开项目 `"type":"module"`，并在文件末尾追加 `module.exports = Live2DCubismCore;` 把模块作用域里的顶层 `var` 导出），配合 `ren.moc3`（moc3 v6）跑 §2 的探测脚本；WASM 运行时是异步初始化的（`csmGetVersion()` 在脚本同步执行完的当下会抛错，下一个事件循环 tick 才可用——这个发现直接导致 §3.3 的 `assertCoreCompatible` 需要改成 `async` 轮询等待，而不是脚本 `onload` 里同步读一次就下结论）。

**§0 期望清单 vs Core 6.0.1 实测 —— 逐项核对结果**：

| 期望字段/方法 | Core 6.0.1 实测 |
|---|---|
| `Logging.csmSetLogFunction` / `csmGetLogFunction` | ✅ 原名不变 |
| `Version.csmGetVersion` / `csmGetMocVersion` / `csmGetLatestMocVersion` | ✅ 原名不变 |
| `Memory.initializeAmountOfMemory` | ✅ 原名不变 |
| `Moc.fromArrayBuffer`（签名） | ✅ 单参数不变，无新增一致性校验参数 |
| `Moc.prototype._release` | ✅ 原名不变（新增了 `hasMocConsistency`，框架不需要，不用管） |
| `Model.fromMoc`（签名） | ✅ 单参数不变 |
| `Utils.has{IsDoubleSided,VertexPositionsDidChange,BlendAdditive,BlendMultiplicative,IsInvertedMask,IsVisible,VisibilityDidChange,OpacityDidChange,RenderOrderDidChange,BlendColorDidChange}Bit`（10 个） | ✅ 全部原名不变（新增了 `hasDrawOrderDidChangeBit`，框架不需要） |
| `model.canvasinfo`（小写 i）+ `.CanvasWidth/.CanvasHeight/.PixelsPerUnit` | ✅ 原名不变 |
| `model.parameters.{count,ids,minimumValues,maximumValues,defaultValues,types,values}` | ✅ 全部原名不变（新增 `repeats`/`keyCounts`/`keyValues`，框架不需要） |
| `model.parts.{count,ids,opacities}` | ✅ 全部原名不变（新增 `parentIndices`/`offscreenIndices`，框架不需要） |
| `model.update()` / `model.release()` | ✅ 原名不变 |
| `model.drawables.{count,ids,constantFlags,dynamicFlags,textureIndices,drawOrders,opacities,maskCounts,masks,vertexCounts,vertexPositions,vertexUvs,indexCounts,indices,multiplyColors,screenColors,parentPartIndices,resetDynamicFlags()}` | ✅ 全部原名不变（新增 `_modelPtr`/`blendModes`，框架不需要） |
| **`model.drawables.renderOrders`** | ❌ **唯一的差集**：数据挪到了 `model.renderOrders`（顶层，`Int32Array`），并新增了 `model.getRenderOrders()` 方法——两者是**同一个 TypedArray 引用**，`model.update()` 之后引用不变、不重建（探测时连续 `update()` 5 次验证过），所以垫片可以用**一次性引用赋值**而不需要 getter 转发 |

**结论**：Core 6.0.1 相对 §0 清单只有一处差集——`drawables.renderOrders` 整体挪到了 `model` 顶层。不是"改名"，是"挪位置"；语义（数据内容、数组顺序、生命周期）完全一致，直接引用赋值即可，不用转换值。

**映射表**（垫片 §3 的全部内容）：

| 老形状（framework 期望） | 新形状（Core 6.0.1 实际） | 垫片手法 |
|---|---|---|
| `model.drawables.renderOrders` | `model.renderOrders`（或 `model.getRenderOrders()`，同引用） | 包一层 `Model.fromMoc`：拿到实例后，若 `drawables.renderOrders` 缺失且 `model.renderOrders` 存在，直接 `model.drawables.renderOrders = model.renderOrders` |

**验证**（Node 端到端复现，非浏览器 WebGL 像素级验证——见下方"未完成项"）：用真实 `ren.moc3` 跑通 `Moc.fromArrayBuffer → Model.fromMoc`（垫过的）→ 逐字复现 `cubism4.es.js` 里 `doDrawModel` 崩溃处的循环（`for (i) { order = renderOrder[i]; sortedDrawableIndexList[order] = i; }`），垫片前 `renderOrder` 是 `undefined` 必崩，垫片后拿到 `Int32Array(222)` 且循环正常跑完；额外跑了 5 次 `model.update()` 后重新取值，引用与内容都还对，验证了"一次性赋值而非 getter"这个判断没错。`npm run build`（`tsc && vite build`）通过。

**未完成 / 待人工验证**：施工环境没有 `chromium-cli`/`playwright`，没法做真正的 WebGL 像素级渲染验证。§4 checklist 里"视频通话/桌宠正常渲染全链路"、"换一只 Cubism4 老模型"、"换回 Core 5 文件观察报错文案"、"长跑 5 分钟"这几项**需要人工在真实浏览器里跑一遍**再勾选。
