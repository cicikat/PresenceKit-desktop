# HLR 版本对比与模型恢复工作流

固定协议：`hlr-extraction-v1` → `hlr-recovery-v1` → `hlr-browser-v1`。从客户端仓库根用 PowerShell 执行；运行资产不进 Git，原 APK、解包和分类硬链接只读。所有输出使用新目录，工具拒绝覆盖。

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

## 5. 重复槽的逐模型恢复（叶瑄补充）

blocked_accessory_slots 是自动转换停止点，不是调查终点。叶瑄存在眼睛与游戏配饰混用同一重复槽、服装/腿部放在额外槽的情况。不能批量隐藏这些槽后，只凭动作与口型测试通过就发布：生日版会没有眼睛，魔法师和冰峰会缺腿。统一浏览器验收不能替代逐图目检。

先用原 MOC 的 Core 数据检查每个槽，再记录原图集绑定：

```powershell
python scripts/inspect-hlr-slots.py --source '<提取目录>' --snapshot '<完整审计快照>' --output '<新的槽证据目录>' --models '<源配置ID1>' '<源配置ID2>'
python scripts/recover-hlr-reviewed-slots.py --source '<提取目录>' --snapshot '<完整审计快照>' --slots '<槽证据目录/slots.json>' --bindings '<逐模型atlas-bindings.json>' --output '<新的主体候选快照>' --reviewed-models '<已审查源配置ID1>' '<已审查源配置ID2>'
```

slots.json 保存原 MOC SHA-256、逐 drawable 的槽/UV/部件/默认可见性和参数。atlas-bindings.json 使用 hlr-slot-bindings-v1：models 以源配置 ID 为键，每项包含原配置 fingerprint；slots 包含整数 slot、准确资源名 resource、完整网格 ID 列表 drawables 和可审核 evidence。新版必须重新读 MOC、源图集与画面，不能照搬旧 UV。配置或任一源依赖改变会拒绝旧审计；绑定的网格集合、源资源唯一性也须验证。主体变体指纹包括额外绑定图集内容哈希，共享眼图变化也应比较变体，而不只比较原配置。

实际找回 yexuan_eyemask00 眼图、yexuan_suxieben 素描本、yexuan_magic_ac2_01 下半身、yexuan_bingfeng2 腿/披风；按单模型 UV 和实际图像绑定。冰峰眼部 UV 不匹配通用眼图，撤销错误绑定并保留 blocked，不能用同名人物的其它眼图充数。

该工具生成 _base 主体变体，未解决的冠饰、狐耳、帽子或额外换装槽继续列入 omittedTextureSlots，不能称全配饰完整恢复。原 MOC、动作、物理不改；已恢复槽移除透明占位，每个补图保存源/输出哈希。候选继续用第 3、4 步验收/目检/安装；无眼、错眼、缺主体衣物者，即使 browser_pass 也不安装。需比较浅色背景，深色裤子可能与默认深色背景混在一起。

完整原包 baseline 保留全量配置；主体候选快照只是选定变体，不能替换全量 baseline。今后先比较全量原包，主体变体按该槽证据协议重建，再比较变体 models.json。保留 visual-review.json 的失败原因，而不只交付通过项。