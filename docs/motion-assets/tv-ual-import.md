# 叶瑄电视机 UAL 真实动作导入（2026-10-11，partial）

已完成真实 v03 环胸和聊天手势的浏览器播放；不是空 Clip 或随机骨骼。
源模型、蒙皮、UV、材质、屏幕侧车保持原件，只增加本机共享动作文件。

## 来源与实际包

- 作者 Quaternius；[原作者预览](https://quaternius.com/animviewer.html)。
- [UAL1 ZIP](https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip)。
- [UAL2 ZIP](https://opengameart.org/sites/default/files/universal_animation_library_2standard.zip)。
- 包内许可均为 CC0 1.0；原文保留在 UAL1-License.txt / UAL2-License.txt。
- UAL2 实际路径 Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb，43 Clips。
- UAL1 **没有 UAL1_Standard.glb**；实际路径 Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb，46 Clips。
- 原始 ZIP / 解包位于 .tmp/ual；Rokoko 未下载，也未提交任何表单。

| 语义 ID | 原 Clip | 秒数 | 播放 |
|---|---|---:|---|
| arms_crossed | UAL2 Idle_FoldArms_Loop | 2.5 | 循环，上半身，头部仍归 perform |
| talking | UAL1 Idle_Talking_Loop | 2.9333334 | 循环，上半身，头部仍归 perform |
| nod | UAL2 Yes | 2.5 | 单次，Clip 接管头部 |
| head_shake | UAL2 Idle_No_Loop | 2.5 | 循环，Clip 接管头部 |
| relaxed_lean | UAL2 Idle_Rail_Loop | 2.5 | 循环，仅预览，无栏杆接触承诺 |

所有导入动作均非 `_RM` Clip；丢弃位移/缩放，保留腿脚 idle。head_tilt 继续原 perform 偏头，
不新增动画文件。Idle_TalkingPhone_Loop 仅筛选为参考，未冒充托腮。
camera_reach 参考候选：UAL1 Interact / PickUp_Table；仍未做拿镜头交互，也未启用随机相机动作。

## 离线校正与共享

直接以源绑定旋转差重定向时，电视机双手落在背后，已判为失败。
scripts/bake-ual-motion.ts 以实际绑定骨段方向和双脚前向对齐参考姿态，再采样真实动画的
世界旋转变化，按目标真实父链烘焙 30 FPS。保留 Clip 原名、时长、时间变化和四指动画，
目标不存在的小指不生成。输出一份 quaternius-tv-v1.glb，约 375KB；不复制到每套皮肤。
tv-idle-v1.glb 保存目标原绑定骨架，现有 MotionLibrary 对 v02/v03 direct，其余骨架继续
通过既有共享适配器重定向；其它皮肤的接触/穿模没有视觉验收。

公共目录：public/room/character/motions/library.json。导入配置的可提交副本是
docs/examples/tv-authored-motion-library.json，原文件与派生 GLB 按仓库既有资产规则留在本机 gitignore。
源包摘要、Clip 列表及派生摘要见 provenance.json。许可证也已复制到本机 motions 目录。

复现：先运行 npm.cmd run dev，再在另一个 PowerShell 运行
`powershell -File scripts/prepare-ual-motions.ps1`。需本机 v03 GLB 与已安装 Playwright；
脚本只读源 GLB，派生输出/旧公共目录覆盖前留备份。不需要 Blender 或改源工程。

## 预览入口与运行结果

视频通话 → 编辑模式（🛠）→ 真实动作预览：逐个播放、暂停/继续、恢复待机。
预览期间隔离自动动作选择，退出编辑恢复 presentation；更换皮肤/销毁播放器释放引用。
正常 speaking 使用 talking，现有 perform nod/shake 选择真实动作；head_tilt 保持原能力。
idle 随机环胸最多保持六秒再淡出，不永久卡在环胸；不添加后端动作 ID 字段。

- scripts/tv-authored-motions-browser.mjs：真实模型、生产重定向/播放器/performer、React 预览，
  五个动作逐个实播，正面/侧面/进入/退出/恢复 idle 截图，.tmp/tv-motion-video 中有 WebM。
- scripts/tv-authored-stage-browser.mjs：真实生产 Model3DStage + useCharacterRig 帧循环；
  仅模拟 Tauri 资源 IPC，不连接后端。环胸/聊天、暂停/继续、恢复 idle 均通过。
- 生产舞台报告 .tmp/tv-authored-stage-report.json：持续帧观测，脚部增量 0，胸骨呼吸缩放
  约 0.997–1.003，无页面异常；只出现既有 THREE.Clock 弃用提示。
- v02/v03 实骨回归：双手交叉且位于身体前方，动作时间存在真实变化，腿脚保持不动。
- 全量 99 文件 / 552 测试通过；前端构建通过。Rust 无改动。

## 尚未完成与已见瑕疵

环胸没有独立抬手/放手 Clip，当前使用 900ms 插值淡入淡出。中段双手靠近，存在手指/宽袖
相互接触或局部穿插；最终姿态手腕和肩部装饰也需要继续精修。没有接触 IK，不宣称全程无穿模。
当前数据保证连续插值和恢复，**不等于自然进入/退出动画验收**。需要进一步错开双手轨迹或
补专用进入/退出关键帧，及更长时间多角度复查。
thinking 真实托腮、camera_reach 镜头交互、camera_closeup 编排仍缺失；relaxed_lean 无栏杆道具。
脚部增量 0 只证明上半身动作不带动脚，未实现地面求解/接触 IK。
真实 Windows Tauri、后端 perform 联调、发行包及其它皮肤视觉验收均未运行。

## 三面闭环

沿用管理面 performance_mapping、现有可信 perform 与实际 speaking 状态，不做文本关键词推断。
桌面只加载本机动作/预览，不增加配置总开关、落盘 schema、trace 或队列。
手机仍不消费 GLB 动作，无 Flutter/Android/relay 新合同；原 char_id/reality/msg_id、scope、ack、TTL
和 VN/音频仲裁不变。跨仓总账仅同步 observe/roadmap，不修改后端/手机代码。
