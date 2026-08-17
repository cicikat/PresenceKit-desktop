# cc-tasks/57 - Design Host 布局高度契约与恢复入口回归修复

> 状态：partial/open。默认高度链、fixture 响应式约束和宿主恢复入口代码已存在；2026-08-17 的 Windows debug fixture 已验证其 native surface 前置生命周期，但 Ribbon 窄窗/DPI 视觉目检仍待完成。

## 0. 定性

这是底层的“宿主布局契约与组件所有权耦合”问题，不是 Ribbon 按钮本身的样式问题，也不是后端业务耦合。

54 将原本直接承载 `LayoutHost` 的节点包进 `DesignModHost` 默认壳层，但 inactive/default 路径没有继续提供明确的 `height: 100%`。这截断了
`ChatWindow -> DesignModHost shell -> LayoutHost -> layout slot -> Ribbon` 的高度链。Ribbon 的底部控制依赖中间的 `flex: 1`，聊天内容异步加载后会把 auto 高度撑大，偏好、帮助和日夜切换被推到 WebView 可视区外，再被根页面的 `overflow: hidden` 裁掉。

当前两个已有修复没有覆盖这个根因：

- `bb6a078` 只修改了 fixture Ribbon 的 `overflow`，对 `builtin-default` 默认路径无效。
- `4236cbb` 修复了 React StrictMode 下的异步激活状态，只改变 Mod 接管时序，不恢复默认布局的高度链。

## 1. 目标

1. 未启用 Design Mod 时，标准 Ribbon、Sidebar、ChatPanel、Group view、Dream、Preferences 和 PaneHost 的布局高度与 54 之前一致。
2. 启用可信 Design Mod 时，默认布局隐藏不会改变 ChatPanel 的 owner、历史、草稿、滚动和通信生命周期。
3. Ribbon 被移动、缩放或由 Mod 重排后，Preferences、恢复默认和必要的主题切换能力仍有明确可用路径。
4. fixture 在 800x600、窄窗口、宽窗口和 resize 后不因写死高度丢失底部控制。
5. 为 56 的 native satellite surface 提供稳定的 viewport、挂载和恢复前置条件。

## 2. 实施范围

### 2.1 恢复默认布局高度链

- 给 `DesignModHost` 的 default shell 提供稳定的布局根样式：`height: 100%`、`min-height: 0`、`min-width: 0`，必要时补 `position: relative`。
- active 和 inactive 两条路径使用同一套尺寸契约；active 只改变可见性和事件接管，不改变内容树的尺寸语义。
- 检查 `ChatWindow`、`LayoutHost`、layout slot、Ribbon、SidebarPanel、ChatPanel 的 flex/grid 子项是否都设置了正确的 `min-height: 0`，避免 auto min-size 再次把父布局撑出 viewport。
- 不通过给现有容器盲目增加 `overflow: visible` 解决问题；设计舞台仍由同级 fixed host 承担应用内越界。

### 2.2 修复 fixture 的响应式尺寸

- 删除 `.design-fixture-ribbon` 对 `height: 564px` 的硬依赖，改为由 viewport 的 top/bottom 或等价的动态约束决定高度。
- 保证 Ribbon 内容在较小窗口中有明确策略：底部恢复/偏好入口不被普通功能项挤出；可滚动区域只能包住非关键功能区。
- 对 perspective、clip-path、status presenter 和连接装饰做一次 resize 后几何复核；不能用容器 overflow 修改掩盖实际越界。

### 2.3 宿主保底恢复入口

- Preferences 和恢复默认设计必须有宿主拥有的保底入口，不能只依赖 `chat.ribbon` 被 Mod 重新挂载后的按钮。
- 保底入口放在 system overlay 层，z-index 高于 Design Mod；Mod 可以自行绘制更自由的控制，但不能让唯一恢复路径随组件挂载、裁切或异常一起消失。
- 保底入口调用现有 navigation/host command，不复制 `setUIPref`、主题真值或 DesignMod 生命周期。
- 设计入口的可见形态由实现者决定，不能把它做成遮挡整个窗口的强制系统栏；正常情况下应尽量轻量，异常或 active Mod 状态下仍可被发现。

### 2.4 诊断与状态

- diagnostics 明确记录 `builtin-default`、loading、active、error/fallback，以及 default shell 与 Mod layer 的可见状态。
- 激活失败时必须保持标准布局可见，且恢复入口不依赖失败的 Mod。
- 记录当前 active Mod 的 component attachment、viewport 尺寸和关键恢复入口状态，便于区分“未挂载”“被裁切”“被推出 viewport”和“层被隐藏”。

## 3. 不在本单范围内

