# HLR Live2D 转换与原生表现接入

2026-10-17。范围：单模型试点 + 通用可选模型档案；商业运行资产不进 Git，原始解包资料只读。

## 交付

- `scripts/import-hlr-live2d.py`：依赖核对、ETC2 RGBA8 纹理解码、运行目录与 SHA-256 来源清单，暂存目录成功后才发布；不覆盖已有输出。
- `modelProfile.ts`：按资产配置表情、精确动作、参数所有权、点击绑定。缺依赖不暴露动作能力。
- `nativeMotionPlayer.ts`：进入/保持/退出、TTL、异步加载取消、失败降级、模型切换与销毁。
- `useLive2DStage.ts`：已有 directive → 原生动作；档案模型在表达式/物理之后写未被原生拥有的参数。普通模型维持原更新位置。
- Room 的 Live2D 编辑面板：原生表情、26 个动作、配置动作的本窗预览、停止与关闭恢复。中英文语义 key 同步。

## 试点与边界

`yexuan_mingyun`：40 项依赖按资源名称齐全；MOC3 版本字节 1，已由本机 Core 6.0.1 实际渲染。

初次渲染暴露了模型配置的重复纹理槽：13 槽都指向主图；Core 检查显示槽 1–12 分别为 texture04、蒙眼布、头冠、眼镜、雪人、角、狐耳、玩偶、素写本等附属网格，直接加载会在头、手部显示错误主图碎片。不能以“依赖名称齐全”冒充完整外观还原。

交付 `hlr_yexuan_mingyun_base`：保留主角色的 166 个槽 0 网格，12 个尚未解析的重复配饰槽用清单记录的透明占位图明确省略。没有删除源模型网格、修改源骨架或改动原始资源；不宣称游戏配饰已恢复。

11 个原生表情、26 个动作可供预览；已有语义映射为 neutral/happy/surprised 及 nod/shake/lean_in/lean_back/speaking。映射由源名称推定并可在档案内调整，不增加后端心情或随机角色行为。手势 > 姿势 > 说话，单一原生动作通道；打断不保证完整播放旧动作退出段。

## 可重复验收

```powershell
npm.cmd test
npm.cmd run build
python scripts/check-live2d-browser.py --output <独立证据目录>
```

浏览器验收需本仓 Vite 已在 1420 提供服务、已安装 Python Playwright 的 Chromium、Core 与基础角色 runtime。脚本只模拟 Tauri 模型列表/偏好传输，实际使用生产 React hook、Pixi、Core、模型、纹理及动作；不会连接后端或改真实用户偏好。夹具放 `.tmp/`，报告和截图写到指定输出目录。

已验证：初始显示、原生微笑、点头后返回待机、前倾 enter→loop→exit、后仰 TTL 打断退出、实际音量口型、全部表情/动作加载巡检、原生保持阶段参数不被覆盖、卸载重载。软件 Chromium 渲染不等于真实设备 GPU 或 Tauri 验收。

未完成：其余模型批量恢复/转换、游戏配饰纹理映射、游戏专用混合效果、原版点击交互还原、真实 Tauri 双窗同步与发行包验证。静态检查不替代这些边界。

## 三面核对

后端：只消费既有 expression/gesture/posture/speaking/TTL，无新 WS/REST/IPC、授权或后端落盘设置。档案是模型资产，预览是本地艺术调试，不构造后端情绪事实。手机代码未消费本机 Pixi/模型目录，未增加手机能力。3D 与原有普通 Live2D 路径保留。
