# 启动白屏修复与首屏提速（2026-11-27）

状态：current；浏览器交互回归通过；安装版原生冷启动与稳定 200ms 目标 partial / open。

## 原因与实现

- 改动前的生产构建在 React 挂载前抛出 ReferenceError（Cannot access 'Hu' before initialization），停留在 index.html 的绿色栏与纸色空底壳。最小复现为生产 preview + 隔离 Tauri IPC，页面无需访问真实后端就失败。
- activeCharacter → backend → authGate → activeCharacter 的静态导入环，让 authGate 顶层读取了尚未初始化的角色缓存 KEY。角色缓存取消静态 backend 依赖，只有显式刷新角色时动态导入后端包装。保留角色选择、Session scope 与连接失效订阅。
- main.tsx 只负责窗口框架与分流。主聊天及视频来电事件迁至 windows/chat/AppRoot.tsx；Room/Toy 仍按需加载，ChatPanel 在覆盖页期间保持挂载。
- 偏好 IPC、AppRoot 与 Onboarding 代码并行；仍等待权威偏好文件就绪后挂载依赖偏好的组件。没有使用本机缓存绕过文件或鉴权。
- Onboarding 代码就绪时预查本机 token 配置，检查与偏好、聊天代码加载重叠；挂载复用结果。失败、超时、显式重试和 401 门禁保留。预查不建立 Session、不读取历史、不启动聊天 WS。
- PreferencesPanel 和图片裁剪链路改为首次打开时加载，Ribbon 指针/键盘意图预载。首次打开后持续保留实例，关闭重开保留分类和内部状态。首次来自活动页的入口仍默认进入界面分类。

## 验证与计时

命令：npm.cmd run build、npm.cmd test、node scripts/startup-performance-browser.mjs。生产 preview 使用 1422；浏览器为 headless Edge，1280×900，全部 IPC 隔离，在线字体样式表延迟 1500ms。

- 改动前：生产页面启动即报循环依赖异常，无法进入输入框。
- 最终完整回归：首次页面标题栏约 64ms，输入框 DOM 111ms，随后两次 rAF 的绘制机会 195ms；5 次热重载绘制机会 60–69ms。
- 中间相同最终运行逻辑的多轮首次页面约 193–216ms；较早未拆设置页版本曾达 258ms。最后一次低于 200ms 不代表稳定冷启动达标。
- HTTP 缓存清空重载仍复用浏览器进程、V8 与字体缓存；脚本明确命名 cacheCleared 与 warmReloads，不当作 5 次原生冷启动。
- Chrome tracing 观察到首轮约 76ms 的 Layout；属于首次排版开销，尚未证明可稳定压到 200ms 内。
- 最终首屏 JS 解码请求总量 854,187 字节；拆设置页前 904,976 字节，减少约 50.8kB。统计为页面输入框就绪后的资源，不是安装包体积。
- 设置首次内容约 88ms，预载常规设置约 41ms，预载活动约 18ms。
- 模拟偏好读取延迟 1 秒：标题栏约 54ms，输入框绘制机会约 1063ms；保持文件权威，不为指标跳过偏好。token 检查在偏好返回前已发起。
- 已验证历史唯一、草稿和输入节点保持、设置关闭重开保留分类、登录未配置不挂载聊天/不读取历史/不连原生 WS、配置读取失败可重试恢复、页面无 JS 异常。测试夹具补齐现有 Reality Session 授权形状，并保留异常调用栈与 CRLF 边界校验。
- 659 项 Vitest 通过；TypeScript / Vite 生产构建通过。未改 Rust，未重新运行 cargo check。

结果位于 ignored 的 .tmp/startup-performance.json 与 .tmp/startup-performance.png。

## 三面检查与边界

无跨端影响：这是本仓启动导入、渲染和设置代码加载的内部重构，没有新增设置、落盘字段、IPC/REST/WS 契约、管理面板能力或手机行为。现有 get_token_status、load_ui_prefs、角色/Session 校验继续走原路径，未绕过鉴权或修改后端/手机仓库。

open：真实安装版从进程启动到 WebView2 可见及聊天可用、真实偏好文件 IO、不同 DPI/GPU/杀毒环境尚未计时；稳定 200ms 全冷启动不能宣称通过。未部署或正式发布，现有安装包不会自动包含源码改动。
