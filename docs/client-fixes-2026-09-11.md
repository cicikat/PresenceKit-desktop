# 视频通话、模型与聊天修复（2026-09-11）

状态：partial，逐项实现与验证记录如下；真实 Tauri 窗口和跨端联调仍为 open。

七项可独立交付；模型渲染验收依赖本机 runtime/Core，聊天隔离与加载回归依赖同一模拟 WS。

## 1. 视频通话视觉

RoomWindow.css 增加环境渐变、缓慢光晕、舞台边缘光、玻璃状态提示、说话波形和控件反馈。
颜色取既有 mood，状态取既有 presenter；装饰 pointer-events:none，不阻断模型点击/拖动。
支持 prefers-reduced-motion。浏览器两版真实 Live2D 画布目检通过；Tauri 3D 操作/麦克风 open。

## 3. 群聊隔离

普通聊天和视频通话使用 shared/api/realityMessageScope 过滤 round_id、非 reality
source/domain 和非当前角色。WS 保留既有 source 字段；增量/结束只更新已接受的 msg_id。
群聊订阅不变，传输层 ack 不变，不删除历史或用户数据。
验证：纯函数回归覆盖 legacy、当前角色、群聊当前/其他角色、梦境、角色切换。

## 5. 思考正文宽度

移除正文 640px 上限，保留换行与容器内边距，正文随聊天内容区伸缩。
验证：1920px 浏览器正文宽度大于 640px，且与父容器等宽；真实 Tauri 最大化验收 open。

## 4. 加载占位

stream_start 不再提前撤下加载气泡；首个可见段落到达时才交接给正文。
空临时流不渲染空壳；HTTP 错误/最终回复/fallback 沿用原有收尾。
验证：浏览器模拟慢首 token，等待 1.2 秒保留同一加载节点；空主动流结束不残留加载。
canonical 替换同时关闭加载。HTTP 错误和断流 fallback 的真实窗口验收 open。

## 6. 窄栏输入

使用 ChatPanel 实际容器宽度切换紧凑输入布局：文本占整行，工具按钮横排到下一行；
按钮不挤压文本，输入框保留水平书写、隐藏滚动条（仍可键盘/滚轮滚动长内容）。
输入栏自身的容器查询同时覆盖 workbench/hud。LayoutHost ≤640px 侧栏改浮层，避免
固定侧栏挤没主聊天。浏览器 1280/700/420px 检查通过，420px 输入框约 330px 宽。
真实 Tauri DPI、第三方 Layout Mod 组合验收 open。

## 7. 一起做事偏好

偏好滚动区 grid 改为 align-content:start，避免少量设置撑满窗口形成巨大行距；
陪玩与活动外观统一 18px 间距，活动下拉采用紧凑宽度。设置值、权限和 API 未改动。
验证：浏览器 18px gap、140px 下拉宽度及截图目检；真实窗口验收 open。

## 2. Live2D 模型与分类

下载包的 runtime 分别导入 public/live2d/models/hiyori_free 和 hiyori_pro，保留贴图/动作
相对路径，未复制 Cubism 编辑工程。资源与已有 Core 按 gitignore 留在本机。
视频通话偏好顶部提供 3D/Live2D 两个显式分类按钮；桌宠 Live2D 分类直接提供模型选择，
沿用同一 live2d.settings 与跨窗口同步，不新增第二份模型真值。
验证：free 12 项/pro 16 项文件引用完整，Idle 动作组存在；浏览器两版实际渲染与切换通过。
模型大文件/Core 不提交，也未修改用户已有的模型选择。

## 验证汇总

- npm test：58 个测试文件、243 项测试通过。
- npm run build：通过（包含 TypeScript；现有大 chunk 提示仍在）。
- scripts/client-fixes-browser.mjs：通过，模拟 Tauri/WS，不连接真实后端；加载真实本机模型。
- 浏览器截图：.tmp/client-call-live2d.png、client-call-live2d-free.png、client-composer-narrow.png、
  client-reasoning-wide.png、client-preferences.png（均在 .tmp 下，不提交）。
- 未改 Rust，不需要 cargo check；未声明 release/真实设备验收完成。

## 三面闭环检查记录

- 后端 channels/desktop_ws.py 的 stream_start 已包含 source 和可选 char_id/round_id/domain，
  delta/end 仅靠 msg_id 关联；本次修复客户端消费，不新增协议或后端配置。
- 管理面权限、默认值、effective state、队列、trace、审计、TTL 沿用既有链路。
  模型目录和外观都是桌面本地偏好，不映射成后端总开关。
- 手机已有独立群聊入口；本次不修改 Flutter、Android 或 relay。
  手机群聊与单聊并行、后台中继隔离的真机验收为 open。
- 后端总账同步为 open：遵循本任务不修改 Emerald-presence 的仓库边界，
  由后端后续将本节同步到 docs/three-repo-interface-catalog.md。
- 桌面需实测普通聊天/群聊/梦境/视频通话切换、慢首 token、HTTP fallback、模型渲染，
  静态测试不代表以上真实窗口验收完成。
