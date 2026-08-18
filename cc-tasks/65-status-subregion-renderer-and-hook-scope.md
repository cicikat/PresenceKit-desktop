# 65：Status 子区域官方 renderer 与 hook 作用域

> 状态：partial/open。Status 三个官方 portal、mount-local CSS hook contract、纯逻辑回归和
> fixture 已完成；Windows debug 实窗、宽窄窗口和 100%/125%/175% DPI 验收仍未完成，本单不把
> 静态检查冒充视觉验收。

## 1. 证据

- `src/shared/design-mod/contract.ts` 已登记：
  `chat.sidebar.status.mood`、`chat.sidebar.status.activity`、
  `chat.sidebar.status.timeline`。
- `ComponentAttachmentRegistry`、`DesignModHost` 和 `setComposition('status', ...)`
  已能校验并接受这些 id。
- `src/windows/chat/components/SubStatus.tsx` 现在将 `mood`、`activity + presence`、
  `telemetry + timeline` 分别放入三个 `DesignAwareRegion`；每个官方子区 mount 都复制
  一份 mount-local `--status-*` style。
- active Mod 的隐藏源树只为实际 attach 了父/子 renderer 的 capability 创建；
  `presenter-only` 不再启动隐藏 `SubStatus` 的 presenter acquire、sensor 或 timeline timer。
- `public/design-mods/freeform-capability-fixture/entry.js` 现在同时 attach 三个 Status 子区，
  并将 timeline 容器扩大到能容纳 telemetry 与轨迹内容的高度。

## 2. 目标

1. 冻结 Status 子区的 renderer 边界：明确 `mood`、`activity`、`timeline` 各自包含哪些
   官方 DOM；presence/telemetry 若不单独开放，必须在文档中写明归属和 fallback 行为。
2. 为三个已登记 id 提供一致的 `DesignAwareRegion` portal 和 fallback 行为；父能力、子区域、
   `presenter-only` 三种 composition mode 在默认布局、Mod layer 和快速切换中都不重复渲染。
3. 让官方 renderer 需要的视觉变量在 portal 后仍有明确来源：要么把变量写到每个官方子区
   mount，要么提供宿主明确的 scoped style contract；禁止依赖 document/global 偶然继承。
4. 保持 `host.presenters.status` 为自绘 renderer 的唯一稳定数据源，不复制 StateEngine/sensor
   真值，不新增后端、手机、HTTP、WS、Tauri IPC 或持久化状态。

## 3. 实现与测试

- 补 `SubStatus` 的子区 portal，并用可测试的纯 mapping/contract helper 覆盖父子所有权、
  `official-renderer`、`subregions` 和 `presenter-only` 组合；不引入 jsdom 组件测试栈。
- 为 Status hook scope 增加纯逻辑契约测试；至少证明自定义 renderer 从 presenter 获取 hue/aura/
  breath 等值时不依赖官方 DOM 继承。
- 更新 `docs/design-mods.md`、`docs/design-mod-authoring.md`、`docs/frontend-structure.md`
  和 `docs/known-issues.md`，同步 primitive 归属、CSS 变量作用域及 fixture 状态。
- 在 Windows debug 中验证默认 Status、`subregions`、`presenter-only` 来回切换，确认 activity/
  timeline 不留在 hidden tree，mood glow/indicator 样式无空变量；宽/窄窗口与 100%/125%/175%
  DPI 至少各观察一次。未完成真人窗口验证时保持 `partial/open`。

## 4. 非目标

- 不实现新的 Status 数据字段、传感器算法、后端设置或移动端消费。
- 不要求 native satellite；贴边/漂浮错觉继续使用主 WebView 的 underlay/components/overlay、
  `host.scene` 与 `host.edges`。真实越窗能力仍受 native satellite 平台状态限制。

## 5. 本轮落地

- `SubStatus` 现在将 `mood`、`activity + presence`、`telemetry + timeline` 分别挂到三个
  `DesignAwareRegion`；根级错误 / 重试条继续归父 Status renderer。
- `statusRendererContract.ts` 冻结子区归属、三种 composition 的 attachment/fallback 规则，
  并从 `StatusPresenterSnapshot` 直接生成每个官方 mount 使用的 `--status-*` 变量。
- fixture 改为同时 attach 三个 Status 子区；`presenter-only` 仍要求 Mod 完全消费
  `host.presenters.status`，不复制官方 DOM。
- `npm test`（50 files / 210 tests）、`npx.cmd tsc --noEmit`、`npm.cmd run build`、fixture
  `node --check` 和命名检查已通过；真实 Windows 窗口验收保持 `partial/open`。
