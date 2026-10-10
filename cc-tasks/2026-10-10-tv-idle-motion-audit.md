# TV v03 前端动作参考审计与最小修复

状态：实现与数值验证完成；真实 Windows/模型观感验收 partial/open。

## 边界与依赖

仅共享 CharacterPerformer 及 Room/Pet 更新入口、相邻纯逻辑测试、文档。
不修改原始 GLB、PNG、screen.json、骨架、后端或手机，不新增设置或落盘状态。
本仓内部动作修复，无跨端影响。顺序：参考/资产审计 → 基线修复 → 微动 → Mixer 回归 → 构建。

## 参考与现状差异（施工前已在聊天输出）

研究日期 2026-10-10，参考源码在线读取，未引入依赖或复制整套系统。

| 参考 | 源码机制 | 采用与保留边界 |
| --- | --- | --- |
| [avatar-stage idle.ts](https://github.com/rana-jatin/avatar-stage/blob/main/src/idle.ts) | 呼吸 4s、旋转幅度 0.008 rad；头 yaw 两频率 0.025/0.015 rad、pitch 0.015 rad；load-time base | 借鉴低幅多频率；其局部 Euler 和 viewer 的 idle→mixer 顺序不适合直接照搬 |
| [avatar-stage procAnim.ts](https://github.com/rana-jatin/avatar-stage/blob/main/src/procAnim.ts) | makeClipAdditive，普通动作相对参考帧；Idle variation 特意为 non-additive | 不把所有 Idle 当 additive；保留原 clip，仅叠加可撤销偏移 |
| [TalkingHead](https://github.com/met4citizen/TalkingHead/blob/main/modules/talkinghead.mjs) | 状态区分 idle/speaking；pose 可变等待 5–30s；身体与眼神/headMove 独立控制 | 借鉴说话权重缓变与错开时间尺度；不照搬其较大的全身动作或 RPM 轴向 |
| [Three.js 示例源码](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_animation_skinning_additive_blending.html) | base idle weight=1；additive 初始 weight=0；makeClipAdditive 与 crossFade | 保留当前单 Idle Mixer；用真实 Mixer crossfade 测试，不新建替代动画系统 |

Room：Idle Mixer → 外部 MotionLibrary Mixer → performer → world matrix → spring physics。
Pet：没有 Idle Mixer，只运行外部动作与 performer；不将 Room Idle 测试写成 Pet clip 已支持。
Idle 选择显式设置优先，其次 idle，其次非 morph-only 首个 clip；head/eye/physics 所有权仍沿用原过滤规则。
原 startIdleClip 会原地过滤 clip tracks，外部 MotionPlayer 则有独立 Mixer 和 fade 权重；本单未重构。

## 实际 GLB 证据

`public/room/character/TV_Character_Rigged_v03.glb` 的 idle 共 203 channels。
只有 DEF-spine.002/.003 rotation 各 121 采样；其余为两帧采样。
胸骨 translation/scale、髋部 TRS、两肩 TRS 经二进制 accessor 比较，逐分量跨度均为 0。
胸骨静止 quaternion 约 [0.0260853,0,0,0.9996597]；两肩约
[-0.05348,∓0.00186,∓0.74048,0.66994]，并非统一局部轴。
测试使用 GLB 原始树、静止 TRS、FLOAT accessor，骨名按 GLTFLoader sanitize，真实 AnimationMixer 回放；不加载材质/纹理。

## 根因和参数

PropertyMixer.apply 比较本帧与上帧缓存，相同则不调用 binding.setValue。
因此 animatedBoneNames 只能说明有轨道，不能证明每帧/每属性写回；原 += 会累积。
prepareFrame 在两个 Mixer 前恢复上一帧程序化层的基线，再保存本帧 Mixer 姿势并写相对偏移。
保留非均匀 scale；不以减小参数掩盖累积。

| 动作 | 参数/上限 |
| --- | --- |
| 呼吸 | 沿 mood 原周期；depth 上限 0.006；scale 倍率 ±0.003；位移 ±0.00036 模型单位 |
| 头部 | yaw 0.020 rad、pitch 0.012 rad、roll 0.006 rad；沿多频 noise，0.16s 阻尼 |
| 重心表现 | 胸骨侧倾 0.005 rad；noise 时间乘 0.32；不位移髋部或腿脚 |
| 肩随动 | noise 0.00025 + breath 0.00015 模型单位，时间乘 0.45 |
| 说话 | 0.4s 阻尼，头/胸/肩增益最多 1.35；安静后平滑返回 |

平移单位是归一化之前的模型局部单位，当前资产约米制；其他尺寸模型不保证毫米幅度。
轴来自加载静止姿势的模型 +Y/+X/+Z 到父坐标变换；不是骨骼局部 Euler 轴。
带 Idle 时不再先附加通用 standingPose，避免原腿部偏移改变动画的接地姿势；无 clip 路径保持原逻辑。
头指令保留现有幅度，改为轴校准 quaternion 与阻尼过渡，不添加新指令。

## 施工清单与验收

- [x] 阅读三个参考源码、现有所有权与更新链、真实 v03 静止轴/轨道。
- [x] 修复恒定轨道与缺失属性轨道下的逐帧累积，保留非均匀 scale。
- [x] 小幅头动、胸部侧倾、肩随动、说话增益，保留 GLB/PNG。
- [x] 正常 Idle 7200+帧、恒定轨道 7200+帧、rotation-only/非均匀 scale、Mixer action crossfade。
- [x] 相邻 performer/motion/clip/setup 回归、TypeScript、生产 build。
- [ ] 真实 Windows 两分钟观感、屏幕 PNG 不变、鞋底/衣服和动作热切换验收（open）。

风险：胸骨微侧倾只表示上身重心变化，不是全身重心转移/足底 IK。
不添加髋部偏移，双脚必须相对 Mixer 的原姿势不动；未保证任意输入动画本身接地。
真实网格、鞋底高度、衣服穿插和屏幕变形仍需窗口评审。
外部 MotionPlayer 的立即替换和 head/eyes yield 回收仍有旧的瞬时恢复路径，另单处理；本单 Mixer crossfade 不代表该入口完全无跳变。

验证结果：13 个测试文件、102 项测试通过；npx.cmd tsc --noEmit 与 npm.cmd run build 通过。两分钟为真实 Mixer 7200 帧的模拟时间，不是 Windows 墙钟观察。Rust 未变，本单未重复 cargo check。
