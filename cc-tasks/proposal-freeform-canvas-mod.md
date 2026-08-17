# 提案：功能 mod / 自由画布（freeform canvas mod）

> 状态：已被 `cc-tasks/54-trusted-design-mod-runtime.md` 取代。本提案对应 `ui-mods.md` §8 预留的"功能 mod"坑位——
> 现有 UI mod（token+CSS）和布局 mod（三槽位受控模板）都是纯声明式、零执行代码，这份提案是
> 第一次真正开放"执行代码 + 自由定位"的口子，性质上是新的信任级别，不是前两者的扩展。
>
> 当前实现路线、component/signal/command 契约和作者流程见 [`docs/design-mods.md`](../docs/design-mods.md)。
> 本草案中的 iframe、postMessage、elementSpec 白名单不再是第一版路线。

---

## 1. 要解决什么

现有两套 mod 系统的天花板：
- UI mod：只能改 CSS 变量值 + 受限 CSS，做不到"跟随鼠标实时变化"这种连续交互
- 布局 mod：只能在 ribbon/sidebar/main 三个固定槽位里重排，做不到"面板脱离固定槽位自由悬浮"

具体要放开的能力：
1. 元素可以脱离 ribbon/sidebar/main 三槽位，任意定位（包括视觉上"溢出"到窗口边界外的效果）
2. 能监听鼠标位置等交互事件，实时驱动颜色/大小/位置变化（不是 CSS `:hover` 那种离散状态）
3. 面板之间可以有"连线"这类需要动态计算路径的视觉元素（连接点会跟着两端元素移动而重新计算）

## 2. 执行环境：iframe sandbox + postMessage，不用裸 `<script>` 注入

**结论先行**：mod 的 JS 代码跑在一个 `sandbox` 属性锁死的 `<iframe>` 里（不给
`allow-same-origin`），跟主应用之间只能通过 `postMessage` 通信。这不是为了防"恶意开发者"，
是为了三件事，都是纯工程收益：

- **崩溃隔离**：mod 的死循环/内存泄漏炸的是 iframe 自己的进程/上下文，不拖垮主聊天窗口
- **多 mod 共存**：以后如果同时装两个功能 mod，互相之间天然没有全局变量污染，排查 bug 时不用怀疑
  "是不是另一个 mod 干的"
- **API 面收窄到看得过来**：iframe 里没有 `window.opener`、拿不到主应用的 DOM、没有 IPC 权限，
  mod 能干什么完全取决于我们往 `postMessage` 通道里塞了什么方法——相当于我们自己定义一份"这个
  mod 能看到的世界"

## 3. Capability API：暴露方法，而不是暴露 DOM

Mod 侧代码通过一份受限 SDK 调用能力，SDK 长这样（草案，方法名随便改）：

```js
// mod 代码里能拿到的对象，运行时由主应用通过 postMessage 桥接实现
PresenceCanvas.mount(elementSpec)      // 声明一个可自由定位的视觉元素，返回一个 handle
PresenceCanvas.onPointerMove(cb)       // 订阅鼠标坐标，cb(x, y) 是应用坐标系而非屏幕坐标
PresenceCanvas.connectLine(handleA, handleB, style)  // 两个 handle 间画一条会跟随移动的连线
PresenceCanvas.setStyle(handle, cssVarPatch)         // 只能改预定义的一批 CSS 变量，不能任意改 DOM
PresenceCanvas.getThemeToken(name)     // 读当前主题 token，方便 mod 里的颜色跟主题联动
```

**没有的东西（第一版故意不给）**：`fetch`/网络请求、`localStorage`/任何持久化、访问聊天消息
内容、访问其他窗口。不是信不过 mod 作者，是这几项一旦开了口子，出了问题的排查成本和现在完全不是
一个量级，先不给，之后真需要了再单独评估、单独开一条通道，比一开始全给然后收权限容易得多。

## 4. mod 包格式（跟现有系统的关系）

```text
canvas-mods/<id>/
├── manifest.json     ← id / name / author / version / entry
└── entry.js          ← 跑在 sandboxed iframe 里的代码，只能调 §3 的 SDK
```

**跟 UI mod / 布局 mod 是并列关系，不是替代**：一个"完整视觉方案"可以同时包含
`theme.json`（颜色）+ `layout.json`（槽位排布）+ `canvas/entry.js`（自由漂浮元素），三者独立
校验、独立可选启用。装了 canvas mod 不代表必须也装配套主题，反过来也一样。

## 5. 关于"主题+布局要不要合并"

我的建议是**分发层面合并，校验层面不合并**：可以做一个"设计包"概念——
```text
design-packs/<id>/
├── pack.json          ← 只是个索引：引用下面三个子目录各自的 id
├── theme/
├── layout/
└── canvas/
```
ThemePicker/布局预览/canvas 面板各自还是按自己的校验规则读取子目录，互不干扰；但用户"一键应用"
一个 pack 时，三边一起装/一起切换，创作和使用体验上是一体的。这样任何一边（比如 canvas mod）
出问题，不会把颜色 token 校验也一起拖挂。

## 6. 第一版最小闭环建议

不建议一次性把 SDK 做全，建议先做能跑通"神经网络连线 + 鼠标响应变色"这一个具体效果所需的最小
API 集（`mount` / `onPointerMove` / `connectLine` / `setStyle` 四个方法），做完拿这个真实
案例去验证 API 设计是否够用，比先设计一整套完整规范再一次性实现风险小。

## 7. 留给 gpt-sol 拍板的问题

- iframe sandbox 的具体 `sandbox` 属性组合（要不要给 `allow-scripts` 之外的任何权限）
- `postMessage` 通道的消息校验/频率限制怎么做（防止一个 mod 高频调用拖垮主线程）
- entry.js 有没有体积/复杂度上限（现有 CSS mod 是 100KB，JS 这边要不要对齐或另定）
- 要不要做一个开发态的"调试面板"，方便看 mod 崩溃时的报错（不然 iframe 里的报错默认很难查）
