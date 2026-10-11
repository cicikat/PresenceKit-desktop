# Avatar 通用骨架映射与共享动作库

状态：代码施工完成；实模数值闭环通过；素材与真实窗口验收 partial/open。先完成 P1–P3 实际模型闭环，再接 P4。

## 范围与边界

保留 GLB、蒙皮、绑定姿态、材质、PNG 与现有 MotionLibrary / MotionPlayer。Skin 是外观；Rig 是层级和绑定契约；Motion 是独立公共资源；Avatar 是三者组合。不新增动作编辑器、EventBus、后端动作字段或另一套状态机。pelvis 使用既有 hips 语义，避免破坏现有配置。

## 施工与证据

- [x] P1：实读所有本机 GLB，识别 ARP/Rigify 特征；无法证明的 ARP Humanoid/Universal 导出模式标为 unknown。
- [x] P1：加入手指语义；通过层级、绑定矩阵、名称和唯一映射识别 direct/retarget/incompatible，禁止仅凭名称/数量判断。
- [x] P2：公共 character/motions/library.json；复用既有动作加载、重定向、遮罩和播放器；六个语义入口必须报告缺失，不复制皮肤动作文件。
- [x] P3：结构及绑定姿态稳定标识；有界版本缓存只保留成功映射/适配，不持有模型对象；失败可重试。
- [x] P1–P3：实际两套同骨架模型直接共享相同 clip，异构模型语义复用；记录原始模型 SHA256 和数值验收。
- [x] P4：已有 perform 头部/表情驱动公共动作入口；低频、冷却、缺失降级；特殊镜头互动不得随机触发；无素材不伪造完成。
- [x] P5：回归覆盖绑定姿态差异、可选手指缺失、断链拒绝、呼吸/结束恢复、角色切换与异步加载取消。
- [x] 三面检查：后端 performance_mapping 管理与 WS scope/关联/TTL，桌面诊断与手机既有消费；无新后端权限/情绪状态。
- [x] 文档同步、TypeScript、vitest、生产 build、Rust check； scoped commit。

## 验收门

实际模型数值复用验证不等于真实窗口视觉验收。环胸/托腮穿模、手掌接触电视机外壳、伸手与镜头近景、真实后端到 Tauri 演出均保持 open，直到存在真实素材及窗口证据。缺少动画资源时交付代码入口和明确缺失清单。

## 完成证据与未完成验收

- 原始电视机 v03 SHA256 保持 c7bfab94a9eeb89ad73e076a81d1cbc9ebb7d12cee36543d2b01de744b743da2。
- 共享 idle 为新提取的 76328 字节动作专用 GLB；原始 GLB、骨架、权重、材质和 PNG 未改。
- 电视机 v02/v03 使用同一个缓存 Clip，45 个语义关节；小指六节缺失被明确报告。
- full.glb 为 ARP-like、51 个语义关节；v006 为 Rigify-like，均可重定向。v008 实际断链被拒绝。
- 实模 120 秒回放验证呼吸、足部与停止恢复；不同链的中间骨旋转、缺指降级、异步取消、HMR 释放及 perform -> 播放器有定向回归。
- 数值证据见 2026-10-11-avatar-rig-validation.json。导入器和运行时设计见 ../docs/avatar-shared-motion-library.md。
- TypeScript、生产 build、cargo check 通过；全量 97 个文件、545 项测试通过（无未处理异常）。
- 全量测试曾发现旧 backend.test.ts 的三次 sendChat 缺响应夹具，已补齐 fixture reply/msg_id，未改后端生产实现。

下列是未完成的资源/真实验收，不计入代码完成勾选：

- [ ] head_tilt / thinking / arms_crossed / camera_reach authored 素材及进入/保持/恢复。
- [ ] camera_closeup 镜头编排和被打断后的机位恢复。
- [ ] 环胸、托腮的衣服/外壳/手指接触与穿模视觉验收。
- [ ] 真实后端 perform -> Windows Tauri、换皮肤/窗口生命周期验收。
- [ ] ARP 源工程 Humanoid/Universal 导出选项的原始工程证据；GLB 中保持 unknown。
