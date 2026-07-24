# 48 · ChatWindow 接入 LayoutHost（三栏改为按 registry 渲染）

## 背景

47 号工单交付了 `src/shared/layout/registry.ts` 但没有任何 UI 消费它。当前
`ChatWindow.tsx`（46 号工单落地后应已瘦身到 ~400 行）的 return 里，Ribbon / Sidebar /
Divider / 主内容区是硬编码的 JSX 顺序（原 1523–1585 行一带）：

```
<Ribbon .../>
<div className="chat-ui__body">
  {sidebarOpen && <><SidebarPanel .../><Divider/></>}
  <div>{ChatPanel / GroupListPanel / GroupChatPanel}</div>
</div>
```

本工单把这段固定 JSX 换成一个通用的 `LayoutHost`，按当前生效的 `LayoutManifest` 决定三个
slot 的顺序、方向、尺寸、sidebar 默认可见性；三个 slot 里塞的**元素本身**（Ribbon 实例、
SidebarPanel 实例、主内容区）仍然由 `ChatWindow.tsx` 按原逻辑构建好再传进去——`LayoutHost`
只管排布，不管这几个组件内部做什么、拿什么 props，维持 47 号工单里"mod 不能替换组件"的
边界。

## 改动点

1. 新建 `src/windows/chat/components/LayoutHost.tsx`：

   ```ts
   function LayoutHost({ manifest, slots }: {
     manifest: LayoutManifest;
     slots: Record<SlotId, React.ReactNode>;
   }) { /* 按 manifest.direction + manifest.slots[*].order/size/hidden 渲染 flex 容器 */ }
   ```

   - 用 CSS flex（沿用现有 `chat-ui__body` 的 flex 布局思路，不引入 grid，除非验证后发现
     flex 无法表达某种排布再升级）。
   - `order` 直接映射 CSS `order`；`sidebar.size` 映射宽度（原 `sidebarWidth` 状态改为传入
     而非硬编码）；`sidebar.hidden` 映射默认 `sidebarOpen` 初值（用户运行时仍可通过 Ribbon
     手动展开/收起，manifest 只决定**默认值**，不剥夺用户交互——这点需要和 46/47 号工单
     产出的现状对齐：`sidebarOpen` 现有 state 逻辑不变，只是初始值来源从字面量 `true`
     改为 `!getLayout manifest.slots.sidebar.hidden`）。
   - Divider（46 号工单已迁到 `ChatShellAtoms.tsx`）只在 `sidebar` 可见时渲染，位置跟随
     sidebar 的 `order` 自动排在其相邻侧，不需要单独的 order 字段。

2. `ChatWindow.tsx` 的 return 部分改为：

   ```tsx
   <LayoutHost
     manifest={activeLayout}
     slots={{
       ribbon: <Ribbon ... />,
       sidebar: sidebarOpen ? <SidebarPanel ... /> : null,
       main: <div>{groupView === null ? <ChatPanel .../> : ...}</div>,
     }}
   />
   ```

   订阅 `layout/registry.ts` 的 `subscribe()`，用 `useState(() => getLayout())` +
   effect 里 `listLayouts()` 拿到 `activeLayout` 的 `LayoutManifest`（不是 id，`LayoutHost`
   需要完整 manifest 来读 slots 参数）。

3. 背景层（`chat-ui__background` / `ParticleBackground` / `VideoBg`）、以及 `dreamWindowOpen`
   / `PaneHost` / `SpecPanel` / `PreferencesPanel` / `YandereOverlay` / `DreamAfterglowBanner`
   等 fixed-position overlay **不进入 LayoutHost 的 slot 体系**，保持在 `ChatWindow.tsx`
   顶层原样渲染（它们是应用级单例弹层，不是"排布"的一部分，47 号工单的契约里也明确没有
   覆盖它们）。

4. 偏好面板「外观」页可以加一个只读的"当前布局"信息行（显示 `activeLayout.name` +
   来源 builtin/disk），**不需要在本工单里做布局切换 UI**（选择/切换布局的入口本身不是
   本工单范围，若顺手做了不算过度施工，但验收不强制要求）。

## 验收

- 默认 `obsidian-default` 布局下，视觉和交互与改动前**逐像素一致**：Ribbon 在左、
  Sidebar 默认展开且宽度 340、Divider 可拖拽、主内容区行为不变。这是本工单最重要的
  验收项——截图对比改动前后。
- 手工放一份改了 `direction: 'row-reverse'` 或调换 `order` 的临时 manifest（可以直接用
  49 号工单准备的示例 mod 提前验证），确认 Sidebar 能被排到右侧、Ribbon 排布随之调整，
  且拖拽 Divider、展开/收起 Sidebar、发消息等交互全部正常。
- `npx.cmd tsc --noEmit` + `npm test` 通过。
- `docs/frontend-structure.md` 的 "ChatWindow" 一节补充 `LayoutHost` 说明（slot 是什么、
  manifest 从哪来、overlay 为何不在 slot 体系内）。

## 依赖 / 并行

- 依赖 46 号工单（在瘦身后的文件上改）与 47 号工单（需要 `registry.ts` 的
  `listLayouts`/`getLayout`/`subscribe`）先落地。
- 49 号工单（示例 mod + 文档）依赖本工单跑通后才能做真实验证，但示例 mod 的
  `layout.json` 内容本身可以提前写、不阻塞本工单开工。
