# 62：Design Mod 视觉溢出与生命周期闭环

> 状态：partial/open。前置：工单 60/61 的性能、tooltip、桌宠和 onboarding 改动已经落在当前工作区，
> 但仍是 `partial/open`，且尚未独立提交。本单先关闭当前 fixture 的真实回归，再允许继续扩展自由组合 API。

## 1. 背景与已确认根因

用户已在 Windows 实窗确认新布局有创新性且主窗口不再明显卡顿，但发现以下问题：

1. 窗口外透明 Halo 有脏光晕。Rust 已使用 `transparent(true)`、`decorations(false)`、`shadow(false)`；当前主要来源是 fixture 的 32/64px 半透明 `box-shadow` 及透明 WebView 的 Alpha 合成，不应继续归因于原生窗口阴影。
2. 旋转/透视框被矩形裁断。`design-fixture-mount` 同时承担几何测量、拖拽、视觉边框和内容裁切，并设置 `overflow:hidden`；父元素再应用 `clip-path`/`matrix3d`，导致阴影、角部和旋转后的内容被矩形 owner 裁切。
3. Flow/Garden 拖动时抽搐。拖动代码写 `left/top`，native motion 回调写 `translate`，CSS 固定写 `transform: matrix3d(...)`，三个写入者竞争同一最终变换；每帧 geometry flush 又放大抖动。
4. 日记官方页面遍历所有角色并提供切换，而产品语义应是“当前激活角色的日记目录”。
5. 右下状态自绘层将 breath/gaze/rhythm 以 B/G/R 直接展示；这些属于 diagnostics，不是产品 UI。
6. 角色头像再次不能自动刷新：`ChatWindow` 导入但未订阅 `subscribeActiveCharacter`；头像上传/删除后也没有失效 prompt-assets 缓存，旧 `avatar_url` 会阻止重新读取头像。
7. 恢复默认后 native satellite 可能残留：`cleanupRuntime()` fire-and-forget 调用 bridge destroy 后立即恢复布局，Rust `destroy_design_satellites(generation)` 对 generation 不匹配静默返回，恢复动作没有“所有当前 surface 已关闭”的完成确认。

## 2. 目标

- 透明 surface 除设计明确要求的像素外保持真正透明，无 DWM/CSS 脏光边和矩形底色。
- 旋转、透视、clip-path、阴影和外伸装饰使用明确的 visual bleed，不被测量容器或 surface viewport 意外裁切。
- 拖动、窗口惯性、物理偏移和视觉透视由单一 transform owner 合成，不抽搐、不跳回、不产生多个 rAF。
- 日记只展示当前激活角色及其目录；角色切换由全局角色设置驱动，不在日记页重复提供全角色选择器。
- B/G/R 等调试字段退出产品 UI，但继续保留在本地 diagnostics snapshot。
- 当前角色切换、上传头像、删除头像后，聊天头部、偏好、Dream 头像和 presenter 在同一生命周期内自动刷新，旧请求不能覆盖新角色。
- 恢复默认是可等待、可诊断、幂等的事务；返回成功时所有 native satellite 窗口已经关闭。

## 3. 实施范围

### 3.1 视觉容器与 bleed 契约

- 将 mount 拆成稳定的矩形 placement/measurement wrapper 与独立 visual shell：wrapper 负责命中、几何和布局，visual shell 负责 rotate/perspective/clip/background/shadow。
- wrapper 默认 `overflow:visible`；确实需要裁切正文时，只在 visual shell 内增加 content mask，不得裁切整个 transformed node。
- 为 native surface manifest 增加明确的 `visualBleed`/`contentInset`（或等价结构）并校验有限非负数值；Rust 计算物理 bounds 时包含 bleed，snapshot 同时提供 content rect，避免旋转/阴影顶到 WebView 矩形边界。
- 主 WebView 的页面边缘仍以物理窗口为硬边界；本单不承诺 DOM 可以越过 Tauri 主 WebView。需要越窗的内容继续使用 native surface。
- Halo fixture 移除大范围半透明 `box-shadow`，改用 Alpha 稳定的实线/像素/canvas，或将 glow 限制在足够 inset 的 surface 内；透明区抽样必须接近零 Alpha。

### 3.2 单一 transform owner

- 新建纯逻辑 transform controller，统一维护 `basePosition`、`dragOffset`、`motionOffset`、`physicsOffset` 和 `visualTransform`，最终只向 DOM 写一次合成结果。
- pointer drag 期间冻结或衰减 motion/physics；pointerup 后从同一 controller 恢复，不允许 `left/top`、`translate`、`transform` 各自成为真值。
- geometry observer 读取 controller 的已提交 frame；同一帧最多 flush 一次，连接线与装饰读取相同 generation/sequence。
- covered/hidden/builtin-default/cleanup 时停止 controller rAF 并清空 pointer capture、velocity 和 pending frame。

### 3.3 日记与状态产品语义

