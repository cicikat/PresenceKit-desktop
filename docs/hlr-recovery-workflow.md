# HLR 版本对比与模型恢复工作流

固定协议：`hlr-extraction-v1` → `hlr-recovery-v1` → `hlr-browser-v1`。从客户端仓库根用 PowerShell 执行；运行资产不进 Git，原 APK、解包和分类硬链接只读。所有输出使用新目录，工具拒绝覆盖。

Python 依赖按 `python -m pip install -r scripts/requirements-hlr.txt` 安装，浏览器按 `python -m playwright install chromium` 准备。Node 依赖使用本仓锁文件；Core 使用本机已安装且获授权的运行时，不提交资源或 Core。中文命令输出可用 `python -X utf8`。

## 1. 新版包提取

```powershell
python scripts/extract-hlr-resources.py --apk '<新版APK或ZIP>' --output '<新的提取目录>'
# 已解压 APK 时也可直接输入 assets，不需要重新解压整个 APK：
python scripts/extract-hlr-resources.py --assets '<已解压APK的assets目录>' --output '<新的提取目录>'
```

只读取 `assets/Resources*.mpk` 和 `Resources.mpkinfo`，不运行游戏或旧程序。每条资源保留包内路径、pack/offset、压缩前后 SHA-256、大小和类型；资源仓库按完整记录结构恢复 UUID、名称、目录、类型和依赖。未知版本、越界、重名、解压或长度异常必须报错，不能绕过检查。

原提取脚本用 `find(UUID)` 取第一次出现位置，会误把前一条依赖数组当名称记录。新解析器验证 v1 三张字符串表、表头声明的记录数（本包 64,214 条）和最终字节位置；当前 CCCC/ZZZ4 包尾 20 字节及 MPK 索引尾部 16 字节仅按已观察格式隔离，不声称已验证其校验算法。直接 MESSIAH 包裹的 JSON 按版本和精确长度取原始内层字节，不能把它误判成缺表情。

## 2. 审计、对比与转换

```powershell
python scripts/recover-hlr-models.py --source '<新的提取目录>' --output '<新的恢复快照>' --baseline '<上一版恢复快照/models.json>' --convert-ready
# 第一版没有 baseline 时省略 --baseline。
```

`models.json` 为逐模型真值清单，包含原配置哈希、每条依赖的 UUID/来源/内容哈希、缺件、重复槽和状态。`model-diff.json` 列出 added/changed/removed/unchanged/newlyResolvable/regressed。比较按配置与依赖字节内容，忽略 UUID、pack 和 offset 位置变化；不能只比较文件名、数量或时间戳。removed 只是新版包没有，不会删除旧成品；missing_local_resource 只是本包未提供，不能断言上游已经删除。

人物顺序固定为 **叶瑄、司岚、路辰、艾因、罗夏**。`hlr_characters.py` 以完整资源名、明确人物缩写和卡面命名规则记录分类依据；审计的 classification、character-catalog.json、summary 和版本差异的 byCharacter 使用同一规则。双人物卡面同时进入两人的索引，实体文件保存在主要人物目录；公共/非标准别名不猜归属，标为 needs_review。分类标签不参与素材内容指纹，补充标签不会伪造新增/更新模型。

只有依赖唯一齐全、没有重复贴图槽和专用材质的模型自动生成 `runtime/<模型ID>/`。`candidate_runtime` 仍需下一步。`blocked_accessory_slots` 不能统一加 `--base-only`，透明占位不是完整恢复。缺依赖、歧义配置、未知格式和专用材质保留阻塞证据。卡面没有嘴部参数时必须标明“不支持口型”，不能制造虚拟嘴参数冒充已支持。

## 3. 使用同一浏览器验收

先启动本仓 Vite（`npm.cmd run dev`，1420），确认本机 Cubism Core 已安装：

```powershell
python scripts/check-hlr-models.py --snapshot '<恢复快照>' --output '<新的浏览器证据目录>'
```

它校验运行目录来源清单哈希，通过拦截浏览器资源请求读取候选目录，无需先安装；使用真实 Core/Pixi/React 和生产舞台，逐一加载表情/动作、检查实际嘴参数、卸载重载，记录 `validation.json` 和截图。Tauri 传输为模拟，不连接后端、不改用户偏好。`browser_pass` 不是完整画面验收或真实 Tauri 验收。

后续 agent 必须打开每个模型的 initial/preview 截图，检查脸、嘴眼、头发、手、衣服、透明边缘和配饰；有错图/缺件继续排查，不得只凭脚本绿灯发布。口型播放链的固定回归另执行 `python scripts/check-live2d-playback.py --output '<新的播放证据目录>'`，覆盖生产桌宠/通话、实际 HTMLAudio/WebAudio、静音、分析缺失、重播/暂停/结束/卸载。Windows 原生双窗、真实 TTS/GPU 和发行包必须单独标记 observe/not-run。

