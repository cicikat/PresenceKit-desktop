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
- [x] 查原资源仓库映射与配置，恢复 UUID/名称/材质/配饰实际依赖，输出逐模型可追溯清单。
- [x] 扩展严格转换工具，写入新候选目录，保存原 MOC/曲线/源哈希、解码尺寸与缺件；不覆盖现有成品。
- [x] 按系列进行真实 Core 画面/嘴眼/头手/配饰与原生动作、停止/卸载验收；逐模型标明 full/base-only/partial/blocked。
- [x] 安装已验收模型，更新资料交接、客户端文档与转换测试并提交工具；未恢复项目留下准确阻塞证据。
A 验收证据：33 项相关回归通过；playback-report.json 四组真实浏览器播放通过（Pet/Room，各含可用/不可用分析），嘴部峰值约 0.63–0.68。路径 .tmp/hlr-playback-2026-10-25；实现 playbackLevel.ts、usePlaybackLevel.ts、VoiceMessageBar.tsx、Live2DStage.tsx、Live2DCallStage.tsx；说明 docs/live2d-playback.md。结束嘴部需等待源原生淡出稳定，已改为有界状态等待，未修改原素材曲线。

A 完成：109 个测试文件 / 593 项全量通过；tsc + Vite production build 通过（仅既有 chunk 大小提示）；原生浏览器回归 11 表情/26 动作、点头回 Idle、enter-loop-exit、TTL、口型、重载和 DPR 变化通过。CRLF 定向 diff stat 与 ignore-cr-at-eol 一致。

B 进度：原始 CCCC/ZZZ4 仓库已按结构解析 64,214 条记录，不依赖历史 work/repository.bin（其多出 17 尾字节）。完成 8 个无重复槽候选，全部通过真实 Core/Pixi 画面/动作/嘴部/重载浏览器 r3；已打开 8 模型联系图目检，无占位或错贴片。原生无遮罩卡面卸载暴露库 clippingManager.release 空引用，已在 motionAdapter 兼容边界修复并加 2 回归。新提取器已从原 Resources.mpkinfo 完整提取 51,553 条且无报错；版本往返比较仍在验证，未把初始失败快照当最终基线。

B 最终证据：8 候选共 38 表情/81 动作逐一确认加载/实际启动、嘴部和重载通过（资料根/批量模型转换/2026-10-25-validation-final/validation.json）；联系图已目检，8 模型安装到 library 与 public/live2d/models，installed-models.json 逐文件核对。402 缺依赖、64 配饰绑定、2 配置歧义保留 blocked。原包全量重提 51,553 条、仓库 64,214 条，roundtrip-check 对比 0 新增/0 改变/0 移除/476 不变。

用户后续收敛：先恢复现有素材，建立固定验证和新版包内容对比，并教后续 agent。已交付 extract/recover/check/install 四步工具、来源及版本清单和资料根 agent.md/批量交接；未获得的新纹理不伪造完成。

实现证据：scripts/import-hlr-live2d.py:36（完整资源记录）/101（配置资产归属）/137（保真转换）；scripts/recover-hlr-models.py:22（稳定配置名称与内容差异）/36（逐模型核对）；src/shared/live2d/motionAdapter.ts:20（无遮罩释放）；docs/hlr-recovery-workflow.md（未来 agent 流程）。9 项新 Python 回归 + 4 项旧转换回归通过；597 项前端全量与 production build 通过；实际音频四组播放、静音、缺分析降级、重播/暂停/结束/卸载通过。无新后端/手机协议或落盘业务状态，无跨端影响；真实 Windows/Tauri/TTS/GPU 继续 observe。

最后复核：原叶瑄 11 表情/26 动作、点头回 Idle、进入/循环/退出、TTL、口型、卸载与动态 DPR 在停止源码写入后通过 .tmp/hlr-native-stable-2026-10-25。之前一轮被本轮规范换行触发的 Vite 热重载打断，未作为有效验收。播音修复提交 7e8ca94；本轮恢复工具与兼容修复随本单提交。

## C. 五人物分类（用户新增要求）

- [x] 按叶瑄、司岚、路辰、艾因、罗夏组织资料侧成品（含旧叶瑄基础版），移动前后核对所有文件哈希；客户端单层目录继续符合加载器契约。
- [x] 新版包审计、差异清单、安装工具携带相同人物分类和可追溯匹配依据；无法识别或公共素材标记待核对，不强行归入人物。
- [x] 更新基线与交接/使用说明，补分类回归并提交；其余已暂存工作保持范围明确。

C 验收：资料侧成品按用户顺序为 1/1/1/3/3，含旧叶瑄基础版，共 9 个；organize-hlr-models.py 移动前后完整树哈希一致；208 个运行与来源清单文件再核对客户端副本完全一致（资料侧旧 README 未安装，不计入运行文件）。分类清单位于资料根/批量模型转换/2026-10-25-five-characters；全部 476 配置纳入清单，双人卡面双索引，7 公共/未知别名保留 needs_review。13 项恢复工具回归 + 4 项原转换回归通过；runtime-acceptance-matrix 测试通过，新增 automated 项，真实 Windows 项保留 not-run。脚本、工单与文档随本单独立提交；无跨端影响。