- `SubDiary` 移除全角色按钮列表，将原 characters 区域改为当前角色标题、条目计数和刷新入口；entries 只读取当前激活角色。
- `DiaryPresenterController` 订阅 active character，切换时取消旧请求并重新读取目录；旧角色响应不得覆盖新角色。
- `selectCharacter` 仅作旧 Mod 兼容或显式废弃，不再作为官方日记 UI 命令；若改变 presenter schema，必须升版本并记录兼容策略。
- fixture 状态自绘层移除 B/G/R 文案；breath/gaze/rhythm/source 只进入 diagnostics，不进入默认产品展示。
- 新增/修改用户可见文案必须使用语义 i18n key。

### 3.4 头像刷新链

- `uploadCharacterAvatar`、`deleteCharacterAvatar` 成功后失效 prompt-assets/头像相关缓存；调用方需要新数据时显式使用 fresh/force 路径。
- `ChatWindow` 真正订阅 `subscribeActiveCharacter`，按角色 id 加载头像；使用 request generation/AbortSignal 或等价机制丢弃旧角色的迟到响应。
- 头像文件更新但角色 id 不变时也要发出 avatar revision/event，不能只依赖 active character id 变化。
- Preference 上传/删除成功后由共享 owner 广播一次变更，聊天、Dream、日记与设置页消费同一事件；不得靠 remount 整个 `ChatPanel` 刷新头像。
- 为缓存失效、同 id revision、快速切换 A→B、B 先返回/A 后返回补纯逻辑测试。

### 3.5 恢复默认与 native teardown

- 增加主窗口 owner 专用、幂等的“销毁当前全部 design satellites”Tauri command，或把现有 coordinator reset 扩展为不依赖调用方猜测 generation 的原子操作。
- 恢复默认流程必须 `await` teardown ack，再清理 React portal/style/Blob URL 并恢复配置的 theme/layout；失败进入可见 diagnostics 和重试入口。
- generation 保护继续用于普通旧请求隔离，但恢复默认不能因 generation 不匹配静默留下窗口。
- 快速切换 Mod A→B→builtin、激活中恢复、StrictMode cleanup、主窗口 close、surface 自行 close 都要收敛到同一 coordinator 状态。
- Tauri command/event 变化同步 `docs/backend-integration.md`、capability 与 Rust 测试。

## 4. 非目标

- 不在本单设计游鱼、灯泡、花朵的最终美术。
- 不建立完整 Scene Graph authoring API；该工作由工单 63 承担。
- 不把 StateEngine、WS 或后端业务真值复制到 native satellite。
- 不用关闭阴影、旋转或物理效果来掩盖问题；要修正其容器和生命周期条件。

## 5. 测试与验收

### 5.1 自动检查

- transform controller：拖动、motion、physics 合成顺序，drag 冻结，resume 与 cleanup 幂等。
- visual bleed/content rect：100%/125%/175% DPI、负坐标、不同 anchor 的物理 bounds。
- diary：只读当前角色、切换取消旧请求、迟到响应隔离。
- avatar：缓存失效、同 id revision、快速切换竞态、订阅 disposer。
- coordinator：restore 等待 teardown、generation 不匹配仍能 reset current owner、并发 restore 去重。
- `npm test -- --run`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `cd src-tauri && cargo test && cargo check`
- `git diff --check`

### 5.2 Windows 真实窗口

- Halo 透明区截图与像素检查：窗口外透明区域无矩形底色或非设计光晕，主窗口移动时无残影。
- Flow/Garden 连续拖动 30 秒，同时移动主窗口；无抽搐、跳变、位置回弹和多重 transform。
- 旋转/透视框四角、阴影、右上状态和 island 在 100%/125%/175% DPI 均不被矩形裁断。
- 切换/上传/删除当前角色头像后，无需关闭偏好或重启即可刷新；快速切换角色不会显示旧头像。
- Mod→builtin、Mod A→Mod B→builtin、激活中恢复各 10 次；恢复按钮完成后 native surface 数量立即为 0，窗口外无残留。
- 日记仅显示当前角色标题与目录，角色切换后自动换目录，不出现全角色按钮。

## 6. 文档、三面闭环与提交

- 更新 `ARCHITECTURE.md`、`docs/frontend-structure.md`、`docs/design-mods.md`、`docs/backend-integration.md` 和 `docs/known-issues.md`。
- 后端管理面与手机端不新增设置；在三仓总账记录这是桌面本地 Design Mod/头像消费链修正。除非发现后端契约缺陷，不修改其他仓库。
- 自动检查通过但实窗项目未完成时保持 `partial/open`。
- 本单独立提交；不得把工单 60/61 尚未整理的改动、`.tmp/` 或构建产物误删/混入提交。

## 7. 后续依赖

本单是工单 63 的强前置。只有 transform owner、visual bleed、avatar revision 和 native teardown 稳定后，才允许扩大自由组合节点和边缘装饰数量。