## 4. 安装与交接

通过哈希、浏览器和逐图目检后，才安装到资料侧 `可导入模型/<人物>/<模型ID>/` 与客户端 `public/live2d/models/hlr_<模型ID>/`：

```powershell
python scripts/install-hlr-models.py --snapshot '<恢复快照>' --validation '<浏览器证据目录>' --library '<资料侧可导入模型目录>' --reviewed-models '<已目检模型ID1>' '<已目检模型ID2>'
```

该工具核对浏览器指纹、配置及素材来源哈希；目标不存在才写入，完全相同副本可重验，存在不同文件则停止。为避开 Windows Vite/杀毒扫描对目录 rename 的锁，直接复制各引用，最后才发布 model3.json。已有同 ID 升级应保留旧目录，使用带版本的新 ID，不覆盖正在使用的模型。安装后保存 `installed-models.json`，不替用户切换当前角色或模型。

旧成品首次整理使用下列命令；它只移动指定资料库内的完整模型文件夹，先检查绝对路径范围，再核对移动前后的所有内容哈希。客户端加载器仍使用单层目录，不能跟着嵌入人物子目录。

```powershell
python scripts/organize-hlr-models.py --snapshot '<恢复快照>' --library '<可导入模型目录>' --output '<新的五人物清单目录>' --organize-library
```

每轮保存：提取快照、恢复快照、baseline/diff、validation.json、截图、目检说明和已安装目录清单。新包只处理新增/内容变化/新增可恢复项；工具升级或验收协议变更应重验相应旧项。提交脚本、测试和说明，素材/Core/凭据不进 Git；保留其它工作区修改。

回归顺序：`python scripts/test_hlr_live2d_import.py` → `python scripts/test_hlr_recovery.py` → 统一浏览器验收；客户端驱动变化再运行相关前端测试和 production build。不能用历史通过记录给新版背书。

本轮 Windows 全量测试使用 `npm.cmd test -- --maxWorkers=2 --testTimeout=15000`，避免默认并发与软件 WebGL/大型 GLB 测试争用资源造成超时。依次完成模型实播、全量测试和构建；超时必须重验，不可据此直接标模型通过。

## 5. 重复槽的逐模型恢复（叶瑄补充）

blocked_accessory_slots 是自动转换停止点，不是调查终点。叶瑄存在眼睛与游戏配饰混用同一重复槽、服装/腿部放在额外槽的情况。不能批量隐藏这些槽后，只凭动作与口型测试通过就发布：生日版会没有眼睛，魔法师和冰峰会缺腿。统一浏览器验收不能替代逐图目检。

先用原 MOC 的 Core 数据检查每个槽，再记录原图集绑定：

```powershell
python scripts/inspect-hlr-slots.py --source '<提取目录>' --snapshot '<完整审计快照>' --output '<新的槽证据目录>' --models '<源配置ID1>' '<源配置ID2>'
python scripts/recover-hlr-reviewed-slots.py --source '<提取目录>' --snapshot '<完整审计快照>' --slots '<槽证据目录/slots.json>' --bindings '<逐模型atlas-bindings.json>' --output '<新的主体候选快照>' --reviewed-models '<已审查源配置ID1>' '<已审查源配置ID2>'
```

slots.json 保存原 MOC SHA-256、逐 drawable 的槽/UV/部件/默认可见性和参数。atlas-bindings.json 使用 hlr-slot-bindings-v1：models 以源配置 ID 为键，每项包含原配置 fingerprint；slots 包含整数 slot、准确资源名 resource、完整网格 ID 列表 drawables 和可审核 evidence。新版必须重新读 MOC、源图集与画面，不能照搬旧 UV。配置或任一源依赖改变会拒绝旧审计；绑定的网格集合、源资源唯一性也须验证。主体变体指纹包括额外绑定图集内容哈希，共享眼图变化也应比较变体，而不只比较原配置。

2026-10-25 的旧包找回 yexuan_eyemask00 眼图、yexuan_suxieben 素描本、yexuan_magic_ac2_01 下半身、yexuan_bingfeng2 腿/披风；当时冰峰眼部 UV 不匹配通用眼图而保留 blocked。2026-10-27 增量素材新增调查找到了 yexuan_eyemask05 专用布局，必须按新版实际画面重验后更新状态，不能沿用旧 blocked 或拿通用眼图充数。

该工具生成 _base 主体变体，未解决的冠饰、狐耳、帽子或额外换装槽继续列入 omittedTextureSlots，不能称全配饰完整恢复。原 MOC、动作、物理不改；已恢复槽移除透明占位，每个补图保存源/输出哈希。候选继续用第 3、4 步验收/目检/安装；无眼、错眼、缺主体衣物者，即使 browser_pass 也不安装。需比较浅色背景，深色裤子可能与默认深色背景混在一起。

