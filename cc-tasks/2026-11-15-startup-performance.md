# 启动与交互提速（2026-11-15，current / 原生性能验收 open）

目标：主窗口尽早反馈，常用本地交互争取 200ms 内。200ms 不作为未经实测的整机冷启动、网络请求或模型加载承诺。

## 当前实现

- 主窗口原生背景色与 HTML 纸色底壳先显示；辅助透明窗口不显示主窗底壳。
- 在线字体改为非阻塞样式表，应用挂载后再启用；字体未就绪时使用既有系统 fallback。
- 窗口标题栏先挂载，本机偏好 IPC 后再载入依赖偏好的模块，保留文件权威及鉴权门禁。
- 聊天与鉴权门禁代码同时加载，等代码可用后挂载，消除嵌套 Suspense 的串行等待。
- Dream 与 16 个偏好子页按需载入；Ribbon 和偏好分类在指针靠近、键盘聚焦时预载代码。
- deferredComponent 对已预载代码同步渲染，冷加载通过局部状态更新显示，避免 Suspense reveal 延迟。卸载后不更新组件状态，导入失败交给既有错误边界。
- 消息入场及主题表面过渡上限 160ms，保留减少动态效果设置；不改角色表演、音频或后台业务节奏。

无跨端影响：只调整桌面代码加载与绘制顺序、原生背景色和 CSS 时长。没有新增设置、存储键、IPC/REST/WS 字段、后端能力、手机行为或权限规则；原本的偏好读取仍等待文件结果，主聊天仍在鉴权通过后挂载。预载不挂载页面，不提前启动页面 effect。

## 验证与数据

本机 Edge headless、生产 Vite preview、1280×900、模拟 Tauri IPC；字体响应人为延迟 1500ms。脚本：`node scripts/startup-performance-browser.mjs`，默认 preview 端口 1422，可用 `PERF_URL` 覆盖。

- 初始聊天 JS 解码体积：1,173,029 → 729,224 字节，约减少 38%；这是请求资源体积，不是完整安装包大小。
- 一次首次冷页面：框架 DOM 150ms，输入框 DOM 223ms，随后绘制机会 309ms。
- 同一浏览器 4 次热重载：框架 DOM 63–73ms，输入框 DOM 128–150ms，随后绘制机会 145–155ms。
- 点击 → 目标 DOM 出现后的绘制机会：偏好首次内容 87ms，预载后的常规设置 41ms，预载后的活动页 19ms。
- 模拟本机偏好延迟 1 秒：标题栏 68ms，输入框约 1185ms；标题栏不被 IPC 阻塞。
- 脚本验证鉴权未通过时不挂载 ChatPanel/不启动历史读取或原生 WS；导航保留原输入节点、草稿与唯一历史消息。
- 641 项 Vitest、TypeScript/生产构建、cargo check 通过；聊天恢复及 UI 导航浏览器回归通过，包含失败重试、历史/WS 去重、迟到 HTTP、后端切换失效、Dream 与 Design Mod 导航。
- `check:naming` 仍被未修改的 rigProfile/backgroundAssets/clipPlayer/roomToonValidation 测试中 5 处既有名称阻断，本轮新代码无命中。
- 产物：ignored 的 `.tmp/startup-performance.json`、`.tmp/startup-performance.png`。帧时间来自 DOM 观察与 requestAnimationFrame，代表浏览器绘制机会，不等于显示器实际呈现的精确时刻。

## open

真实安装版从进程创建到可见、冷 WebView2、慢盘/杀毒、多显示器/GPU、透明 Pet/Room 窗口及网络/大模型加载尚未做计时验收。首次冷页面本轮超过 200ms；不能据此宣称所有启动和所有按钮均达标。打包体积仍有约 951kB 的模型链路 chunk 告警，其不属于本轮聊天首屏的必要加载。
