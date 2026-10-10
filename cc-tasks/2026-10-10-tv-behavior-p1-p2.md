# 电视机角色 P1/P2 施工单

范围：现有 Three.js Idle + 微动作、桌宠/Room 聊天行为、五张 PNG。
不修改 GLB、骨架、权重；不新增框架、后端能力或用户设置。
参数集中；程序化偏移在 Mixer 前撤销，基准来自本帧 Mixer。

## 审计与方案（先于施工）

- [x] 源目录只有五张命名 PNG 和 SVG/大图，无 GLB；客户端已有 TV v02/v03 GLB、PNG 副本和 screen.json。
- [x] v03 仅 idle：203 channels，只有两条脊柱旋转为 121 采样，其余多为恒定两帧。
- [x] Room 已有 Idle、screenDriver、WS/文本/TTS presenter；Pet 没有 Idle/screenDriver。
- [x] GLTFLoader 用 sanitized name，并保留 userData.name；当前屏幕精确 mesh.name 对原始节点名会失配。
- [x] ChatPanel 通过 pet snapshot 上报 thinking；Pet 模型只吃 canonical 的固定说话计时，不消费流/TTS。
- [x] VoiceMessageBar 已有实际播放开始/结束回调及跨窗口播放队列，可复用实际生命周期。

依赖顺序：资产/事件审计 → P1 随机短动作与 Pet Idle → P2 仲裁/屏幕/语音 → 回归与预览。
P1：head、body 各自随机间隔，smoothstep 缓入/停顿/缓出，head quaternion 阻尼模拟惯性。
Idle 原有脊柱轨道继续播放；仅 chest/shoulder/head 上身叠加，腿/髋不写。
P2：audio 优先于短文本反馈，文本反馈优先于 waiting/thinking，最后有效情绪/normal。
请求/stream/播放都有独立 ID 与 TTL，结束只释放自己的 ID，不能清空新任务。
情绪仅 StateEngine mood、HTTP emotion、有效 perform.expression；不读取关键词。
PNG 和身体各自驱动；保留情绪作为基线，活动结束后恢复，头/胸缓回。

## 三面检查

后端只读核对原 desktop/chat、WS stream/msg_id/perform、管理面 TTS/performance_mapping；
手机只读核对 TTS/settings/relay；不新增后端状态、队列、trace、设置，故无新增观测端点。
新增仅桌面内部行为通知，保持 send_chat 参数及服务器协议原样；跨窗口内部事件须同步接口文档/总账。
群聊、Dream、非当前角色事件不得驱动单角色；孤立 delta/end 不推断归属。

## 施工/验收

- [x] P1 参数/调度集中，Pet 播放现有 Idle，保留 Mixer 基线。
- [x] P2 request/stream/TTS 关联、明确优先级、emotion 保留、超时/角色切换清理。
- [x] 修复真实 GLTF 节点匹配；Room/Pet 各自加载与释放 PNG driver；使用五张现有 PNG。
- [x] 120s Idle/Mixer、随机暂停、thinking/reply/TTS-end/emotion/races/scope 回归。
- [x] TypeScript、生产构建、浏览器真实 GLB/PNG 渲染预览。
- [ ] Windows Tauri 实际聊天/TTS、多窗口热切换与鞋底/衣服观感（未运行前保留 open）。

风险：上身侧倾表现重心转移，不添加足底 IK；不能纠正输入动画自身的接地问题。
PNG 是整帧切换，身体缓出独立；合成准备/播放失败不能卡住 speaking。
私有 GLB/PNG 继续留在 gitignore 目录；提交可复现配置模板与验证，不提交模型或个人素材。

## 完成证据

- 27 个测试文件 / 204 项通过，覆盖真实 v03 AnimationMixer 的正常 Idle、恒定轨道、动作切换、120 秒无累积；纯状态测试覆盖旧请求、旧播放、迟到事件、超时、显式情绪和无关键词推测。
- npx.cmd tsc --noEmit、npm.cmd run build 通过；已有包大小提示。
- 最终浏览器测试运行 120000ms，真实生产 Model3DStage + v03 GLB + 五张 PNG；transport/TTS 合成仅 fixture，HTMLAudioElement 实际播放。Idle 2756 帧，scale 0.997000003..1.002999999，程序化动作造成足部位移 0；头部最大偏移 0.01727rad、胸部 0.00819rad。连续反馈最终 4488 帧，error=[]，仅已有 Clock 弃用提示。
- 屏幕顺序 normal → thinking → speaking → normal，可信 angry/sad 在语音结束及流式结束后保留。截图与数值报告在忽略目录 .tmp/tv-{normal,thinking,speaking,angry,sad}.png 和 .tmp/tv-behavior-browser-report.json。
- 输入五张 PNG 已逐字节复制到本地 public/room/character，1024×1024；旧 PNG/sidecar 备份在 .tmp/tv-behavior-assets/2026-10-10T06-53-10.345Z。v02/v03 GLB 未改。
- 无服务器/手机接口变化；新增桌面内部事件已同步本仓接口文档及跨仓总账。Windows Tauri/真实后端/真实合成/多窗口观感保持 open，不能用 fixture 代替验收。

参数：头 yaw 0.045rad（约2.58°）、pitch 0.025rad；胸 roll 0.012rad（约0.69°），肩位移 0.0008 模型单位。头待机间隔5–13秒，身体8–19秒；各自随机 attack/hold/release。此处使用当前骨骼轴向映射，不照搬参考模型角度；不新增髋/腿位移。

复现：npm.cmd test -- src/shared/character src/windows/room src/windows/pet src/shared/pet src/shared/voice src/windows/chat/chatRequests.test.ts src/shared/api/realityMessageScope.test.ts；启动本仓 Vite 后 node scripts/tv-behavior-browser.mjs。真实 GLB 回归仅在私有资产存在时运行，fresh checkout 明确 skip；浏览器验证需要私有资产和本机 Playwright。