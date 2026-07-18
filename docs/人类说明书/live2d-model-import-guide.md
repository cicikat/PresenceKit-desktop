# Live2D 模型导入说明书

> 与 `docs/room-model-import-guide.md`（Three.js 3D 角色）平行的独立渲染模式。
> 目标：把 Cubism 4/5 模型丢进指定目录，Chat 偏好里选一下就能用，不用改代码。
> 只支持 Cubism 4/5（`.model3.json`）。**不支持 Cubism 2**（`.model.json`）。

---

## 0. TL;DR

1. Cubism Core 运行时（`live2dcubismcore.min.js`）放 `public/live2d/core/`——**这是 Live2D 官方专有许可文件，不进 npm 依赖、不进 git**，需要手动从 Live2D 官网下载。
2. 模型按目录放：`public/live2d/models/<模型名>/`，一个模型一个目录，目录内含该模型的 `*.model3.json` 及其贴图 / moc3 / motions / expressions。
3. Chat 偏好 → 「6 视频通话」→ 渲染模式选 `Live2D`（或「4 桌宠」→ 粒子风格选 `Live2D`），再选模型。
4. 表情命名尽量对齐下面 §2 的对照表；没做也不影响运行（有参数级 fallback）。
5. 待机动作组命名 `Idle`（Cubism 默认约定，大小写不敏感可在设置里改）。

---

## 0.5 版本兼容（先看这个，最大的坑）

**当前渲染栈（`pixi-live2d-display-lipsyncpatch@0.5.0-ls-8` + `pixi.js@7`，Brief 10 升级后）支持 Cubism 3–5 全版本模型。** 升级前的栈（`pixi-live2d-display@0.4.0` + pixi.js 6）只支持到 Cubism 4 时代，Cubism 5 新版模型（Editor 5.x 导出）能加载成功但**每帧绘制崩溃**，症状：画面空白 + 控制台刷 `Uncaught TypeError: Cannot read properties of undefined (reading '0') at CubismRenderer_WebGL.doDrawModel`——这个坑已经修好，以下版本对照表仅供排查老问题 / 理解历史背景参考。

判断模型版本：`.moc3` 文件的第 5 个字节就是版本号。PowerShell 一行：

```powershell
(Get-Content .\xxx.moc3 -AsByteStream -TotalCount 5)[4]
```

| 版本字节 | 对应 Editor | Core 5 系 | Core 6 + 垫片（Brief 11，推荐） | 旧栈（0.4.0，已弃用） |
|---|---|---|---|---|
| 3 / 4 | Cubism 3.x / 4.x | ✅ | ✅ | ✅ |
| 5 / 6 | Cubism 5.0–5.1 / 5.2+ | ✅（需 Core ≥5.2） | ✅ | ❌ 绘制崩溃 |

实际案例：Live2D 官网新版示例「怜 Ren」是 moc3 v6，在旧栈（0.4.0）上必崩；当前栈可渲染。老一代官方示例（**Hiyori / Haru / Mao / Natori / Rice** 等，Cubism 4 SDK 附带的）是 v3/v4，三条 Core 路径都可用。

**Core 6 曾经是破坏性更新**（改名 `getDrawableRenderOrders` → `getRenderOrders`，且把该数据从 `drawables` 挪到了 `model` 本身），当前渲染库直接读旧形状会在 `doDrawModel` 崩溃。`src/shared/live2d/cubismCoreShim.ts`（Brief 11）在 Core 主版本 ≥6 时会自动把 `model.drawables.renderOrders` 补回来，**Core 5 路径不受影响（零污染）**。下载与兼容性细节见 §1.1。

**moc3 v6（cc-tasks/31，新坑）：能加载 ≠ 能画全。** Cubism Editor 5.2+ 引入的「オフスクリーン描画/offscreen」部件组渲染特性，当前渲染器（Core 4/5 时代构建，只遍历 drawables）完全不认识 `Live2DCubismCore.Offscreens`，勾了该选项的部件组永远不会被画出来——常见症状是口内/鼻影/妆面这类面部下半分层缺失，其余普通 drawable（眼/发/衣）正常。**导出规范：渲染栈升级前，模型导出目标版本设为 SDK 5.0（moc3 ≤ v5），部件设置里不要勾选「オフスクリーン描画」。** 已导出成 v6 且用了 offscreen 的模型加载时，设置面板的模型下拉下方会出非阻断提示；也可以自己查 `.moc3` 第 5 字节（见上方 PowerShell 一行）判断版本。

---

## 1. 目录结构

```
public/live2d/
├── core/
│   └── live2dcubismcore.min.js   # 手动下载放置，git 已忽略这整个目录
└── models/
    ├── <模型名 A>/
    │   ├── xxx.model3.json        # 目录内第一个 *.model3.json 会被扫描到
    │   ├── xxx.moc3
    │   ├── xxx.physics3.json
    │   ├── xxx.cdi3.json
    │   ├── expressions/*.exp3.json
    │   ├── motions/*.motion3.json
    │   └── <贴图目录>/*.png
    └── <模型名 B>/
        └── ...
```

