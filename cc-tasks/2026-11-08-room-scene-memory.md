# 视频通话房间内存优化（2026-11-08）

用户反馈：视频通话功能稍大的场景文件打不开或很卡，要求做内存处理。

## 诊断（已完成）

最大热点在 Rust→前端的 GLB 加载通道：`read_room_asset`（`src-tauri/src/lib.rs:929`）把整个 GLB 读进内存并 base64，再经 Tauri IPC 整串传给前端。50MB 文件会在 Rust、JSON、JS 字符串、GLTF 解析之间同时存在多份拷贝。道具（`loader.load('/room/props/...')`）和动作（`read_room_motion_file` base64）走同一要是大坑直出。`useRoomScene` 里角色/场景/道具各来一次，切换时虽有 `disposeModel`，仍有短时数倍峰值。

叠加项（同属同一窗口内存/CPU 压力）：
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`：高分屏下后处理与阴影显存翻倍。
- `upgradeToon` 分支常驻双 composer（`RoomToonValidation`），grade 也按需但可长期开启。
- 主循环无条件 `requestAnimationFrame`，隐藏窗口仍跑（`document.hidden` 只拦截渲染但不停 rAF/动画/骨骼计算）。
- `fitSceneClipRange`、`applyShadows` 等在加载后做全场景包围盒/遍历，本身不致死，但大模型下放大峰值。
- roomAssets 加载没有取消令牌：快速切换场景/角色时多份加载在后台积压。

## 施工计划

1. **降渲染上限**：`setPixelRatio(min(dpr,1.5))`，resize 防抖，`composer.setSize` 同步，隐藏时停 rAF 并 `clock.getDelta()` 丢弃堆积 dt。
2. **换加载通道**：Rust `read_room_asset`/`read_room_motion_file` 改为返回文件路径/asset URL，前端用 `convertFileSrc` 直拉取，删掉 Rust 端 `fs::read` + base64；前端 `roomAssets.ts` 对应改。
3. **回收与取消**：切换时 `dispose` 几何/材质/纹理/动画/拖尾资源；加载加 token 取消，过期结果不入场并释放；大场景加大小/失败提示。
4. **观测**：记录峰值内存（`performance.memory` 可用处）与加载耗时（日志/浏览器断言）。

## 三面闭环

后端管理面：无新增设置开关；若需大小上限需后端确认，暂不新增 IPC 契约以外的字段。手机：不消费房间 GLB，跨端无影响。本机：`read_room_asset`/`read_room_motion_file` 的返回形状变更属于本仓 IPC，须同步更新 `docs/backend-integration.md` 与 `roomAssets.ts` 注释。通话的摄像头/语音/对话链不动。

## 验收

- [ ] 50MB+ 场景/角色可正常打开，无 base64 IPC。
- [ ] 切换 10 次内存不单调上升（浏览器 Performance/任务管理器）。
- [ ] `npx tsc --noEmit`、`npm run build`、`npm test` 通过；`cargo check` 通过（改了 `src-tauri/`）。
- [ ] 真实 Tauri 窗口大场景验证未完成记 partial/open。

## 评审补强（P0/P1 已落地，P2/P3 待办）

### 1. convertFileSrc 的 scope 与 CSP（P0 补强）

当前 Rust 端已做文件名白名单（仅 `character|scene`、单文件名、`.glb`），canonical 后只回路径字符串；Tauri asset protocol/CSP 需要只允许资产目录。已在检查范围内，无开放盘符。待办：`tauri.conf.json`/`capabilities` 中显式 scope 资产目录与 `connect-src`，并对返回路径加 canonical 包含性校验（防止 symlink 跳出）。

### 2. dispose 对共享资源的处置（P1 补强）

`disposeModel` 当前逐 mesh 释放 geometry/material/纹理；若角色与场景共享同一纹理/材质，卸载一处会误释放另一处。待办：dispose 时先去重（同一 texture/material 只释放一次），并对可共享资源走引用计数或仅由所有者 dispose；骨骼/动画 clip 的释放点需显式列出。

### 3. 文件大小 ≠ 显存（P2 补强）

Rust 端 200MB 仅防极端输入，不代表显存可承受。4096×4096 RGBA + mipmap ≈ 80MiB/张，50MB 压缩 GLB 可轻松占用数百 MB。待办：加载后估算纹理/几何总显存（纹理 w×h×bpp×(1+mipmap) + 顶点/索引），超预算时降分辨率或拒载并提示；`read_room_asset` 的大小上限应与预算联动。

### 4. 双阶段加载与相机隔离（P2 补强）

`loadTokenRef` 已保证快速切换时过期结果不入场并 `disposeModel`；相机走独立 `useVideoCallCamera`（停止不触 3D 卸载），卸载 3D 场景不会停摄像头/麦克风/WebRTC。待办：把"先卸载、再加载"固化为显式阶段（准备→预算→释放旧→加载新→完成），大场景用先卸载避免双场景峰值。

### 5. 验收补强（P3）

除小模型回归外，须用一个当前失败的真实 GLB + 一个正常 GLB 对比：首次加载、连续切换、内存峰值、显存占用、FPS。静态检查在通过前记 partial。