完整原包 baseline 保留全量配置；主体候选快照只是选定变体，不能替换全量 baseline。今后先比较全量原包，主体变体按该槽证据协议重建，再比较变体 models.json。保留 visual-review.json 的失败原因，而不只交付通过项。

## 6. 下载补丁、精确 UV 和配饰装配（2026-10-27）

下载补丁索引可能没有 pack/offset。保留 sourceFile、origin、sourceIdentity 和原始/输出 SHA-256，缺失字段为 null，不伪造包内位置。新纹理头包含原始尺寸、像素格式和 mip 数；逐层验证精确边界、解压长度与最大尺寸，仅导出与原始尺寸相符的最高 mip。支持已验证的 ETC2 RGB、ETC2 RGBA 和 raw RGBA，未知格式或尾部字节必须报错。

先对重复槽生成候选；有相近图集时追加精确三角网格审计。矩形 UV 包围盒可能误收不匹配图集，或因为图集包含未使用部件而漏选真实眼图。任何评分都不能替代原图裁片及实播目检。

```powershell
python scripts/inspect-hlr-slots.py --source '<叶瑄子库>' --snapshot '<全量审计>' --output '<新UV证据>' --uv-triangles --models '<待查源ID>'
python scripts/propose-hlr-atlases.py --source '<叶瑄子库>' --snapshot '<全量审计>' --slots '<新UV证据/slots.json>' --output '<新绑定候选>'
python scripts/recover-hlr-reviewed-slots.py --source '<叶瑄子库>' --snapshot '<全量审计>' --slots '<槽证据/slots.json>' --bindings '<审核绑定/atlas-bindings.json>' --output '<新转换候选>' --variant-suffix '_版本日期' --reviewed-models '<源ID>'
python scripts/assemble-hlr-variants.py --source '<叶瑄子库>' --snapshot '<全量审计>' --slots '<槽证据/slots.json>' --bindings '<审核绑定/atlas-bindings.json>' --candidates '<转换候选>' --output '<新装配候选>' --suffix '_版本日期'
python scripts/check-hlr-models.py --snapshot '<装配候选>' --output '<新浏览器证据>'
python scripts/make-hlr-contact-sheet.py --validation '<新浏览器证据>' --output '<目检联系表>' --phase initial
python scripts/make-hlr-contact-sheet.py --validation '<新浏览器证据>' --output '<目检联系表>' --phase preview
```

等待每个生产步骤完成后再读取其 JSON，不能把进行中的部分清单当最终结果。装配输出带输入文件哈希；工具算法变化也须换新输出目录，不能在已验收快照内补写。相同源配置的多个候选只交付最终选中的版本，原始完整审计保留不变。

配饰显隐由原 MOC 的 part 层级建立标准 pose3 和明确标记的本地静态表情预设，原 MOC、物理、原生动作曲线及原生表情不改。只有 marker-only part 能作为可切换锚点；没有安全锚点就不提供切换预设，任何原生眼睛的祖先 part 都不能被当配饰隐藏。眼镜与企鹅眼罩共享一个 part 时，由资源配置 EmeraldProfile.drawableVisibility 按准确 drawable ID 控制渲染可见性，普通表情保留当前配饰，选择无配饰预设恢复默认。舞台卸载恢复原 getter，不写原生 Core opacity 数组、骨骼或业务状态。此字段只用于本机资产，后端、管理面板和手机端没有新增设置或契约。

逐项记录原生表情数量与本地装配预设数量。未解决的配饰槽继续留在来源清单，不能把“主体可用”写成完整游戏换装。卡面、半身原作、Q 版头部、手部、烟花和道具分别归档；能加载的附属件不能作为完整皮肤安装，卡面原本没有嘴参数则标 unavailable。

两份同名配置必须比较实际配置名、配置哈希和全部依赖，不能按目录名随便选。已确认完整的一份可生成带明确选择依据的子审计；缺件的旧别名仍留在全量清单中。新增纹理或共享配饰变化时也应重新比较装配变体的图集来源哈希，不能仅依赖原 config/MOC 是否改变。

小山海的主体在 slot11/12/13，玩偶在 slot10；帝国的补充眼睛在 slot1，帝国 zero 在 slot2。不能按固定槽号判断眼睛或配饰。公共配饰须完整匹配 drawable 家族；其余槽搜索本模型原图集，疑难项保存精确三角 UV 证据。源图集含未使用部件会降低整体覆盖分，人工仍须看逐网格裁片与实播。单面辅助材质、缺少唯一匹配的换装和游戏渲染到纹理不能凭最高分硬绑。

## 7. 独立成品包与下轮交接