- 不实现窗口外桌面绘制、透明 satellite、跨 WebView snapshot 或 native surface coordinator；这些属于 cc-tasks/56。
- 不重新设计 Ribbon 的视觉风格，不决定花朵、红线、透视 HUD 等具体美术方案。
- 不修改 Presence 后端、HTTP/WS 协议或手机端设置。
- 不把可信本地 Design Mod 改造成 iframe 沙箱或权限系统。

## 4. 验收标准

### 4.1 默认路径回归

- `builtin-default` 下启动时，Ribbon 的偏好、帮助、日夜切换始终可见；等待历史、状态、花园和字体异步加载后仍可见。
- 800x600 窗口、窄窗口、宽窗口和手动 resize 后，底部控制不会被聊天内容推到 viewport 外。
- Sidebar 开关、Sidebar tab、布局切换、Group view、Dream、Preferences、PaneHost 和 ChatPanel 输入/滚动行为不回归。
- ChatPanel、WS、HTTP、history、TTS、StateEngine 和 presenter 没有第二份 owner。

### 4.2 Design Mod 路径

- 选择 `freeform-capability-fixture` 后，Ribbon 和各 capability 的 portal 挂载仍可自由重排；标准布局壳层不再抢占可见层。
- fixture 在 800x600、窄窗口、宽窗口、resize、内部拖动和 Sidebar 变化后，底部控制和关键交互仍可达。
- Mod activate 抛错、资源读取失败、切换和刷新时，标准布局以及宿主恢复入口保持可用。
- 连续切换 Mod 20 次后，active attachment、listener、observer、rAF 和 presenter consumer 不递增。
- 切回 `builtin-default` 后，消息、草稿、滚动、Sidebar 数据和当前布局只保留一份 owner。

### 4.3 恢复入口

- 即使 `chat.ribbon` 没有挂载、被 Mod 裁切、被移出可视区或 Mod activate 失败，也能通过宿主入口打开 Preferences 并恢复 `builtin-default`。
- Preferences、Dream、错误恢复 overlay 的 z 层高于 Design Mod；正常点击聊天输入和 Mod 交互不被保底入口遮挡。

## 5. 测试与验证

### 5.1 静态与纯逻辑

- 补一个针对 host shell 尺寸/可见状态的纯函数或结构断言，覆盖 inactive、loading、active、error 四个阶段。
- 复核既有 Design Mod lifecycle、mount、geometry、presenter 和 recovery 测试；不引入 jsdom 组件测试栈。
- `npx.cmd tsc --noEmit`
- `npm.cmd test`
- `npm.cmd run build`

### 5.2 真实窗口

- 先读取 `Emerald-presence/docs/dev-environment.md`，再运行 `npm.cmd run tauri dev`。
- 在真实 Tauri 窗口检查 800x600、窄窗口、宽窗口、resize、加载历史、切换 tab、启用/停用 fixture 和 20 次切换。
- 记录默认壳层高度、Ribbon 底部按钮可见性、active layer、恢复入口和 diagnostics；不能只用浏览器 fallback 或静态截图宣称完成。
- Windows 验收通过后，再把 native satellite 的前置条件交给 cc-tasks/56；macOS/Linux 未验证部分写入 `docs/known-issues.md`。

## 6. 文档与三面闭环

- 更新 `ARCHITECTURE.md` 与 `docs/frontend-structure.md`，明确 DesignModHost 的尺寸契约、default shell、system overlay 和恢复入口所有权。
- 更新 `docs/design-mods.md`，补充“Mod 不得成为唯一恢复路径”和 host shell 的 viewport 约束。
- 更新 `docs/known-issues.md`：关闭当前按钮消失问题，并保留 54/55 真实窗口验收证据。
- 更新 `docs/backend-integration.md` 仅在新增/修改 Tauri IPC command 时；本单默认不新增后端接口。
- 后端管理面：无新增 Presence 配置、业务真值、队列、trace 或观测端点。
- 桌面设置面：保留现有 Design Mod 选择、刷新、诊断和恢复默认入口；手机端不增加入口。
- 原调用链：核对触发器、React portal、host command、navigation、StateEngine、WS/HTTP、presenter polling、pause/resume 和 fallback，确保只改变渲染挂载，不改变业务 owner。

## 7. 交付拆分

1. **A：默认布局高度链回归修复**：前置于 B/C。
2. **B：fixture 响应式与关键控件可达性**：依赖 A，可与 C 并行。
3. **C：宿主恢复入口与 diagnostics**：依赖 A，可与 B 并行。
4. **D：真实窗口验收与文档闭环**：依赖 A/B/C，完成后才允许 cc-tasks/56 进入实现。
