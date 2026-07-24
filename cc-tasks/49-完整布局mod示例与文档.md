# 49 · 完整布局 mod 示例 + docs/layout-mods.md

## 背景

47/48 号工单交付了 Layout Registry 基础设施和接线，但目前没有：(a) 一份真实可跑的示例
mod 证明整条链路能用，(b) 面向"人类作者 + agent"的双读者说明书（对齐 `docs/ui-mods.md`
的定位）。这是 `docs/ui-mods.md` 里 presence-glass 主题 mod 扮演的角色——本工单做的是
布局版的同一件事。

## 改动点

1. **示例 mod**：新建 `Mods/sidebar-right/`（目录名 = manifest id）：

   ```
   Mods/sidebar-right/
   ├── layout.json
   └── layout.css      # 可选，做一点装饰性验证（比如 sidebar 边框换色），保持 <100KB、
                        # 过 cssGuard 安检
   ```

   `layout.json` 内容示例（把 sidebar 排到右侧、缩窄默认宽度、ribbon 保持左侧）：

   ```json
   {
     "id": "sidebar-right",
     "name": "侧栏在右",
     "author": "示例",
     "version": "1.0.0",
     "direction": "row",
     "slots": {
       "ribbon": { "order": 0 },
       "main":   { "order": 1 },
       "sidebar": { "order": 2, "size": 280, "hidden": false }
     },
     "css": "layout.css"
   }
   ```

   这个示例必须**真实通过** 47 号工单的 `validateLayout` 和磁盘扫描（放
   `public/layouts/sidebar-right/` 做 dev 环境验证，安装版路径同 `Mods/` 约定，与主题
   mod 的 dev/安装版双路径策略一致），并在 48 号工单的 `LayoutHost` 下实际渲染出侧栏在右
   的效果——截图存证，不能只是"写了 json 但没跑过"。

2. **`docs/layout-mods.md`**（新建，结构对齐 `docs/ui-mods.md`）：
   - §1 一句话原理：布局 mod = 一份描述 ribbon/sidebar/main 三个 slot 排布参数的
     `layout.json`（可选配受安检的 `layout.css`）。**换排布不换组件**。
   - §2 系统架构图：三个来源（builtinLayouts.ts / 磁盘 `Mods/<id>/layout.json` 经 Tauri
     `list_layouts` / 用户当前选择持久化于 `chat.layout` pref）→ registry 合并校验 →
     `LayoutHost` 渲染 → ChatWindow 传入的 slot 内容不受影响。
   - §3 契约表：`direction`/`slots.{ribbon,sidebar,main}.{order,size,hidden}`，标注
     "必填/可选"和"hidden 仅 sidebar 合法"这条硬限制。
   - §4 mod 包格式：同 §4.1 的示例 json。
   - §5 打 mod 路径：目前只有"标准路径：磁盘 mod"一种（没有应用内可视化编辑器，
     不像主题系统有 ChatColorPage——如果觉得值得做一个可视化布局编辑器，本工单不做，
     留作独立工单）。
   - §6 CSS 安检：直接引用复用的 `cssGuard.ts` 规则，不重复写。
   - §7（关键）**"与功能 mod 的边界"**：明确写清楚——布局 mod 只能重排 ribbon/sidebar/main
     三个既有区域（顺序/方向/尺寸/sidebar 默认可见性）+ 装饰性 CSS；**不能**替换/新增组件、
     不能执行代码、不能改 Ribbon/Sidebar 内部结构（比如把竖排图标改横排属于组件级改动，
     不在范围内）。这类"真正任意"的布局/功能扩展仍然是 `docs/ui-mods.md` §8 的"功能 mod"
     范畴，需要独立的沙箱/权限设计讨论，不要在读者以为"布局 mod = 任意 UI"时产生误解。
   - §8 已知缺口：记录当前只有一个示例、没有可视化编辑器、pet 窗口和 overlay 类弹层不在
     范围内。

3. `docs/ui-mods.md` §8 加一句话，指向新文档：布局排布已有独立方案见
   `docs/layout-mods.md`；本文档 §8 讨论的"功能 mod"范围更广（可执行代码/自定义面板），
   仍未定案，两者不要混为一谈。

4. `AGENTS.md` 的"必读文档"表加一行：`改 mod / Layout Registry / 布局排布` →
   `docs/layout-mods.md`（连带 `docs/ui-mods.md`）。

## 验收

- 示例 mod 在 `npm run tauri dev` 下真实生效（附截图：默认布局 vs `sidebar-right`
  布局的对比）。
- `docs/layout-mods.md` 通读一遍能让一个没看过代码的人照着抄出第二个 mod。
- 全仓搜索确认没有遗留"布局 mod = 任意组件"之类的误导性描述。

## 依赖 / 并行

- 依赖 48 号工单（`LayoutHost` 落地）才能做真实截图验证；文档文字和 `layout.json`
  内容本身可以提前写，不阻塞开工，但**验收必须在 48 号工单合并之后**做一次真实运行验证，
  不能只交付纸面文档。
- 与 46/47 号工单没有直接依赖，但逻辑上是这批工单的收尾项，建议排在最后验收。
