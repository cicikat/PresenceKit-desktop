# 46 · ChatWindow 拆分：抽离 PreferencesPanel 及内嵌组件（纯搬运）

## 背景

`src/windows/chat/ChatWindow.tsx` 现有 1659 行，混杂三类不相关职责：

1. 布局壳（Ribbon + Sidebar + ChatPanel/Group 面板 + Divider + 背景层 + 各类 overlay），约 350 行——真正的"布局"部分，见第 1506–1657 行 return。
2. App 级编排状态（StateEngine、主题、pet bridge、dream 状态机、WS 转发、appearance/字体加载）——跨切面胶水代码，不属于布局，也不该塞进 mod，见第 1263–1505 行。
3. **一个完整独立的偏好设置弹窗**（`PreferencesPanel` 及其子组件），第 106–1215 行，约 900 行，与"布局"毫无关系，纯粹是历史上被就地塞进了 ChatWindow.tsx：
   - `PreferencesPanel`（8 个 tab 的设置浮层本体，106–633 行）
   - `PromptAssetsSettings`（世界页，722–996 行）+ `PromptAssetChecks`（998–1030 行）
   - `ChatSettingsSection`（对话设置，1119–1215 行）
   - UI atom：`PrefRow` / `PrefRange` / `PrefSwitch` / `MinuteSelect`（1055–1116 行）
   - 布局用小组件：`Divider`（1218–1235 行）、`VideoBg`（1238–1260 行）

本工单只做**第 3 类的纯搬运**，不改变任何行为、不涉及 Layout Registry。目的：
- 让后续 47/48 号工单只需面对"布局壳 + 编排状态"，不必在一个 1659 行文件里定位代码；
- 这部分本身也是 UI 组件拆分诉求的一部分，可独立验收、独立 commit，不依赖 47/48。

## 改动点

1. 新建 `src/windows/chat/components/preferences/` 目录，按下表迁移（原样搬运代码体，只做必要的 import 路径调整，**不重构内部逻辑、不改 props 形状**）：

   | 新文件 | 内容 |
   |---|---|
   | `PreferencesPanel.tsx` | 106–633 行的 `PreferencesPanel` 组件本体 |
   | `PromptAssetsSettings.tsx` | 722–1030 行的 `PromptAssetsSettings` + `PromptAssetChecks` |
   | `ChatSettingsSection.tsx` | 1119–1215 行的 `ChatSettingsSection` |
   | `PrefAtoms.tsx` | `PrefRow` / `PrefRange` / `PrefSwitch` / `MinuteSelect` + 共享样式常量 `prefSelectStyle` / `prefActionButtonStyle`（1032–1116 行） |

2. `Divider`（1218–1235 行）和 `VideoBg`（1238–1260 行）搬到 `src/windows/chat/components/ChatShellAtoms.tsx`（这两个是布局壳用的小组件，不属于偏好面板，单独归类，为 48 号工单预留位置）。

3. `ChatWindow.tsx` 改为从上述新文件 import，删除已迁移的代码体。迁移后 `ChatWindow.tsx` 应只剩：文件头 import、`ChatWindow` 函数本体（原 1263–1659 行的状态/effect/return）。预期行数降到 ~400 行以内。

4. 不改变任何组件的 props、行为、样式、DOM 结构。这是一次 `git mv`-级别的搬运，允许的改动仅限于：import 路径、TypeScript 因跨文件产生的类型标注补充。

## 验收

- `npx.cmd tsc --noEmit` 通过。
- 目测/截图对比：打开偏好面板 8 个 tab（系统设置/外观/色彩自定义/世界/桌宠/对话/视频通话/其他），逐一确认渲染与交互与改动前一致（重点：世界页角色卡切换、头像上传裁剪、对话设置保存 toast）。
- `docs/frontend-structure.md` 的 "ChatWindow" 一节同步新文件结构（更新"文件："下的目录树，说明 `components/preferences/` 的职责边界）。
- 无需改 `AGENTS.md`（目录结构图是概览级别，允许不逐条同步，除非 47/48 落地后一并更新）。

## 依赖 / 并行

- 无依赖，可立即开始，且**必须先于 48 号工单**完成（48 号要在瘦身后的 ChatWindow.tsx 上动刀，避免在 1659 行文件里重复劳动）。
- 与 47 号工单（Layout Registry 基础设施，纯新增文件不碰 ChatWindow.tsx）完全独立，可并行。
