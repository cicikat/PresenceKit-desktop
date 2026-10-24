# Live2D 播音口型修复（2026-10-25）

实际故障在播放链：VoiceMessageBar 在挂载时读取尚未创建的 Audio，导致音量监听未安装；Pet 把用户麦克风音量传给模型、getTalking 固定 false；驱动将零音量当作有效输入覆盖说话动作。模型本身具有 ParamMouthOpenY（0..1）、11 个表情、26 个动作。

播放器现在创建 Audio 时绑定独立分析图；playing 后采样实际输出 RMS，暂停、结束、错误、卸载取消采样并释放。重播复用同一媒体源，AudioContext 恢复失败时不把元素路由进不可用的分析图。浏览器 StrictMode 探测不会误取消播放。voice-volume 仅为本窗口短期展示事件，增加 available/playbackId，用于区分有效静音与分析缺失、隔离旧播放器释放。

Pet Live2D 使用已有 CharacterBehaviorState 的角色范围、msg_id、audio-start/audio-end 和正文生命周期；不再用麦克风驱动嘴。Room 与 Pet 共用输出音量读取，250ms 过期后只在确有说话状态时使用既有备用口型。有效静音保持闭嘴，缺分析不会伪装成静音。主窗口音频的跨窗播音状态沿用 character://behavior；音量数值保持本窗口，跨窗使用备用口型，不新增每帧 IPC。原生动作参数保护、优先级、淡出和 Idle 回归保留。

三面闭环：管理面沿用 desktop TTS、各场景 auto-play 和 performance_mapping；无新设置、effective state、持久化记录或观测端点。既有合成请求的鉴权、scene、队列/跨窗播放租约和角色/msg_id 保持。Flutter/Android 的独立播放与 mobile channel/ack/TTL 不变；3D 继续消费原行为事件，粒子继续消费麦克风。没有修改后端或手机代码，无跨端业务合同影响。

验证：`npm.cmd test -- src/shared/live2d src/shared/voice src/shared/character/behaviorState.test.ts`；`python scripts/check-live2d-playback.py --output .tmp/hlr-playback-2026-10-25`。后者使用生产 Pet/Room/VoiceMessageBar、真实 Core/Pixi/HTMLAudio/WebAudio，Tauri 与合成音频字节为夹具；覆盖有效静音、有声、分析不可用降级、麦克风隔离、说话动作、结束回 Idle、重复播放、暂停和卸载。

真实 Windows Tauri、用户 GPU/音频设备与用户 TTS 服务仍为 observe。HLR 其它模型与配饰恢复独立记录在本轮工单，不能把口型修复当作全素材还原。
