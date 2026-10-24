# HLR 原素材恢复与 Live2D 口型修复

日期：2026-10-25。用户授权：修复实际使用只有待机、说话不张嘴；本轮继续恢复剩余模型。

## 范围与边界

先完成客户端播放链修复并独立提交，再恢复 HLR 剩余模型。原始下载/解包/分类硬链接只读；运行资产保存在资料侧新的输出目录并由 Git 忽略。不得把透明占位、猜测贴图或只有静态检查的模型写成完整还原。保留既有共玩/传感器修改。

## A. 口型与说话动作（前置）

- [x] 只读定位根因并浏览器复现：Pet 误消费麦克风；VoiceMessageBar 挂载时 audioRef 为空导致分析监听未安装；有效零音量覆盖说话动作。真实 Core/Pixi 复现：talking=true/volume=0 嘴为 0；volume=0.8 嘴为 0.64；模型嘴参数 index=38/range=0..1，11 表情/26 动作。
- [x] 修复播放分析生命周期、暂停/结束/失败/重复播放清理；区分有效静音与无可用分析。验收：纯逻辑回归 + 实际 HTMLAudio 播放夹具。
- [x] Pet 接入已有角色播音/对话状态与实际输出音量；Room 共用音量消费；保护原生动作参数。验收：嘴部、talk01、回到待机、缺分析降级、麦克风不驱动嘴。
- [x] 三面闭环：管理面沿用 TTS/自动播放/表现映射；后端/手机业务合同无新增；检查角色/msg_id、取消、生命周期、既有播放队列和 3D。同步相关文档及遗留边界。
- [x] 顺序运行回归、类型/构建，核对 CRLF 与定向 diff，独立 commit。真实 Windows/Tauri/GPU/用户 TTS 服务验收保留 observe。

## B. 原素材恢复（依赖 A 完成后发布）

- [x] 初筛：51,553 索引条目；475 MOC3、476 配置、12,697 动作、380 物理、2,136 引擎纹理；当前仅 yexuan_mingyun 的 40 项依赖按已恢复名称全匹配。334 配置重复贴图槽、1 配置含 drawableSettings；缺名称不等于缺素材。
- [ ] 查原资源仓库映射与配置，恢复 UUID/名称/材质/配饰实际依赖，输出逐模型可追溯清单。
- [ ] 扩展严格转换工具，写入新候选目录，保存原 MOC/曲线/源哈希、解码尺寸与缺件；不覆盖现有成品。
- [ ] 按系列进行真实 Core 画面/嘴眼/头手/配饰与原生动作、停止/卸载验收；逐模型标明 full/base-only/partial/blocked。
- [ ] 安装已验收模型，更新资料交接、客户端文档与转换测试并提交工具；未恢复项目留下准确阻塞证据。
A 验收证据：33 项相关回归通过；playback-report.json 四组真实浏览器播放通过（Pet/Room，各含可用/不可用分析），嘴部峰值约 0.63–0.68。路径 .tmp/hlr-playback-2026-10-25；实现 playbackLevel.ts、usePlaybackLevel.ts、VoiceMessageBar.tsx、Live2DStage.tsx、Live2DCallStage.tsx；说明 docs/live2d-playback.md。结束嘴部需等待源原生淡出稳定，已改为有界状态等待，未修改原素材曲线。

A 完成：109 个测试文件 / 593 项全量通过；tsc + Vite production build 通过（仅既有 chunk 大小提示）；原生浏览器回归 11 表情/26 动作、点头回 Idle、enter-loop-exit、TTL、口型、重载和 DPR 变化通过。CRLF 定向 diff stat 与 ignore-cr-at-eol 一致。