把最终批次按顺序输入，后面只替换本批已验收的同 ID；失败候选不能以旧通过记录顶替。目检 JSON 的 models 以最终 ID 为键，每项至少包含 fingerprint、category、status 和 reason。只有真正看过 initial/preview 与人物面部后才能写 visual_pass；卡面合成待恢复使用 partial。

```powershell
python scripts/package-hlr-reviewed.py --parent-snapshot '<全量原始审计>' --review '<最终目检.json>' --output '<新的独立成品包>' --batch '<候选快照1>' '<证据1>' --batch '<修复候选2>' '<修复证据2>'
```

成品内的 runtime 是运行模型，source-audit 保留字节不变的全量原始 baseline，evidence 保存实际截图及其 SHA-256，模型总览.html 可离线搜索。模型及部分截图使用派生目录间的硬链接节省空间，原始包未改；禁止在候选、成品或分类链接中原地写资产，改动必须复制到新目录。独立成品中的原始审计可作下一轮 baseline，含日期后缀的运行变体清单不能代替原包 baseline。

后续用 installed-models.json 识别本轮真正安装的人物，而非把所有配置/卡面/道具都计为皮肤。先原包增量比较，再按模型主体与附属层恢复，最后以最终运行配置、每个资产哈希和目检指纹共同决定可用性。安装前仍运行第 4 节的严格安装器，成品包本身不会自动切换用户角色。保留旧版本 ID。

交付为运行用 model3/moc3，不是可编辑 cmo3。布眼罩、绑带、玩偶样式、部分本地换装、绘画内容或原版卡面合成未因主体通过而完成。眼镜与企鹅眼罩的分离预设依赖本客户端 drawableVisibility，不能保证其它查看器识别扩展档案。默认主体的来源、像素、网格和原生曲线保留；实际 Windows Tauri/TTS/GPU 与发行包仍单独 observe。

## 8. 原生眼图必须做端点和表情目检（2026-10-28）

用户确认 d5 眼睛出现重叠眼线/横条。全量95个前端目录审计发现29个原生眼槽使用不兼容的 yexuan_eyemask06；并非只有槽4，帝国/零之帝国分别在槽1/2。原始00图在这些MOC的原生睁眼、半闭、闭眼和原生表情对比中正确对齐。本次只修复前端副本的纹理引用并保留原文件；原始包、MOC、动作、表情、物理不改写。不同布局的冰峰05、内嵌眼图等不能统一替换为00。00/04存在相近布局，本次记录的是经过验证的兼容原始绑定，不宣称原游戏唯一材质配置。

`propose-hlr-atlases.py` 的alpha覆盖率曾把“有像素”当作更高分依据，却无法判断采样到了哪一道眼皮。现在原生眼图不按高分自动接受，必须单独复核。精确已验证的模型、MOC哈希、槽位、原图SHA及前后配置SHA见 `docs/hlr-reviewed-eye-bindings.json`；新包遇到新MOC/UV/配置后不能只按模型名沿用。

`scripts/review-hlr-eye-bindings.py` 在实际生产舞台里分别做 before/candidate/installed；candidate 仅拦截纹理请求对比原图，不修改前端文件。原生眼参数端点、每个原生表情近景、动作与重载都要确认；头盔等遮挡时只在取证fixture中临时隐藏已确认非眼部祖先的配饰，并额外保存眼睛可见的对比。该隐藏与取证帧率限制不写入生产舞台。Core在更新后会loadParameters还原保存值，参数断言须在Core.update提交边界采集，不能用帧后保存值误判实际画面。

在浏览器和目检通过后，`scripts/repair-hlr-eye-atlases.py` 仅接受明确已复核ID；预检配置/MOC/旧纹理哈希及原始新纹理的身份，先完整备份，再新增独立命名PNG并原子更新配置/来源清单。它拒绝覆盖既有修复文件；旧PNG仍保留供回退。安装后用显式 `--models` 再跑 installed，验证真实新文件路径、145组左右眼端点、每条动作真实开始事件与重载；空模型列表必须报错。原始全量基线与原成品包不改写，也不能用本机修复副本替代下轮原包baseline。

```powershell
$eyeIds = (Get-Content docs/hlr-reviewed-eye-bindings.json -Raw | ConvertFrom-Json).models.id
python scripts/review-hlr-eye-bindings.py --archive '<素材库原始归档>' --output '<新的安装后证据目录>' --phase installed --models @eyeIds
```

本轮完整原副本、候选/安装后证据、逐项哈希及修复说明位于素材库“其他/眼部修复-20261028”。前端模型资源不入Git，新环境需自行恢复本机原始素材。浏览器使用真实渲染器但模拟传输，真实Tauri/GPU和发行包仍单独observe，无跨端业务协议变化。