- 目录名即设置面板下拉里显示的名字，随便取，但同目录下只应有一个模型（第一个 `*.model3.json` 会被采用，找不到就跳过该目录）。
- Cubism Editor 导出多个模型时，请把每个模型的 `runtime/` 输出目录整体丢进 `models/<模型名>/`，不要把 `.cmo3`/`.can3` 等编辑器工程文件混进这个目录（放不放都行，运行时不会读取它们，但保持目录干净）。
- `public/live2d/models/` 下没有任何目录时，设置面板显示空态提示，不报错；视频通话/桌宠画布区会显示指引文案。

### 1.1 下载 Cubism Core

1. 打开 Live2D 官网「Cubism SDK for Web」下载页，**直接下最新版即可**（Core 6 系）——`src/shared/live2d/cubismCoreShim.ts` 已经把 Core 6 的破坏性改名（`getDrawableRenderOrders` → `getRenderOrders`，数据从 `drawables` 挪到 `model` 本身）垫平，渲染库照常工作。想用 Cubism 5 系旧版也可以，兼容性一样（垫片对 Core ≤5 是零污染 no-op）。
2. 解压后找到 `Core/live2dcubismcore.min.js`，复制到 `public/live2d/core/live2dcubismcore.min.js`。
3. 该文件受 Live2D 专有许可约束，不能重新分发，因此 `.gitignore` 已排除整个 `public/live2d/core/` 目录——每台开发机 / 每次部署都需要各自放置一份。
4. 若未来某个 Core 6.x 小版本又改了垫片没覆盖到的字段：渲染层会检测出垫片自检未通过，直接在画布区显示中文提示（`src/shared/live2d/cubismCore.ts` 的版本守卫 + `cubismCoreShim.ts` 的自检），提示里会带缺失字段名，替换回 Cubism 5 系文件后**重启前端**即可救场（老 core 脚本无法热卸载）。

版本速查：加载后在控制台看 `[CSM][I]Live2D Cubism Core version: 06.xx`（当前默认）或 `05.xx`（旧版，同样受支持）。

---

## 2. 情绪 → 表情命名对照表

模型若带同名 `.exp3.json` 表情（比对 `.exp3.json` 里的 `Name` 字段，大小写不敏感、忽略扩展名），会优先用表情播放；没有对应表情时走参数级 fallback（直接写 `ParamMouthForm`/`ParamBrowLY` 等核心参数，缺参数自动跳过，不报错）。

| 情绪 | 表情名 |
|---|---|
| 平静 | `neutral` |
| 开心 | `happy` |
| 低落 | `sad` |
| 病娇 | `yandere` |
| 分心 | `thinking` |
| 生气 | `angry` |
| 惊讶 | `surprised` |

未在此表中的模型自带表情（比如示例模型的 `exp_01`~`exp_05`）不会被自动关联——要么在 Cubism Editor 里把表情文件按上表重命名（`Name` 字段，不是文件名也可以，只要 `Name` 匹配），要么就让它们保持不用，参数 fallback 仍会正常工作。

---

## 3. 常见坑

- **口型没反应**：先看模型的口型参数是否叫 `ParamMouthOpenY`（Cubism 官方默认）。不是的话去设置面板「口型参数名」里改成模型实际用的参数 ID。
- **没有待机动作**：模型没有 `Idle` 动作组时不会报错，但也不会有待机循环，只剩微弱的呼吸类噪声兜底。想要待机动作就在 Cubism Editor 里把动作组命名为 `Idle`（或在设置面板「待机动作组」里填模型实际的组名，大小写不敏感）。
- **Cubism 2 模型（`.model.json`）不支持**：渲染层写死只接 Cubism 4/5 的 `.model3.json`，老模型需要用 Cubism Editor 重新导出或另找 Cubism 4/5 版本。
- **模型加载了但没有表情/眨眼变化**：多半是模型缺少对应参数（比如没有 `ParamBrowLY`），这是正常降级，不是 bug——核心参数写入前会先检查参数是否存在，不存在就跳过那一项，不影响其它参数。
- **换模型后没有热更新**：确认是在设置面板的下拉里选的（写入 `Live2DSettings.modelDir`），而不是手动改了文件却没有刷新目录扫描；目录扫描走 Tauri command `list_live2d_models`，新增/删除模型目录后重新打开设置面板下拉即可看到最新列表。
- **视频通话切到 Live2D 后看不到「摆放模式」/「自由视角」/「保存视角」按钮**：这三个按钮是 3D 模式专属，Live2D 模式下不适用，属预期行为。

---

## 4. 与 3D 模式（`docs/room-model-import-guide.md`）的关系

两者是**平行且互斥**的渲染模式，由 `roomSettings.renderMode` 切换（`model3d` | `live2d`），共享同一套 mood 情绪映射语义、同一个 `avatar_directive` WS 指令（表情 / 注视 / 手势 / 说话）和同一个 VN 气泡 UI；渲染驱动层各自独立（`src/shared/room3d/` 对 `src/shared/live2d/`），互不影响，切换即时生效。
