# Room 电视机前端三渲二材质验证（2026-10-11）

范围：Room 中 TV_Character_Rigged_v02/v03；不改 GLB、动作、Pet、后端和手机。
入口：临时 URL 参数 roomToon=1（重载启用），不新增落盘设置或通信合同。

- [x] 审计：Room shadows 全场开关使角色 cast/receive；key 与 extra shadow；grade bloom 是全屏亮度阈值。v03 无 materials 侧车，初始加载也不保证应用 toon。
- [x] 参考研究：优先考察 pixiv MToon 的 shade/rim/outline；本轮选择 Three MeshToonMaterial 分段 ramp + rim shader patch，免 VRM 导入合同与新依赖。
- [x] P1 保留源色/UV/透明属性，保护屏幕驱动；角色暗面托底、平涂与边缘高光。
- [x] P2 OutlinePass 可控描边 + 显式材质白名单选择性 UnrealBloomPass；不让房间和整件白衣参与 bloom。
- [x] P3 背景独立无光照材质、渐变环境、氛围面；固定干净主光与弱填充。
- [x] P4 验证模式关闭实时阴影，添加轻量假接触阴影。
- [x] 固定真实 v03 GLB、同机位/同静止姿势浏览器 WebGL 前后截图；记录渲染错误与资源情况。
- [x] tsc、build、最小渲染生命周期/隔离测试，文档与独立提交。

依赖：P1 → P2；P3/P4 可独立实现；对比依赖四项完成。
验收边界：浏览器真实 WebGL 与源 GLB 对比；真实 Tauri/WebView2、动态穿插、发行版和 GPU 性能为 open。
三面闭环：本仓临时纯渲染实验，无跨端影响，无能力/落盘/IPC/REST/WS 变更；无需后端管理或手机 UI。
完成证据：定向 6 tests、tsc/build 与真实 WebGL 五帧恢复检查；截图/渲染报告见 docs/room-toon-validation.md。真实窗口验收仍 partial。
