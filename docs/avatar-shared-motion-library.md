# Avatar 通用骨架与共享动作库

工单：`../cc-tasks/2026-10-11-avatar-shared-motion-library.md`。代码和本机实模数值验证已接入；真实窗口、真实后端及动作穿模验收保持 open。

## 资源边界

- Skin：GLB 内网格、蒙皮、材质、头发和屏幕 PNG；原件不改写。
- Rig：Humanoid 语义映射、真实父子链及绑定矩阵。沿用 `hips` 表示 pelvis。
- Motion：`public/room/character/motions/` 中的一份公共动作 GLB。
- Avatar：Skin + Rig + Motion。GLB 不必转换 VRM，不要求给 ARP 或 Rigify 改骨名。

电视机 v02/v03 是 Rigify 风格 deform rig；`full.glb` 的 `root.x`、`arm_stretch.*`、`c_thumb*` 是 ARP 风格。generator 是 Blender glTF I/O，仅凭 GLB 不能证明 ARP Humanoid/Universal 导出选项，`exportMode` 保持 unknown。ARP 的 Humanoid/Universal 是源工程的导出选择，不是新的前端骨骼标准；继续遵循其烘焙和导出规范。

## 兼容性与缓存

`CharacterPerformer` 在站姿、Mixer 和微动写入前捕获 `RigProfile`。蒙皮模型以 `Skeleton.boneInverses` 还原绑定矩阵；动作专用 GLB 使用导出的参考节点姿态。语义包含躯干、双臂、双腿、脚、眼及可选五指三节；电视机只存在四指，小指明确缺失。

direct 必须同时满足唯一语义映射、父子链、humanoid 祖先闭包、绑定世界/局部矩阵和名字。矩阵允许 1e-4 的导出数值误差。数量或名字相同不够；重复骨名、过期显式映射、断链、负值/非均匀绑定缩放或缺少动作必需关节将禁用动作。缺少未使用关节不禁止整个 Avatar；缺少动画使用的可选手指会报告 partial。

不同 Rig 使用现有重定向核心，额外在 30 FPS 和原关键帧时刻烘焙语义世界旋转差，保留中间脊柱/扭转骨带来的旋转；目标实际父链决定输出局部旋转。单 clip 最长 120 秒、最多 8192 个采样时刻。它不提供接触 IK，也不保证不同身材的托腮/环胸接触；这部分需要离线校正和视觉验收。

Profile 32 项、适配结果 48 项、解析源 12 项，均为当前 WebView 内有界内存缓存，不新增落盘。缓存保存名字、矩阵、clip 等数据，不持有旧模型、骨骼、材质或 Mixer。Profile key 包括版本、结构/绑定姿态和显式覆盖；适配 key 还包括动作实际内容、遮罩、rootMotion 和 headEye。修改版本/姿态/clip 自动失效，失败不永久缓存。皮肤材质、网格或非语义头发骨变化不改变 humanoid Profile。显示用 Rig ID 的 hash 不是缓存唯一键；比较使用完整签名。

## 公共目录与导入

一次放置 `motions/library.json`，格式见 `examples/shared-motion-library.example.json`。每套皮肤不需要 `.motions.json`；既有侧车仍可按动作 ID 覆盖公共目录，公共动作文件不会复制。

`read_shared_motion_config` 读取固定的 `character/motions/library.json`，live 优先、打包资源兜底，canonical 路径必须留在 motions 中，UTF-8 文件不超过 256KiB。GLB 仍走既有 `read_room_motion_file`，保留原 20MB 限制。没有新 REST、WS、模型权限或远程下载。

现有 GLB 动作可以离线提取：

```powershell
node scripts/extract-shared-motion.mjs public/room/character/TV_Character_Rigged_v03.glb public/room/character/motions/tv-idle-v1.glb
Copy-Item docs/examples/shared-motion-library.example.json public/room/character/motions/library.json
```

脚本拒绝覆盖输入/已有输出，仅导出绑定骨架与原有动画，并记录源 SHA256，不生成假动作。FBX 需先在 Blender/ARP/Mixamo 管线烘焙到 glTF，再放入公共目录；运行时不加载 FBX。导入参考 `人类说明书/room-model-import-guide.md`。

## 表演与生命周期

Room 初次加载、换模型和 Pet 都加载公共目录，复用 MotionLibrary / MotionPlayer。每帧：撤销程序化叠加 → 撤销动作叠加 → idle Mixer → 外部动作 Mixer/加权采样 → performer 呼吸/表情 → 世界矩阵 → 物理链。显式 body off/procedural 保持禁用外部动作。动作不再依赖 PropertyMixer 每帧必写属性；常量轨道不会盖掉或累积另一个 Mixer 的姿态。停止还原当前底层姿态，计时器与引用在 dispose/HMR 时释放。

`AvatarMotionDriver` 只是已有播放器的选择器：`perform.head=tilt_l/tilt_r` 选择 head_tilt；思考状态或可信 thinking 表情选择 thinking（可用时回退 head_tilt）；可信 angry 允许 arms_crossed，强度决定动作混合权重。文本不做关键词情绪推断。句级表演仍由原 VN/实际音频开始拥有，char_id/reality/msg_id、队列、TTL 与 baseline/sentence 仲裁不变。

正常待机使用共享 idle（资源存在时），动作候选只包括 head_tilt/arms_crossed，20–40 秒选择间隔，信号触发成功后的冷却为 12 秒。camera_reach 只接受显式本地 `requestAvatarMotion`；camera_closeup 是单独镜头编排入口，目前返回未安装。后端现有 perform **没有**这两个相机动作字段，不能从 lean_in 或回复关键词伪造触发。

诊断快照扩展 rig 和 motions：ready、direct/retarget/incompatible、缓存命中、缺失关节和原因。沿用 `getCharacterDiagnostics/formatCharacterDiagnostics`，不新增管理端情绪状态、trace 或队列。诊断 UI/镜头互动按钮仍未新增。

## 三面闭环

后端管理已有 performance_mapping 开关和映射提供者，本单不新增推断或权限；检查了 `core/perform_mapper.py`、`core/turn_sink.py` 和管理 settings-center。桌面只消费现有受控信号与本地资源，不写 StateEngine 的情绪真值。手机当前没有 GLB 动作消费，无需增加 Flutter/relay 协议；Dream/群聊也不获得该动作入口。IPC 目录读是本地数据能力，后端鉴权 scope、ack、TTL、通知和 fanout 不变。跨仓总账记录 observe/roadmap，后端及手机代码未修改。

## 实际素材与验收

本机提取了一个真实 idle。两份电视机 GLB 使用同一个缓存 Clip，ARP 风格 `full.glb` 和叶瑄 v006 走语义重定向；v008 的实际断链导致禁用。私有素材测试在素材不存在的 checkout 会 skip，不能将 skip 算作实模通过。

仍需素材：head_tilt、thinking、arms_crossed、camera_reach 的进入/保持/恢复；camera_closeup 的镜头轨迹及打断恢复。没有这些资产时诊断为 unavailable。现有程序化微动保留，但不算上述 authored 动作完成。真实环胸/托腮穿模、镜头近景和后端到 Tauri 的演出为 open。
